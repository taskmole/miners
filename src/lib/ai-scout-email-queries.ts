import { createServiceSupabase } from "@/lib/supabase-server";
import { formatRangeLabel } from "@/lib/weekly-summary-queries";

/**
 * The Friday "Your AI scout this week" email: its data shape, a sample for
 * the preview, the pure counting function, and the database reads.
 *
 * Same layout as weekly-summary-queries.ts on purpose. The counting is a
 * pure function of raw rows so it can be tested without a database, and the
 * template renders exactly the object the database produces.
 */

/** One customer today. Every AI table carries the column for when there are more. */
const CUSTOMER_ID = "miners";

/** The admin tab the email links to. Must match the Tab id in src/app/admin/page.tsx. */
export const AI_SCOUT_TAB = "ai-scout";

/**
 * Below this many listings rated by head office in a week, and with nothing
 * ready to accept, the email shrinks to a one-line nudge. The weekly learner
 * has too little to go on, so a full report would be mostly zeros.
 */
export const QUIET_WEEK_RATINGS = 5;

/** A rejection of a listing the AI scored at least this high is a big miss. */
export const HIGH_SCORE = 70;
/** An assignment of a listing the AI scored at most this low is a big miss. */
export const LOW_SCORE = 45;

/** How many of the most repeated notes to quote per kind of miss. */
const TOP_NOTES = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AiScoutNote {
  note: string;
  count: number;
}

export interface AiScoutMisses {
  count: number;
  /** Most repeated notes first. Empty when nobody wrote one. */
  topNotes: AiScoutNote[];
}

export interface AiScoutEmailSuggestion {
  title: string;
  status: "ready" | "held";
  /** Whole percentages, or null before the scoreboard has run. */
  before: number | null;
  after: number | null;
  heldReason: string | null;
}

export interface AiScoutEmailData {
  /** "Oct 9 - 16". Built once, so the email never formats dates itself. */
  rangeLabel: string;
  stats: {
    /** Distinct listings the AI scored in the last 7 days. */
    listingsScored: number;
    /** Distinct listings head office rated (point fix or overall verdict). */
    listingsRated: number;
    /** Whole percent of this week's point ratings where head office agreed. Null with none. */
    agreement: number | null;
    bigMisses: number;
  };
  misses: {
    /** Rejected although the AI scored them HIGH_SCORE or more. */
    highRejected: AiScoutMisses;
    /** Assigned although the AI scored them LOW_SCORE or less. */
    lowAssigned: AiScoutMisses;
  };
  /** Ready first, then held. */
  suggestions: AiScoutEmailSuggestion[];
  /** The active version's rating points, heaviest first. */
  weights: { label: string; weight: number }[];
  /** True renders the short "rate more listings" version. */
  quiet: boolean;
  appUrl: string;
}

/** A full week, for the preview. Every section renders. */
export const SAMPLE_AI_SCOUT_EMAIL: AiScoutEmailData = {
  rangeLabel: "Oct 9 - 16",
  stats: { listingsScored: 41, listingsRated: 23, agreement: 74, bigMisses: 4 },
  misses: {
    highRejected: { count: 3, topNotes: [{ note: "cellar", count: 2 }] },
    lowAssigned: { count: 1, topNotes: [] },
  },
  suggestions: [
    { title: "Add a new rating: street level vs basement", status: "ready", before: 62, after: 78, heldReason: null },
    { title: "Rate visibility lower when the entrance has steps", status: "ready", before: 62, after: 66, heldReason: null },
    { title: "Care more about distance (20% to 25%)", status: "held", before: 62, after: 61, heldReason: "No better than today" },
  ],
  weights: [
    { label: "Size fit", weight: 25 },
    { label: "Rent for the area", weight: 20 },
    { label: "Visibility", weight: 20 },
    { label: "Metro distance", weight: 15 },
    { label: "Street quality", weight: 10 },
    { label: "Cafes nearby", weight: 10 },
  ],
  quiet: false,
  appUrl: "https://theminers.vercel.app",
};

/** A quiet week, for the preview of the short version. */
export const SAMPLE_AI_SCOUT_EMAIL_QUIET: AiScoutEmailData = {
  ...SAMPLE_AI_SCOUT_EMAIL,
  stats: { listingsScored: 38, listingsRated: 4, agreement: 75, bigMisses: 0 },
  misses: { highRejected: { count: 0, topNotes: [] }, lowAssigned: { count: 0, topNotes: [] } },
  suggestions: [],
  quiet: true,
};

// ---------------------------------------------------------------------------
// The counting
// ---------------------------------------------------------------------------

/** Raw rows exactly as the database returns them. */
export interface RawAiScoutRows {
  /**
   * AI ratings created inside the window, plus every rating (any age) of a
   * listing that was assigned or rejected inside it. Duplicates are fine.
   */
  ratings: { id: string; place_id: string; blend: number; created_at: string }[];
  /** Head office feedback created or updated inside the window. */
  feedback: {
    place_id: string;
    kind: "point" | "overall" | "assign" | "reject" | "request";
    ai_value: number | null;
    human_value: number | null;
    note: string | null;
    created_at: string;
    updated_at: string | null;
  }[];
  /** Suggestions currently 'ready' or 'held'. */
  suggestions: {
    title: string;
    status: string;
    score_before: number | string | null;
    score_after: number | string | null;
    held_reason: string | null;
    created_at: string;
  }[];
  /** The active version's points jsonb, as stored. */
  activePoints: unknown;
}

function time(at: string | null | undefined): number {
  return at ? new Date(at).getTime() : NaN;
}

/** Inside the window, treating a missing timestamp as outside it. */
function inWindow(at: string | null | undefined, start: Date, end: Date): boolean {
  const t = time(at);
  return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime();
}

/** 0.62 or "0.62" to 62. Null stays null. */
function toPercent(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * The most repeated notes. Compared case-insensitively and with spacing
 * flattened, but quoted the way the first person wrote it.
 */
function topNotes(notes: (string | null)[]): AiScoutNote[] {
  const counts = new Map<string, AiScoutNote>();
  for (const raw of notes) {
    const note = raw?.replace(/\s+/g, " ").trim();
    if (!note) continue;
    const key = note.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { note: note.length > 80 ? `${note.slice(0, 77)}...` : note, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.note.localeCompare(b.note))
    .slice(0, TOP_NOTES);
}

/**
 * The score head office was looking at when they decided: the newest rating
 * made at or before the decision. A listing first rated afterwards falls back
 * to its newest rating, so a decision is never silently dropped.
 */
function scoreAtDecision(
  ratings: RawAiScoutRows["ratings"],
  placeId: string,
  decidedAt: string,
): number | null {
  const mine = ratings
    .filter((r) => r.place_id === placeId)
    .sort((a, b) => time(b.created_at) - time(a.created_at));
  if (mine.length === 0) return null;
  const before = mine.find((r) => time(r.created_at) <= time(decidedAt));
  return (before ?? mine[0]).blend;
}

/** Turns raw rows into the email's data. Pure: no database, no clock. */
export function buildAiScoutEmail(
  rows: RawAiScoutRows,
  start: Date,
  end: Date,
  appUrl: string,
): AiScoutEmailData {
  // ---- headline -----------------------------------------------------------

  const listingsScored = new Set(
    rows.ratings.filter((r) => inWindow(r.created_at, start, end)).map((r) => r.place_id),
  ).size;

  // A rating changed this week counts as rated this week: the row is updated
  // in place when someone changes their mind.
  const ratings = rows.feedback.filter(
    (f) =>
      (f.kind === "point" || f.kind === "overall") &&
      inWindow(f.updated_at ?? f.created_at, start, end),
  );
  const listingsRated = new Set(ratings.map((f) => f.place_id)).size;

  const judged = ratings.filter(
    (f) => f.kind === "point" && f.ai_value !== null && f.human_value !== null,
  );
  const agreement =
    judged.length > 0
      ? Math.round((judged.filter((f) => f.ai_value === f.human_value).length / judged.length) * 100)
      : null;

  // ---- big misses ---------------------------------------------------------

  const decisions = (kind: "assign" | "reject") =>
    rows.feedback.filter((f) => f.kind === kind && inWindow(f.created_at, start, end));

  const highRejected = decisions("reject").filter((f) => {
    const score = scoreAtDecision(rows.ratings, f.place_id, f.created_at);
    return score !== null && score >= HIGH_SCORE;
  });
  const lowAssigned = decisions("assign").filter((f) => {
    const score = scoreAtDecision(rows.ratings, f.place_id, f.created_at);
    return score !== null && score <= LOW_SCORE;
  });

  // ---- suggestions and weights --------------------------------------------

  const suggestions = rows.suggestions
    .filter((s) => s.status === "ready" || s.status === "held")
    .sort(
      (a, b) =>
        (a.status === "ready" ? 0 : 1) - (b.status === "ready" ? 0 : 1) ||
        b.created_at.localeCompare(a.created_at),
    )
    .map((s) => ({
      title: s.title,
      status: s.status as AiScoutEmailSuggestion["status"],
      before: toPercent(s.score_before),
      after: toPercent(s.score_after),
      heldReason: s.held_reason,
    }));

  const weights = (Array.isArray(rows.activePoints) ? rows.activePoints : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({ label: String(p.label ?? p.id ?? ""), weight: Number(p.weight) || 0 }))
    .filter((p) => p.label && p.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const hasReady = suggestions.some((s) => s.status === "ready");

  return {
    rangeLabel: formatRangeLabel(start, end),
    stats: {
      listingsScored,
      listingsRated,
      agreement,
      bigMisses: highRejected.length + lowAssigned.length,
    },
    misses: {
      highRejected: { count: highRejected.length, topNotes: topNotes(highRejected.map((f) => f.note)) },
      lowAssigned: { count: lowAssigned.length, topNotes: topNotes(lowAssigned.map((f) => f.note)) },
    },
    suggestions,
    weights,
    quiet: listingsRated < QUIET_WEEK_RATINGS && !hasReady,
    appUrl,
  };
}

// ---------------------------------------------------------------------------
// When to send
// ---------------------------------------------------------------------------

/**
 * Which Friday's email is due right now, as a Prague date ("2026-10-16"), or
 * null when none is due.
 *
 * Due Friday 08:00 to 14:00 Prague. The two Vercel timers fire at 06:00 and
 * 07:00 UTC, which is 08:00 Prague in summer and in winter respectively; the
 * other one lands at 07:00 or 09:00, outside the window or already sent. The
 * window runs to 14:00 so a late timer still sends, and closes before the
 * afternoon activity summary so the two never land together.
 */
export function dueAiScoutFriday(now: Date): string | null {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  if (get("weekday") !== "Fri" || hour < 8 || hour >= 14) return null;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** app_settings key recording the last Friday whose AI scout email went out. */
const LAST_SENT_KEY = "ai_scout_email_last_sent";

/** The Friday (Prague date) of the last AI scout email that reached everyone, if any. */
export async function getLastSentAiScoutFriday(): Promise<string | null> {
  const { data, error } = await serviceClient()
    .from("app_settings")
    .select("value")
    .eq("key", LAST_SENT_KEY)
    .maybeSingle();

  // Fail loudly: guessing "not sent" here would risk a double send.
  if (error) throw new Error(`last-sent lookup failed: ${error.message}`);
  const friday = (data?.value as { friday?: unknown } | null)?.friday;
  return typeof friday === "string" ? friday : null;
}

/**
 * Record that this Friday's email has gone out, so later runs skip it.
 * Throws on failure, so a missing marker shows up as a failed run in the
 * Vercel logs rather than as a silent second send.
 */
export async function markAiScoutSent(friday: string): Promise<void> {
  const { error } = await serviceClient()
    .from("app_settings")
    .upsert({ key: LAST_SENT_KEY, value: { friday }, updated_at: new Date().toISOString() });
  if (error) throw new Error(`AI scout email sent, but last-sent was not recorded: ${error.message}`);
}

// ---------------------------------------------------------------------------
// The database reads
// ---------------------------------------------------------------------------

/** Service-role client: the email reads across every user and city. */
function serviceClient() {
  const client = createServiceSupabase();
  if (!client) throw new Error("Supabase service role is not configured");
  return client;
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://theminers.vercel.app";
}

/**
 * Read the last 7 days and count them.
 *
 * Service role, which bypasses RLS. Fine here: every recipient trains the AI,
 * and the email only carries company-wide counts, suggestion titles and the
 * weights, never a listing from a city they cannot see.
 */
export async function getAiScoutEmail(
  now: Date = new Date(),
  appUrl = getAppUrl(),
): Promise<AiScoutEmailData> {
  const supabase = serviceClient();
  const start = new Date(now.getTime() - 7 * DAY_MS);
  const since = start.toISOString();

  const [ratingsRes, feedbackRes, suggestionsRes, profileRes] = await Promise.all([
    supabase
      .from("ai_ratings")
      .select("id, place_id, blend, created_at")
      .eq("customer_id", CUSTOMER_ID)
      .gte("created_at", since),
    // updated_at as well: a rating changed this week counts as this week's.
    supabase
      .from("ai_feedback")
      .select("place_id, kind, ai_value, human_value, note, created_at, updated_at")
      .eq("customer_id", CUSTOMER_ID)
      .or(`created_at.gte.${since},updated_at.gte.${since}`),
    supabase
      .from("ai_suggestions")
      .select("title, status, score_before, score_after, held_reason, created_at")
      .eq("customer_id", CUSTOMER_ID)
      .in("status", ["ready", "held"]),
    supabase
      .from("ai_profiles")
      .select("points")
      .eq("customer_id", CUSTOMER_ID)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  // Throw, never carry on with empty rows: a failed read would look like a
  // quiet week, send the short email, and the marker would then block the
  // real one. A throw makes the route answer 500 without marking it sent.
  const failed = [ratingsRes, feedbackRes, suggestionsRes, profileRes]
    .map((r) => r.error?.message)
    .filter(Boolean);
  if (failed.length > 0) {
    throw new Error(`AI scout email queries failed: ${failed.join("; ")}`);
  }

  const feedback = (feedbackRes.data as RawAiScoutRows["feedback"]) || [];

  // The score a decided listing had may be older than the window, so those
  // listings' ratings are read whatever their age.
  const decidedPlaceIds = [
    ...new Set(
      feedback.filter((f) => f.kind === "assign" || f.kind === "reject").map((f) => f.place_id),
    ),
  ];
  let decidedRatings: RawAiScoutRows["ratings"] = [];
  if (decidedPlaceIds.length > 0) {
    const { data, error } = await supabase
      .from("ai_ratings")
      .select("id, place_id, blend, created_at")
      .eq("customer_id", CUSTOMER_ID)
      .in("place_id", decidedPlaceIds);
    if (error) throw new Error(`AI scout decided ratings query failed: ${error.message}`);
    decidedRatings = (data as RawAiScoutRows["ratings"]) || [];
  }

  return buildAiScoutEmail(
    {
      ratings: [...((ratingsRes.data as RawAiScoutRows["ratings"]) || []), ...decidedRatings],
      feedback,
      suggestions: (suggestionsRes.data as RawAiScoutRows["suggestions"]) || [],
      activePoints: (profileRes.data as { points?: unknown } | null)?.points ?? [],
    },
    start,
    now,
    appUrl,
  );
}

/**
 * Everyone who trains the AI: active super admins, and active people with
 * the "Can train AI" switch on in at least one city. The switch is only
 * valid with Approve, so the level is checked too in case a stale row
 * survives.
 */
export async function getAiTrainerEmails(): Promise<string[]> {
  const supabase = serviceClient();

  const [profilesRes, grantsRes] = await Promise.all([
    // Filtered below rather than with .eq("is_active", true): only an
    // explicit false is off, matching the SQL's IS DISTINCT FROM false.
    supabase.from("user_profiles").select("id, email, is_active, is_super_admin"),
    supabase
      .from("user_city_grants")
      .select("user_id")
      .eq("can_train_ai", true)
      .eq("level", "approve"),
  ]);

  // Throw rather than return nobody: "no recipients" and "could not look
  // them up" must not reach the route as the same answer.
  if (profilesRes.error || grantsRes.error) {
    throw new Error(
      `AI scout recipient lookup failed: ${(profilesRes.error || grantsRes.error)?.message}`,
    );
  }

  const trainers = new Set(((grantsRes.data as { user_id: string }[]) || []).map((g) => g.user_id));
  const emails = (
    (profilesRes.data as {
      id: string;
      email: string | null;
      is_active: boolean | null;
      is_super_admin: boolean | null;
    }[]) || []
  )
    .filter((p) => p.is_active !== false && (p.is_super_admin === true || trainers.has(p.id)))
    .map((p) => p.email?.trim().toLowerCase())
    .filter((e): e is string => Boolean(e));

  return [...new Set(emails)];
}

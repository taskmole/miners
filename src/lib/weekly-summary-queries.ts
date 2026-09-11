import { createClient } from "@supabase/supabase-js";
import { AUTO_REJECT_REASON } from "@/lib/property-requests";

/**
 * The shape of the weekly activity summary, and a realistic week of sample
 * data for the preview.
 *
 * Types and sample live beside the queries for the same reason they do in
 * digest-queries.ts: the template renders the same object the database
 * produces, so a field that stops being filled in breaks the build rather
 * than quietly rendering a blank row.
 *
 * The counting functions themselves land here next. Everything below is the
 * contract they have to fill.
 */

/** One city's funnel for the week. Cities with no activity are never included. */
export interface WeeklyCityStats {
  cityId: string;
  /** New rows in `places` from the property feeds only, so cafes are excluded. */
  propertiesAdded: number;
  /** Properties a person actually reviewed in the inbox. */
  triaged: number;
  requested: number;
  /** Scouting trips submitted. Drafts never count. */
  pitched: number;
  requestsApproved: number;
  requestsRejected: number;
  /**
   * Competing requests the app auto-rejected when a rival was approved.
   * Kept out of the rejection count: they are not a human saying no.
   */
  requestsClosedAsDuplicate: number;
  pitchesApproved: number;
  pitchesRejected: number;
  pitchesReturned: number;
}

export interface WeeklyPerson {
  name: string;
  actions: number;
}

export interface WeeklySummaryData {
  /** "5 to 12 September". Built once, so the email never formats dates itself. */
  rangeLabel: string;
  headline: {
    activePeople: number;
    propertiesReviewed: number;
    totalActions: number;
  };
  people: {
    activeCount: number;
    withAccessCount: number;
    /** Sorted most active first. The template caps how many it prints. */
    all: WeeklyPerson[];
    addedThisWeek: string[];
  };
  cities: WeeklyCityStats[];
  /**
   * Company-wide, not per city: the activity log has never recorded which
   * city an action happened in.
   */
  research: {
    savedToLists: number;
    listsCreated: number;
    customPoints: number;
    areasDrawn: number;
    filesUploaded: number;
    comments: number;
  };
  admin: {
    assignmentsMade: number;
    assignmentsRemoved: number;
    joinedTeams: number;
    leftTeams: number;
    usersAdded: number;
  };
  appUrl: string;
}

/**
 * A sample week for the preview.
 *
 * Deliberately fuller than the real first week will be, so every section of
 * the template renders and can be judged. Real production numbers for the
 * last 7 days are roughly a third of this.
 */
export const SAMPLE_WEEKLY_SUMMARY: WeeklySummaryData = {
  rangeLabel: "5 to 12 September",
  headline: { activePeople: 6, propertiesReviewed: 41, totalActions: 88 },
  people: {
    activeCount: 6,
    withAccessCount: 11,
    all: [
      { name: "Matus Husar", actions: 27 },
      { name: "Jaro Zapletal", actions: 21 },
      { name: "Ana Gomez", actions: 16 },
      { name: "Petr Novak", actions: 12 },
      { name: "Lucia Ruiz", actions: 8 },
      { name: "Unknown", actions: 4 },
    ],
    addedThisWeek: ["Lucia Ruiz", "Petr Novak"],
  },
  cities: [
    {
      cityId: "madrid",
      propertiesAdded: 24,
      triaged: 29,
      requested: 5,
      pitched: 2,
      requestsApproved: 3,
      requestsRejected: 1,
      requestsClosedAsDuplicate: 1,
      pitchesApproved: 1,
      pitchesRejected: 0,
      pitchesReturned: 1,
    },
    {
      cityId: "prague",
      propertiesAdded: 11,
      triaged: 12,
      requested: 2,
      pitched: 1,
      requestsApproved: 1,
      requestsRejected: 1,
      requestsClosedAsDuplicate: 0,
      pitchesApproved: 1,
      pitchesRejected: 0,
      pitchesReturned: 0,
    },
  ],
  research: {
    savedToLists: 19,
    listsCreated: 2,
    customPoints: 6,
    areasDrawn: 3,
    filesUploaded: 0,
    comments: 4,
  },
  admin: {
    assignmentsMade: 5,
    assignmentsRemoved: 1,
    joinedTeams: 2,
    leftTeams: 0,
    usersAdded: 2,
  },
  appUrl: "https://theminers.vercel.app",
};

// ---------------------------------------------------------------------------
// The counting
// ---------------------------------------------------------------------------

/**
 * Raw rows, one property per table, exactly as the database returns them.
 *
 * The counting is a pure function of this object so it can be tested with
 * made-up rows and no database at all. Every window filter is applied inside
 * buildWeeklySummary rather than only in SQL, so "a decision one minute
 * before the window starts" is a thing the tests can actually check.
 */
export interface RawWeeklyRows {
  places: { city_id: string | null; source: string | null; created_at: string }[];
  inboxReads: { user_id: string | null; city_id: string | null; created_at: string }[];
  requests: {
    city_id: string | null;
    created_at: string;
    status: string | null;
    decided_at: string | null;
    decision_reason: string | null;
    requested_by: string | null;
  }[];
  pitches: {
    city_id: string | null;
    status: string | null;
    submitted_at: string | null;
    final_reviewed_at: string | null;
    created_by: string | null;
  }[];
  activity: { user_id: string | null; action_type: string; created_at: string }[];
  comments: { created_at: string; created_by: string | null }[];
  lists: { created_at: string; created_by: string | null }[];
  profiles: {
    id: string;
    display_name: string | null;
    email: string | null;
    created_at: string;
    is_active: boolean;
    is_super_admin: boolean;
  }[];
  /** Everyone holding at least one city grant. Used for "of how many". */
  grantUserIds: string[];
}

/**
 * The property feeds, and only them.
 *
 * `places` also holds cafes, gyms and hand-added Miners locations. Counting
 * those as "properties added" would put 400 gyms in a report about scouting.
 * The same two Idealista feeds the digest treats as one source.
 */
const PROPERTY_SOURCES = ["idealista", "idealista_transfer", "sreality"];

/** Actions that only exist in the activity log, mapped to what they mean. */
const ACTION = {
  savedToLists: "added_to_list",
  customPoints: "created_point",
  areasDrawn: "created_area",
  filesUploaded: "added_attachment",
  shapeComments: "commented_on_shape",
  assignmentsMade: "assigned_property",
  assignmentsRemoved: "removed_assignment",
  joinedTeams: "added_to_team",
  leftTeams: "removed_from_team",
} as const;

/** Inside the window, treating a missing timestamp as outside it. */
function inWindow(at: string | null | undefined, start: Date, end: Date): boolean {
  if (!at) return false;
  const t = new Date(at).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** "5 to 12 September", or "29 August to 5 September" across a month end. */
export function formatRangeLabel(start: Date, end: Date): string {
  const day = (d: Date) => d.getUTCDate();
  const month = (d: Date) =>
    d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  return month(start) === month(end)
    ? `${day(start)} to ${day(end)} ${month(end)}`
    : `${day(start)} ${month(start)} to ${day(end)} ${month(end)}`;
}

/**
 * Is it a given hour in Prague right now?
 *
 * GitHub timers only understand UTC, and Prague is one hour ahead in winter
 * and two in summer, so a single fixed timer would drift to 3pm for half the
 * year. The workflow fires twice and this decides which firing is the real
 * one. Timers are also best effort and can start several minutes late, hence
 * the tolerance: a late start still sends rather than skipping the week.
 */
export function isPragueHour(now: Date, hour: number, toleranceMinutes = 45): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const h = get("hour");
  const m = get("minute");
  if (Number.isNaN(h) || Number.isNaN(m)) return false;

  return h === hour && m <= toleranceMinutes;
}

/** Turns raw rows into the email's data. Pure: no database, no clock. */
export function buildWeeklySummary(
  rows: RawWeeklyRows,
  start: Date,
  end: Date,
  appUrl: string,
): WeeklySummaryData {
  const activity = rows.activity.filter((a) => inWindow(a.created_at, start, end));
  const inboxReads = rows.inboxReads.filter((r) => inWindow(r.created_at, start, end));

  // ---- people -------------------------------------------------------------

  const nameOf = new Map(
    rows.profiles.map((p) => [p.id, p.display_name?.trim() || p.email || "Unknown"]),
  );

  // Per person: logged actions plus inbox triage, which is never logged.
  // Requests and pitch submissions already appear in the log, so counting
  // them again here would double them.
  const actionsByUser = new Map<string, number>();
  const bump = (id: string | null | undefined) => {
    const key = id || "unknown";
    actionsByUser.set(key, (actionsByUser.get(key) || 0) + 1);
  };
  activity.forEach((a) => bump(a.user_id));
  inboxReads.forEach((r) => bump(r.user_id));

  // "Active" is anyone who did real work, by any of four routes. The same
  // person doing all four counts once.
  const activeIds = new Set<string>();
  activity.forEach((a) => a.user_id && activeIds.add(a.user_id));
  inboxReads.forEach((r) => r.user_id && activeIds.add(r.user_id));
  rows.requests.forEach((r) => {
    if (inWindow(r.created_at, start, end) && r.requested_by) activeIds.add(r.requested_by);
  });
  rows.pitches.forEach((p) => {
    if (inWindow(p.submitted_at, start, end) && p.created_by) activeIds.add(p.created_by);
  });

  const people: WeeklyPerson[] = [...actionsByUser.entries()]
    .map(([id, actions]) => ({ name: nameOf.get(id) || "Unknown", actions }))
    .sort((a, b) => b.actions - a.actions || a.name.localeCompare(b.name));

  const withAccess = rows.profiles.filter(
    (p) => p.is_active && (p.is_super_admin || rows.grantUserIds.includes(p.id)),
  );

  const addedThisWeek = rows.profiles
    .filter((p) => inWindow(p.created_at, start, end))
    .map((p) => p.display_name?.trim() || p.email || "Someone");

  // ---- pipeline, per city -------------------------------------------------

  const cities = new Map<string, WeeklyCityStats>();
  const cityRow = (cityId: string | null): WeeklyCityStats | null => {
    if (!cityId) return null;
    let row = cities.get(cityId);
    if (!row) {
      row = {
        cityId,
        propertiesAdded: 0,
        triaged: 0,
        requested: 0,
        pitched: 0,
        requestsApproved: 0,
        requestsRejected: 0,
        requestsClosedAsDuplicate: 0,
        pitchesApproved: 0,
        pitchesRejected: 0,
        pitchesReturned: 0,
      };
      cities.set(cityId, row);
    }
    return row;
  };

  for (const place of rows.places) {
    if (!inWindow(place.created_at, start, end)) continue;
    if (!place.source || !PROPERTY_SOURCES.includes(place.source)) continue;
    const row = cityRow(place.city_id);
    if (row) row.propertiesAdded += 1;
  }

  for (const read of inboxReads) {
    const row = cityRow(read.city_id);
    if (row) row.triaged += 1;
  }

  for (const request of rows.requests) {
    if (inWindow(request.created_at, start, end)) {
      const row = cityRow(request.city_id);
      if (row) row.requested += 1;
    }
    if (!inWindow(request.decided_at, start, end)) continue;
    const row = cityRow(request.city_id);
    if (!row) continue;
    if (request.status === "approved") row.requestsApproved += 1;
    if (request.status === "rejected") {
      // A rival auto-rejected by the app is not a human saying no.
      if (request.decision_reason === AUTO_REJECT_REASON) {
        row.requestsClosedAsDuplicate += 1;
      } else {
        row.requestsRejected += 1;
      }
    }
  }

  for (const pitch of rows.pitches) {
    // Drafts never count: a draft has no submitted_at and never leaves the
    // author's screen.
    if (inWindow(pitch.submitted_at, start, end)) {
      const row = cityRow(pitch.city_id);
      if (row) row.pitched += 1;
    }
    if (!inWindow(pitch.final_reviewed_at, start, end)) continue;
    const row = cityRow(pitch.city_id);
    if (!row) continue;
    if (pitch.status === "approved") row.pitchesApproved += 1;
    if (pitch.status === "rejected") row.pitchesRejected += 1;
    if (pitch.status === "returned") row.pitchesReturned += 1;
  }

  const activeCities = [...cities.values()]
    .filter(
      (c) =>
        c.propertiesAdded + c.triaged + c.requested + c.pitched +
          c.requestsApproved + c.requestsRejected + c.requestsClosedAsDuplicate +
          c.pitchesApproved + c.pitchesRejected + c.pitchesReturned > 0,
    )
    .sort((a, b) => a.cityId.localeCompare(b.cityId));

  // ---- the rest -----------------------------------------------------------

  const countAction = (type: string) =>
    activity.filter((a) => a.action_type === type).length;

  const comments =
    rows.comments.filter((c) => inWindow(c.created_at, start, end)).length +
    countAction(ACTION.shapeComments);

  const totalActions = activity.length + inboxReads.length;

  return {
    rangeLabel: formatRangeLabel(start, end),
    headline: {
      activePeople: activeIds.size,
      propertiesReviewed: inboxReads.length,
      totalActions,
    },
    people: {
      activeCount: activeIds.size,
      withAccessCount: withAccess.length,
      all: people,
      addedThisWeek,
    },
    cities: activeCities,
    research: {
      savedToLists: countAction(ACTION.savedToLists),
      // Counted from the lists table: creating a list is one of the few
      // things that never reaches the activity log.
      listsCreated: rows.lists.filter((l) => inWindow(l.created_at, start, end)).length,
      // NOT counted from drawn_features: that table is wiped and rewritten
      // every time somebody edits their map, so it holds current state, not
      // history.
      customPoints: countAction(ACTION.customPoints),
      areasDrawn: countAction(ACTION.areasDrawn),
      filesUploaded: countAction(ACTION.filesUploaded),
      comments,
    },
    admin: {
      // NOT counted from property_assignments: reassigning the same property
      // overwrites the row instead of adding one, so the count would be
      // silently low.
      assignmentsMade: countAction(ACTION.assignmentsMade),
      assignmentsRemoved: countAction(ACTION.assignmentsRemoved),
      joinedTeams: countAction(ACTION.joinedTeams),
      leftTeams: countAction(ACTION.leftTeams),
      usersAdded: addedThisWeek.length,
    },
    appUrl,
  };
}

/**
 * Read a week out of the database and count it.
 *
 * Service role, like the digest, which bypasses RLS. Fine here: the only
 * recipients are super admins, who can see every city anyway.
 *
 * Every query is the same plain "since this timestamp" filter. Deliberately
 * NOT the one digest-queries.ts uses, which looks back 12 hours from the
 * newest row to isolate one scrape batch and would be wrong here.
 */
export async function getWeeklySummary(
  now: Date = new Date(),
  appUrl = "https://theminers.vercel.app",
): Promise<WeeklySummaryData> {
  const supabase = createClient(
    process.env.SUPABASE_PROD_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since = start.toISOString();

  // All at once. A week of rows is small; running them in series would just
  // be nine round trips of waiting.
  const [
    places,
    inboxReads,
    requests,
    pitches,
    activity,
    comments,
    lists,
    profiles,
    grants,
  ] = await Promise.all([
    supabase.from("places").select("city_id, source, created_at").gte("created_at", since),
    supabase.from("inbox_reads").select("user_id, city_id, created_at").gte("created_at", since),
    // Requests are wanted both when raised and when decided, and a request
    // raised before the window can be decided inside it, so this one cannot
    // filter on created_at alone.
    supabase
      .from("property_requests")
      .select("city_id, created_at, status, decided_at, decision_reason, requested_by")
      .or(`created_at.gte.${since},decided_at.gte.${since}`),
    supabase
      .from("pitches")
      .select("city_id, status, submitted_at, final_reviewed_at, created_by")
      .or(`submitted_at.gte.${since},final_reviewed_at.gte.${since}`),
    supabase.from("activity_log").select("user_id, action_type, created_at").gte("created_at", since),
    supabase.from("comments").select("created_at, created_by").gte("created_at", since),
    supabase.from("lists").select("created_at, created_by").gte("created_at", since),
    // Profiles are not windowed: the names of everyone who did something are
    // needed, whenever they were created.
    supabase.from("user_profiles").select("id, display_name, email, created_at, is_active, is_super_admin"),
    supabase.from("user_city_grants").select("user_id"),
  ]);

  const failed = [places, inboxReads, requests, pitches, activity, comments, lists, profiles, grants]
    .map((r) => r.error?.message)
    .filter(Boolean);
  if (failed.length > 0) {
    console.warn("[weekly-summary] some queries failed:", failed.join("; "));
  }

  return buildWeeklySummary(
    {
      places: places.data || [],
      inboxReads: inboxReads.data || [],
      requests: requests.data || [],
      pitches: pitches.data || [],
      activity: activity.data || [],
      comments: comments.data || [],
      lists: lists.data || [],
      profiles: profiles.data || [],
      grantUserIds: ((grants.data as { user_id: string }[]) || []).map((g) => g.user_id),
    } as RawWeeklyRows,
    start,
    now,
    appUrl,
  );
}

/** Active super admins, the only recipients. Two people today. */
export async function getSuperAdminEmails(): Promise<string[]> {
  const supabase = createClient(
    process.env.SUPABASE_PROD_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase
    .from("user_profiles")
    .select("email")
    .eq("is_super_admin", true)
    .eq("is_active", true);

  if (error) {
    console.warn("[weekly-summary] super admin lookup failed:", error.message);
    return [];
  }

  return ((data as { email: string | null }[]) || [])
    .map((r) => r.email)
    .filter((e): e is string => Boolean(e));
}

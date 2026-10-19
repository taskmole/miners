import { NextRequest, NextResponse } from "next/server";
import {
  accessFor,
  authenticateRequest,
  createServiceSupabase,
  untypedDb as db,
} from "@/lib/supabase-server";
import { listingsRatedSinceSuggestions } from "@/lib/ai-scout-unlock";
import { trainsAiAnywhere } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * The "AI scout" admin tab: what the AI is doing now, what it suggests
 * changing, and the buttons to accept, skip, propose and roll back.
 *
 * Every query and RPC runs as the signed-in person, so RLS and the checks
 * inside decide_ai_suggestion / activate_ai_profile still apply. The access
 * check below exists to give a clear 403 instead of an empty screen.
 */

/** One customer today. The tables carry the column for when there are more. */
const CUSTOMER_ID = "miners";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RULE_MIN = 5;
const RULE_MAX = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses still waiting on a person. Decided ones drop off the screen. */
const OPEN_STATUSES = ["testing", "ready", "held"] as const;

/** Postgres error codes the RPCs raise, mapped to HTTP. */
const STATUS_FOR_CODE: Record<string, number> = {
  "42501": 403, // insufficient_privilege: not a trainer
  P0002: 404, // no such suggestion / version
  "22023": 400, // invalid_parameter_value: already decided, held, bad change
};

export interface AiScoutPoint {
  id: string;
  label: string;
  kind: "fact" | "ai";
  weight: number;
}

export interface AiScoutVersion {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
  isActive: boolean;
  scoreboard: unknown;
}

export interface AiScoutSuggestion {
  id: string;
  source: "weekly" | "user";
  kind: "rule" | "point" | "weight";
  title: string;
  evidence: string | null;
  status: "testing" | "ready" | "held";
  scoreBefore: number | null;
  scoreAfter: number | null;
  sample: number | null;
  heldReason: string | null;
  createdAt: string;
}

export interface AiScoutOverview {
  profile: {
    id: string;
    version: number;
    points: AiScoutPoint[];
    rules: string[];
  } | null;
  versions: AiScoutVersion[];
  suggestions: AiScoutSuggestion[];
  /**
   * Ratings head office has ever saved (point fixes and overall verdicts, as
   * far as RLS lets this person see). Rows, not distinct listings: a count
   * query cannot do DISTINCT, and reading every row would hit the 1000-row cap.
   */
  ratingsSaved: number;
  /** Distinct listings with feedback since the learner last asked the model: what unlocks the next suggestions. */
  ratedSinceSuggestions: number;
  week: {
    /** Distinct listings rated in the last 7 days. */
    listingsRated: number;
    /** Point fixes and overall verdicts saved in the last 7 days. */
    ratings: number;
    /** Share (0-1) of this week's point ratings where head office agreed with the AI. Null with none. */
    agreement: number | null;
  };
}

type ProfileRow = {
  id: string;
  version: number;
  is_active: boolean;
  rules: string[] | null;
  points: unknown;
  note: string | null;
  scoreboard: unknown;
  created_at: string;
};

type SuggestionRow = {
  id: string;
  source: AiScoutSuggestion["source"];
  kind: AiScoutSuggestion["kind"];
  title: string;
  evidence: string | null;
  status: AiScoutSuggestion["status"];
  score_before: number | string | null;
  score_after: number | string | null;
  sample: number | null;
  held_reason: string | null;
  created_at: string;
};

type FeedbackRow = {
  place_id: string;
  kind: "point" | "overall";
  ai_value: number | null;
  human_value: number | null;
  updated_at: string;
};

/** numeric columns arrive as strings from PostgREST. */
function toNumber(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toSuggestion(s: SuggestionRow): AiScoutSuggestion {
  return {
    id: s.id,
    source: s.source,
    kind: s.kind,
    title: s.title,
    evidence: s.evidence,
    status: s.status,
    scoreBefore: toNumber(s.score_before),
    scoreAfter: toNumber(s.score_after),
    sample: s.sample,
    heldReason: s.held_reason,
    createdAt: s.created_at,
  };
}

/** Columns read for a suggestion, on both the list and the insert. */
const SUGGESTION_COLUMNS =
  "id, source, kind, title, evidence, status, score_before, score_after, sample, held_reason, created_at";

/** The points jsonb, kept to what the screen shows. Anything malformed is dropped. */
function toPoints(raw: unknown): AiScoutPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      id: String(p.id ?? ""),
      label: String(p.label ?? p.id ?? ""),
      kind: (p.kind === "ai" ? "ai" : "fact") as AiScoutPoint["kind"],
      weight: Number(p.weight) || 0,
    }))
    .filter((p) => p.id);
}

/** Read the caller's access, answering 401/403/500 when it does not pass. */
async function requireTrainer(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return { error: auth.error } as const;

  const access = await accessFor(auth.supabase, auth.userId);
  if (!access) {
    // A failed lookup, not a refusal: say so rather than a misleading 403.
    return {
      error: NextResponse.json({ error: "Could not load your access" }, { status: 500 }),
    } as const;
  }
  if (!trainsAiAnywhere(access)) {
    return {
      error: NextResponse.json(
        { error: "Only people who train the AI scout can open this." },
        { status: 403 },
      ),
    } as const;
  }
  return { supabase: auth.supabase, userId: auth.userId } as const;
}

/** Turn an RPC or insert error into a response the screen can show as is. */
function errorResponse(where: string, error: { code?: string; message: string }) {
  const status = (error.code && STATUS_FOR_CODE[error.code]) || 500;
  if (status === 500) console.error(`[api/db/ai-scout] ${where} error:`, error);
  return NextResponse.json(
    { error: status === 500 ? "Something went wrong. Please try again." : error.message },
    { status },
  );
}

/** Feedback since the learner's last run, read with the service role. */
async function serviceCount(): Promise<number> {
  const service = createServiceSupabase();
  if (!service) throw new Error("Supabase service role is not configured");
  return listingsRatedSinceSuggestions(db(service));
}

/**
 * GET /api/db/ai-scout
 *
 * Everything the tab shows, in one request.
 */
export async function GET(request: NextRequest) {
  const gate = await requireTrainer(request);
  if ("error" in gate) return gate.error;
  const { supabase } = gate;

  const since = new Date(Date.now() - 7 * DAY_MS).toISOString();

  try {
    const [versionsRes, activeRes, suggestionsRes, feedbackRes, totalRes, ratedSinceSuggestions] = await Promise.all([
      db(supabase)
        .from("ai_profiles")
        .select("id, version, is_active, note, scoreboard, created_at")
        .eq("customer_id", CUSTOMER_ID)
        .order("version", { ascending: false })
        .limit(10),
      // Read separately: the active version is not always among the newest
      // ten after a rollback to an old one.
      db(supabase)
        .from("ai_profiles")
        .select("id, version, rules, points")
        .eq("customer_id", CUSTOMER_ID)
        .eq("is_active", true)
        .maybeSingle(),
      db(supabase)
        .from("ai_suggestions")
        .select(SUGGESTION_COLUMNS)
        .eq("customer_id", CUSTOMER_ID)
        .in("status", OPEN_STATUSES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(50),
      // This week's ratings, filtered in SQL so PostgREST's 1000-row cap
      // can never cut the week short. updated_at, not created_at: a rating
      // changed this week counts as this week's, as in the Friday email.
      db(supabase)
        .from("ai_feedback")
        .select("place_id, kind, ai_value, human_value, updated_at")
        .eq("customer_id", CUSTOMER_ID)
        .in("kind", ["point", "overall"])
        .gte("updated_at", since)
        .order("updated_at", { ascending: false }),
      // All-time total, as a count only.
      db(supabase)
        .from("ai_feedback")
        .select("place_id", { count: "exact", head: true })
        .eq("customer_id", CUSTOMER_ID)
        .in("kind", ["point", "overall"]),
      // Service role, so the count matches the learner's across every city
      // (only trainers get this far). Throws on a failed read, caught below.
      serviceCount(),
    ]);

    const failed = [versionsRes, activeRes, suggestionsRes, feedbackRes, totalRes].find(
      (r) => r.error,
    );
    if (failed?.error) {
      console.error("[api/db/ai-scout] GET query error:", failed.error);
      return NextResponse.json({ error: "Could not load the AI scout" }, { status: 500 });
    }

    const active = activeRes.data as Pick<ProfileRow, "id" | "version" | "rules" | "points"> | null;
    const thisWeek = (feedbackRes.data as FeedbackRow[]) || [];
    const judged = thisWeek.filter(
      (f) => f.kind === "point" && f.ai_value !== null && f.human_value !== null,
    );

    const body: AiScoutOverview = {
      profile: active
        ? {
            id: active.id,
            version: active.version,
            points: toPoints(active.points).sort((a, b) => b.weight - a.weight),
            rules: active.rules || [],
          }
        : null,
      versions: ((versionsRes.data as ProfileRow[]) || []).map((v) => ({
        id: v.id,
        version: v.version,
        note: v.note,
        createdAt: v.created_at,
        isActive: v.is_active,
        scoreboard: v.scoreboard ?? null,
      })),
      suggestions: ((suggestionsRes.data as SuggestionRow[]) || []).map(toSuggestion),
      ratingsSaved: totalRes.count ?? 0,
      ratedSinceSuggestions,
      week: {
        listingsRated: new Set(thisWeek.map((f) => f.place_id)).size,
        ratings: thisWeek.length,
        agreement:
          judged.length > 0
            ? judged.filter((f) => f.ai_value === f.human_value).length / judged.length
            : null,
      },
    };

    return NextResponse.json(body);
  } catch (err) {
    console.error("[api/db/ai-scout] GET unexpected error:", err);
    return NextResponse.json({ error: "Could not load the AI scout" }, { status: 500 });
  }
}

/**
 * POST /api/db/ai-scout
 *
 *   { action: 'decide', id, accept: boolean }  accept or skip a suggestion
 *   { action: 'propose', text }                queue your own rule for testing
 *   { action: 'rollback', profileId }          switch back to an earlier version
 */
export async function POST(request: NextRequest) {
  const gate = await requireTrainer(request);
  if ("error" in gate) return gate.error;
  const { supabase, userId } = gate;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }
  const b = raw as Record<string, unknown>;

  try {
    if (b.action === "decide") {
      if (typeof b.id !== "string" || !UUID_RE.test(b.id)) {
        return NextResponse.json({ error: "That suggestion could not be found." }, { status: 400 });
      }
      if (typeof b.accept !== "boolean") {
        return NextResponse.json({ error: "Choose accept or skip." }, { status: 400 });
      }
      const { data, error } = await db(supabase).rpc("decide_ai_suggestion", {
        p_id: b.id,
        p_accept: b.accept,
      });
      if (error) return errorResponse("decide", error);
      return NextResponse.json(data ?? { status: b.accept ? "accepted" : "skipped" });
    }

    if (b.action === "propose") {
      if (typeof b.text !== "string") {
        return NextResponse.json({ error: "Write the rule first." }, { status: 400 });
      }
      // Collapse line breaks and runs of spaces: a rule is one line.
      const text = b.text.replace(/\s+/g, " ").trim();
      if (text.length < RULE_MIN) {
        return NextResponse.json(
          { error: `A rule needs at least ${RULE_MIN} characters.` },
          { status: 400 },
        );
      }
      if (text.length > RULE_MAX) {
        return NextResponse.json(
          { error: `Keep the rule under ${RULE_MAX} characters.` },
          { status: 400 },
        );
      }
      const { data, error } = await db(supabase)
        .from("ai_suggestions")
        .insert({
          source: "user",
          kind: "rule",
          status: "testing",
          title: text,
          change: { add_rule: text },
          requested_by: userId,
        })
        .select(SUGGESTION_COLUMNS)
        .single();
      if (error) return errorResponse("propose", error);
      return NextResponse.json(toSuggestion(data as SuggestionRow));
    }

    if (b.action === "rollback") {
      if (typeof b.profileId !== "string" || !UUID_RE.test(b.profileId)) {
        return NextResponse.json({ error: "That version could not be found." }, { status: 400 });
      }
      const { error } = await db(supabase).rpc("activate_ai_profile", {
        p_profile_id: b.profileId,
      });
      if (error) return errorResponse("rollback", error);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "action must be 'decide', 'propose' or 'rollback'" },
      { status: 400 },
    );
  } catch (err) {
    console.error("[api/db/ai-scout] POST unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

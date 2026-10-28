import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * When the weekly learner has enough to go on.
 *
 * Suggestions unlock once head office has given feedback on this many
 * listings since the last weekly run that asked the model, however many
 * weeks that takes. Counting per week instead would mean a slow, steady
 * trickle (2 a week) never unlocks at all.
 *
 * Keep in step with UNLOCK_LISTINGS in scripts/data-pipeline/ai-learner.ts,
 * which applies the same rule on the Wednesday-night run.
 *
 * No server imports here: the admin tab (a client component) reads the
 * constant too.
 */
export const UNLOCK_RATINGS = 3;

const CUSTOMER_ID = "miners";

/**
 * app_settings key the learner writes when it asks the model: { since: ISO
 * time the run started }. Same key in scripts/data-pipeline/ai-learner.ts.
 */
const WATERMARK_KEY = "ai_learner_watermark";

/**
 * Distinct listings head office gave feedback on (a point fix, an overall
 * verdict, or an assign, reject or viewing request, the same signals the
 * learner learns from) since the learner last asked the model. Before its
 * first run, every piece of feedback counts.
 *
 * Pass the service-role client: the learner counts every city, and a
 * trainer's own client would only see the cities they train in.
 *
 * Throws on a failed read, so callers never mistake an error for zero.
 */
export async function listingsRatedSinceSuggestions(db: SupabaseClient<any>): Promise<number> {
  const mark = await db.from("app_settings").select("value").eq("key", WATERMARK_KEY).maybeSingle();
  if (mark.error) throw new Error(`learner watermark lookup failed: ${mark.error.message}`);

  let query = db.from("ai_feedback").select("place_id").eq("customer_id", CUSTOMER_ID);
  const since = (mark.data?.value as { since?: unknown } | null)?.since;
  if (typeof since === "string") query = query.gt("updated_at", since);

  // Newest first and capped at PostgREST's own 1000-row limit: enough rows to
  // tell whether UNLOCK_RATINGS listings are covered, which is all callers need.
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(1000);
  if (error) throw new Error(`feedback since the last learner run lookup failed: ${error.message}`);
  return new Set(((data as { place_id: string }[]) || []).map((r) => r.place_id)).size;
}

/** What the AI scout has learned so far, for the tab and the Friday email. */
export interface AiScoutSoFar {
  /** Distinct listings head office ever rated or decided on. */
  listingsTaught: number;
  /** Accepted changes that tested better than the version before them. */
  changesThatHelped: number;
}

// PostgREST returns at most 1000 rows per request, so the all-time count
// reads page by page.
const PAGE_SIZE = 1000;

/**
 * All-time totals. Pass the service-role client, as for
 * listingsRatedSinceSuggestions, so every city counts.
 *
 * A change counts once it was accepted after testing better than the version
 * before it: it did make the AI agree more at the time. One the learner later
 * rolled back has left 'accepted' and drops out; switching back to an older
 * version by hand does not change it. One that only tested equal is not
 * counted: it did not help.
 *
 * Throws on a failed read, so callers never mistake an error for zero.
 */
export async function aiScoutSoFar(db: SupabaseClient<any>): Promise<AiScoutSoFar> {
  const [listingsTaught, changesThatHelped] = await Promise.all([countListingsTaught(db), countChangesThatHelped(db)]);
  return { listingsTaught, changesThatHelped };
}

async function countListingsTaught(db: SupabaseClient<any>): Promise<number> {
  const places = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("ai_feedback")
      .select("place_id")
      .eq("customer_id", CUSTOMER_ID)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`all-time feedback lookup failed: ${error.message}`);
    const rows = (data as { place_id: string }[]) || [];
    for (const r of rows) places.add(r.place_id);
    if (rows.length < PAGE_SIZE) return places.size;
  }
}

async function countChangesThatHelped(db: SupabaseClient<any>): Promise<number> {
  const { data, error } = await db
    .from("ai_suggestions")
    .select("score_before, score_after")
    .eq("customer_id", CUSTOMER_ID)
    .eq("status", "accepted");
  if (error) throw new Error(`accepted changes lookup failed: ${error.message}`);
  return ((data as { score_before: unknown; score_after: unknown }[]) || []).filter(
    (s) => s.score_before != null && s.score_after != null && Number(s.score_after) > Number(s.score_before),
  ).length;
}

/**
 * The sentence both the tab and the email show, e.g. "So far: learned from 23
 * listings, 2 changes made it agree with you more." With no changes yet it
 * stops after the listings, rather than boasting a zero. Null before any
 * feedback at all.
 */
export function soFarLine({ listingsTaught, changesThatHelped }: AiScoutSoFar): string | null {
  if (listingsTaught === 0) return null;
  const listings = `${listingsTaught} ${listingsTaught === 1 ? "listing" : "listings"}`;
  if (changesThatHelped === 0) return `So far: learned from ${listings}.`;
  const changes = changesThatHelped === 1 ? "1 change" : `${changesThatHelped} changes`;
  return `So far: learned from ${listings}, ${changes} made it agree with you more.`;
}

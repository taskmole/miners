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

#!/usr/bin/env npx ts-node

/**
 * AI Location Scoring (AI scout)
 *
 * Rates each newly scraped property listing point by point ("rating
 * points"): some points are map facts computed here (size, rent, metro,
 * cafes, footfall, storefront), the rest are judged by Claude from the
 * listing text and photos. The points are blended into one 0-100 score.
 *
 * What a good location means for the customer (their business, the points,
 * their weights and the rules learned from head office feedback) is read from
 * the ai_profiles table, never written in this file: the repository is public
 * and those instructions are the customer's strategy.
 *
 * Results go to ai_ratings (one row per listing per profile version) and,
 * for the existing sort and digest code, to places.image_analysis.
 *
 * Usage:
 *   npx ts-node --project scripts/data-pipeline/tsconfig.json scripts/data-pipeline/score-listings.ts
 *   ... score-listings.ts --city madrid
 *   ... score-listings.ts --city prague --limit 20
 *   ... score-listings.ts --all                 # backfill, ignores the recency window
 *   ... score-listings.ts --rescore-days 30     # like --all, but only the last 30 days
 *   ... score-listings.ts --dry-run --limit 3   # score and print, write nothing
 *   AI_SCOUT_NO_MODEL=1 ... --dry-run          # facts and candidates only, no model call
 */

// Parse CLI arguments before imports (same pattern as other pipeline scripts)
const args = process.argv.slice(2);
function argValue(flag: string): string | null {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] ?? null : null;
}
const CITY_ARG = argValue("--city")?.toLowerCase() || null;
const LIMIT = argValue("--limit") != null ? parseInt(argValue("--limit")!, 10) : null;
// --all drops the recency window so a backfill can reach older listings.
const SCORE_ALL = args.includes("--all");
// --rescore-days N widens the window to N days, for a one-off backfill after
// the instructions change (listings rated by an older profile get a new row).
const RESCORE_DAYS = argValue("--rescore-days") != null ? parseInt(argValue("--rescore-days")!, 10) : null;
// Without a model there is nothing to write, so that mode is always a dry run.
const NO_MODEL = process.env.AI_SCOUT_NO_MODEL === "1";
const DRY_RUN = args.includes("--dry-run") || NO_MODEL;

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProdClient } from "./lib/supabase";
import { getCityIds } from "./config/cities";
import { getCategoryId } from "./lib/scraper-utils";
import { CATEGORIES } from "./lib/categories";
import {
  type AiPoint,
  type AiProfile,
  type ExamplePlace,
  type FeedbackRow,
  type Listing,
  type ModelVerdict,
  type PointValues,
  type RentMarket,
  blendScore,
  buildExamplePlace,
  buildListingText,
  buildOutputSchema,
  buildRentMarket,
  buildSystemPrompt,
  computeFacts,
  parseVerdict,
  parseWkbPoint,
  pickExamples,
  renderExample,
  rentPercentile,
  secondLook,
  withDistrict,
} from "./lib/ai-scout";

// Reads ANTHROPIC_API_KEY from env. Extra retries (default is 2) ride out
// short network drops on the GitHub runner; the timeout stops a hung
// connection from stalling the run. Photos make each call heavier than the
// old text-only one, so it gets two minutes rather than one.
const anthropic = new Anthropic({ maxRetries: 5, timeout: 120_000 });

export const CUSTOMER_ID = "miners";
export const DEFAULT_MODEL = "claude-sonnet-5-5";

// Photos make calls heavier, so fewer run side by side than before.
const BATCH_SIZE = 5;
const WINDOW_DAYS = 7;
const BATCH_DELAY_MS = 200;
// Hard ceiling per run across all cities, so a backfill or a bad window can
// never turn into an unbounded bill. A bigger backfill is several runs.
const MAX_PER_RUN = 400;

const MAX_PHOTOS = 6;
const PHOTO_TIMEOUT_MS = 15_000;
const PHOTO_MAX_EDGE = 1024;
// Some photo hosts refuse requests that do not look like a browser.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

// Supabase caps a select at 1000 rows and long .in() lists overflow the URL.
export const PAGE_SIZE = 1000;
const IN_CHUNK = 200;

// A run is treated as broken (exit 1) if more than this share of the listings
// it attempted failed to score. One malformed reply is tolerated; a dead API
// key or an outage is not.
const MAX_FAILURE_RATE = 0.25;

const POINT_ID = /^[a-z_]{1,40}$/;

// The repository is public, so GitHub Actions logs are public too. There the
// logs keep to addresses, numbers, counts and error types: the model's
// reasons and summaries echo the customer's instructions back. Local runs
// print everything.
export const PUBLIC_LOGS = process.env.GITHUB_ACTIONS === "true";

/** An error as a short type label, safe for a public log. */
export function errorType(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `${err.constructor.name} (${err.status ?? "no status"})`;
  return err instanceof Error ? err.name : typeof err;
}

// ---------------------------------------------------------------------------
// Database reads
// ---------------------------------------------------------------------------

/**
 * Load the customer's active instructions. Without them there is nothing to
 * rate against, so the run stops with a clear message instead of guessing.
 */
export async function loadProfile(supabase: SupabaseClient): Promise<AiProfile> {
  const { data, error } = await supabase
    .from("ai_profiles")
    .select("*")
    .eq("customer_id", CUSTOMER_ID)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`Could not read ai_profiles: ${error.message}`);
  if (!data) {
    throw new Error(
      `No active AI profile for customer "${CUSTOMER_ID}". ` +
        `Insert a row in ai_profiles with is_active = true before scoring.`
    );
  }
  return profileFromRow(data);
}

/**
 * Check and normalise one ai_profiles row. Shared with the weekly learner,
 * which also reads older versions to compare against.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function profileFromRow(data: any): AiProfile {
  const points = (Array.isArray(data.points) ? data.points : []) as AiPoint[];
  for (const p of points) {
    // Point ids become JSON schema keys and jsonb keys, so they must be tidy.
    if (!p || typeof p.id !== "string" || !POINT_ID.test(p.id)) {
      throw new Error(`AI profile v${data.version} has a point with a bad id: ${JSON.stringify(p?.id)}`);
    }
    if (p.kind !== "fact" && p.kind !== "ai") {
      throw new Error(`AI profile point "${p.id}" has unknown kind "${p.kind}"`);
    }
  }
  if (points.length === 0) throw new Error(`AI profile v${data.version} has no points`);

  const weightSum = points.reduce((a, p) => a + (Number(p.weight) || 0), 0);
  if (Math.abs(weightSum - 100) > 0.5) {
    console.warn(`Warning: point weights in profile v${data.version} add up to ${weightSum}, not 100.`);
  }

  const mw = (data.match_weights || {}) as Record<string, unknown>;
  const ideal = (data.ideal_size || {}) as Record<string, unknown>;
  return {
    id: data.id,
    customer_id: data.customer_id,
    version: data.version,
    model: data.model || DEFAULT_MODEL,
    business: data.business || "",
    rules: Array.isArray(data.rules) ? data.rules : [],
    points: points.map((p) => ({ ...p, weight: Number(p.weight) || 0, guide: p.guide || "", label: p.label || p.id })),
    match_weights: {
      size: Number(mw.size ?? 35),
      rent: Number(mw.rent ?? 30),
      distance: Number(mw.distance ?? 20),
      deal: Number(mw.deal ?? 15),
    },
    ideal_size: { min: Number(ideal.min ?? 50), max: Number(ideal.max ?? 150) },
  };
}

export const LISTING_COLUMNS = "id, city_id, name, address, source, metadata, photos, location, created_at";

export interface PlaceRow {
  id: string;
  city_id: string;
  name: string | null;
  address: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  photos: string[] | null;
  location: unknown;
  created_at: string;
}

export function toListing(row: PlaceRow): Listing {
  const coords = parseWkbPoint(row.location);
  return {
    id: row.id,
    cityId: row.city_id,
    name: row.name || "Property",
    address: row.address || "",
    source: row.source || "unknown",
    metadata: (row.metadata || {}) as Record<string, unknown>,
    photos: Array.isArray(row.photos) ? row.photos : [],
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Every active Property listing in a city, newest first. One read serves both
 * the rent market (which needs all of them) and the candidate list.
 *
 * Only rows in the Property category count: POI scrapes (transit, gyms,
 * cafes) also land in `places` and are not listings we can rate.
 */
async function fetchCityListings(supabase: SupabaseClient, cityId: string, categoryId: string): Promise<Listing[]> {
  const out: Listing[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("places")
      .select(LISTING_COLUMNS)
      .eq("status", "active")
      .eq("category_id", categoryId)
      .eq("city_id", cityId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data || []) as PlaceRow[];
    out.push(...rows.map(toListing));
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/** Run a .in() query in chunks so a long id list does not overflow the URL. */
export async function inChunks<T>(ids: string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    out.push(...(await run(ids.slice(i, i + IN_CHUNK))));
  }
  return out;
}

/** Ids among `placeIds` that already have a rating under this profile. */
async function alreadyRated(supabase: SupabaseClient, profileId: string, placeIds: string[]): Promise<Set<string>> {
  const rows = await inChunks(placeIds, async (chunk) => {
    const { data, error } = await supabase
      .from("ai_ratings")
      .select("place_id")
      .eq("profile_id", profileId)
      .in("place_id", chunk);
    if (error) throw new Error(`Could not read ai_ratings: ${error.message}`);
    return (data || []) as { place_id: string }[];
  });
  return new Set(rows.map((r) => r.place_id));
}

// One market per city per run. Feedback examples can come from cities this
// run is not scoring, so the cache also fills on demand.
const cityListingsCache = new Map<string, Promise<Listing[]>>();
const marketCache = new Map<string, Promise<RentMarket>>();

export function cityListings(supabase: SupabaseClient, cityId: string, categoryId: string): Promise<Listing[]> {
  let p = cityListingsCache.get(cityId);
  if (!p) {
    p = fetchCityListings(supabase, cityId, categoryId);
    cityListingsCache.set(cityId, p);
  }
  return p;
}

export function cityMarket(supabase: SupabaseClient, cityId: string, categoryId: string): Promise<RentMarket> {
  let p = marketCache.get(cityId);
  if (!p) {
    p = cityListings(supabase, cityId, categoryId).then(buildRentMarket);
    marketCache.set(cityId, p);
  }
  return p;
}

/**
 * Load head office feedback once per run and turn it into example listings:
 * each listing that got feedback, with what the AI said about it then.
 * Feedback may point at listings that have since been removed; those still
 * teach, so places are read by id without the active filter.
 */
export async function loadExamples(supabase: SupabaseClient, categoryId: string): Promise<ExamplePlace[]> {
  const { data, error } = await supabase
    .from("ai_feedback")
    .select("place_id, city_id, rating_id, kind, point_id, ai_value, human_value, verdict, note, created_at")
    .eq("customer_id", CUSTOMER_ID)
    .order("created_at", { ascending: false })
    // The newest 1000 is plenty for examples and is also the API row cap.
    .limit(1000);
  if (error) throw new Error(`Could not read ai_feedback: ${error.message}`);
  const feedback = (data || []) as FeedbackRow[];
  if (feedback.length === 0) return [];

  const placeIds = [...new Set(feedback.map((f) => f.place_id))];
  const ratingIds = [...new Set(feedback.map((f) => f.rating_id).filter((x): x is string => !!x))];

  const places = await inChunks(placeIds, async (chunk) => {
    const { data: rows, error: err } = await supabase.from("places").select(LISTING_COLUMNS).in("id", chunk);
    if (err) throw new Error(`Could not read feedback listings: ${err.message}`);
    return (rows || []) as PlaceRow[];
  });
  const ratings = await inChunks(ratingIds, async (chunk) => {
    const { data: rows, error: err } = await supabase.from("ai_ratings").select("id, blend").in("id", chunk);
    if (err) throw new Error(`Could not read feedback ratings: ${err.message}`);
    return (rows || []) as { id: string; blend: number | null }[];
  });
  const blendByRating = new Map(ratings.map((r) => [r.id, r.blend]));

  const byPlace = new Map<string, FeedbackRow[]>();
  for (const f of feedback) {
    const list = byPlace.get(f.place_id);
    if (list) list.push(f);
    else byPlace.set(f.place_id, [f]);
  }

  const out: ExamplePlace[] = [];
  for (const row of places) {
    const listing = toListing(row);
    const rows = byPlace.get(listing.id) || [];
    // Rows are newest first, so this is the rating head office last reacted to.
    const ratingId = rows.find((f) => f.rating_id)?.rating_id;
    const blend = ratingId ? blendByRating.get(ratingId) ?? null : null;
    const market = await cityMarket(supabase, listing.cityId, categoryId);
    out.push(buildExamplePlace(listing, rows, blend, rentPercentile(market, listing.source, listing.metadata)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/**
 * Download one listing photo and shrink it. Full-size gallery images cost
 * many tokens and add nothing a 1024 px image does not show. Any failure
 * (timeout, 403, not an image) just skips the photo.
 */
async function fetchPhoto(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "image/*" },
      signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(input)
      .rotate()
      .resize({ width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return jpeg.toString("base64");
  } catch {
    return null;
  }
}

async function fetchPhotos(listing: Listing): Promise<string[]> {
  const urls = listing.photos.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, MAX_PHOTOS);
  const results = await Promise.all(urls.map(fetchPhoto));
  return results.filter((x): x is string => x !== null);
}

// ---------------------------------------------------------------------------
// Model call
// ---------------------------------------------------------------------------

export interface Usage {
  input: number;
  output: number;
}

/**
 * Ask the model for the AI points, a gut score and a one-line summary.
 *
 * Returns null for a listing-level problem (bad JSON, refusal, cut-off reply).
 * Throws for account-level problems (bad or missing API key) so the run stops
 * immediately instead of burning through every listing with the same error.
 */
async function askModel(
  profile: AiProfile,
  system: string,
  schema: Record<string, unknown>,
  listing: Listing,
  userText: string,
  photos: string[]
): Promise<{ verdict: ModelVerdict; usage: Usage } | null> {
  const content: Anthropic.ContentBlockParam[] = photos.map((data) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
  }));
  content.push({ type: "text", text: userText });

  try {
    const response = await anthropic.messages.create({
      model: profile.model || DEFAULT_MODEL,
      // Room for the model's own reasoning plus a reason per point. Too low
      // and the reply gets cut off mid-answer and cannot be parsed.
      max_tokens: 2000,
      // Rating a listing is a judgement call, not a research task. Low effort
      // keeps it quick and cheap while still letting the model think a little.
      // The schema makes the reply machine-readable without a "JSON only" plea.
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      // The system prompt is identical for every listing in a run, so it is
      // marked for caching; a prompt under the cache minimum is just ignored.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });

    const usage = { input: response.usage.input_tokens, output: response.usage.output_tokens };

    if (response.stop_reason === "refusal") {
      console.error(`  The model declined to rate ${listing.address}`);
      return null;
    }
    if (response.stop_reason === "max_tokens") {
      console.error(`  Reply for ${listing.address} was cut off at max_tokens`);
      return null;
    }

    // The reply can open with a thinking block, so take the first *text*
    // block rather than whatever happens to be first.
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      const kinds = response.content.map((b) => b.type).join(", ") || "nothing";
      console.error(`  No text in the reply for ${listing.address} (got: ${kinds})`);
      return null;
    }

    const verdict = parseVerdict(block.text, profile);
    if (!verdict) {
      console.error(
        PUBLIC_LOGS
          ? `  Invalid response shape for ${listing.address} (${block.text.length} characters)`
          : `  Invalid response shape for ${listing.address}: ${block.text.slice(0, 300)}`
      );
      return null;
    }
    return { verdict, usage };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new Error(
        `Anthropic rejected the credentials (${err.status}). ` +
          `Set ANTHROPIC_API_KEY in .env.local locally, or check the ANTHROPIC secret in GitHub.`
      );
    }
    console.error(`  Error scoring ${listing.address}: ${PUBLIC_LOGS ? errorType(err) : err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// One listing
// ---------------------------------------------------------------------------

export interface Rating {
  points: PointValues;
  blend: number;
  gut: number | null;
  secondLook: string | null;
  summary: string;
  photosChecked: number;
  usage: Usage | null;
}

export interface RunContext {
  supabase: SupabaseClient;
  profile: AiProfile;
  system: string;
  schema: Record<string, unknown>;
  examples: ExamplePlace[];
  market: RentMarket;
}

function examplesBlock(ctx: RunContext, listing: Listing): { text: string; count: number } {
  if (ctx.examples.length === 0) return { text: "", count: 0 };
  const pct = rentPercentile(ctx.market, listing.source, listing.metadata);
  const { matched, newest } = pickExamples(listing, pct, ctx.examples, ctx.profile.match_weights);
  const lines = [
    ...matched.map((m) => renderExample(m.ex, ctx.profile, m.match)),
    ...newest.map((ex) => renderExample(ex, ctx.profile, null)),
  ];
  if (lines.length === 0) return { text: "", count: 0 };
  return {
    text:
      "Past listings head office reviewed (similar ones first, then the most recent). " +
      "Learn their taste from where they corrected the AI:\n" +
      lines.join("\n"),
    count: lines.length,
  };
}

/** Facts, examples, photos and the model, combined into one rating. */
export async function rateListing(ctx: RunContext, listing: Listing): Promise<{ facts: PointValues; rating: Rating | null; exampleCount: number }> {
  const facts = computeFacts(listing, ctx.profile, ctx.market);
  const examples = examplesBlock(ctx, listing);
  if (NO_MODEL) return { facts, rating: null, exampleCount: examples.count };

  const photos = await fetchPhotos(listing);
  const photoNote =
    photos.length > 0
      ? `${photos.length} listing photo(s) are attached above.`
      : "No photos could be loaded for this listing. Rate from the text and facts only, and say in the summary that no photos were checked.";
  const userText = [
    "Rate this listing.",
    "",
    buildListingText(listing, facts, ctx.profile),
    "",
    photoNote,
    examples.text ? `\n${examples.text}` : "",
  ]
    .join("\n")
    .trim();

  const reply = await askModel(ctx.profile, ctx.system, ctx.schema, listing, userText, photos);
  if (!reply) return { facts, rating: null, exampleCount: examples.count };

  const { verdict, usage } = reply;
  // Every point in the profile gets an entry, facts included, so the card can
  // draw the full breakdown from this one row.
  const points: PointValues = {};
  for (const p of ctx.profile.points) {
    points[p.id] = p.kind === "fact" ? facts[p.id] : verdict.points[p.id] ?? { value: null, reason: "" };
  }

  // If nothing at all could be rated, the gut score is the only signal left.
  const blend = blendScore(ctx.profile, points) ?? verdict.gut;
  let summary = verdict.summary;
  if (photos.length === 0 && !/photo/i.test(summary)) summary = `${summary} (No photos were checked.)`.trim();

  return {
    facts,
    exampleCount: examples.count,
    rating: {
      points,
      blend,
      gut: verdict.gut,
      secondLook: secondLook(verdict.gut, blend, verdict.disagreement),
      summary,
      photosChecked: photos.length,
      usage,
    },
  };
}

async function saveRating(ctx: RunContext, listing: Listing, rating: Rating): Promise<string | null> {
  const model = ctx.profile.model || DEFAULT_MODEL;
  const { error } = await ctx.supabase.from("ai_ratings").upsert(
    {
      customer_id: ctx.profile.customer_id,
      place_id: listing.id,
      city_id: listing.cityId,
      profile_id: ctx.profile.id,
      points: rating.points,
      blend: rating.blend,
      gut: rating.gut,
      second_look: rating.secondLook,
      summary: rating.summary,
      photos_checked: rating.photosChecked,
      model,
    },
    { onConflict: "place_id,profile_id" }
  );
  if (error) return `ai_ratings: ${error.message}`;

  // The older sort and digest code reads this shape, so it keeps being written.
  const { error: placeError } = await ctx.supabase
    .from("places")
    .update({
      image_analysis: {
        text: {
          reason: rating.summary,
          qualitative_score: rating.blend,
          model,
          scored_at: new Date().toISOString(),
          profile_version: ctx.profile.version,
        },
      },
    })
    .eq("id", listing.id);
  return placeError ? `places: ${placeError.message}` : null;
}

function formatPoints(profile: AiProfile, values: PointValues, kind: "fact" | "ai"): string {
  return profile.points
    .filter((p) => p.kind === kind)
    .map((p) => {
      const v = values[p.id];
      // Fact reasons come from code ("180 m to Sol metro"); AI reasons are
      // model text, so public logs show only the number.
      const showReason = kind === "fact" || !PUBLIC_LOGS;
      return `      ${p.id}: ${v?.value ?? "null"}${showReason ? ` (${v?.reason || "-"})` : ""}`;
    })
    .join("\n");
}

function printDryRun(ctx: RunContext, listing: Listing, facts: PointValues, rating: Rating | null, exampleCount: number) {
  console.log(`  - ${withDistrict(listing)} [${listing.source}, ${listing.id}]`);
  console.log(`    facts:\n${formatPoints(ctx.profile, facts, "fact")}`);
  console.log(`    examples in prompt: ${exampleCount}`);
  if (!rating) return;
  console.log(`    ai points:\n${formatPoints(ctx.profile, rating.points, "ai")}`);
  console.log(
    `    blend ${rating.blend}, gut ${rating.gut ?? "-"}, photos checked ${rating.photosChecked}` +
      (rating.usage ? `, tokens in ${rating.usage.input} / out ${rating.usage.output}` : "")
  );
  if (PUBLIC_LOGS) {
    console.log(`    summary: ${rating.summary.length} characters (hidden in public logs)`);
    console.log(`    second look: ${rating.secondLook ? "yes" : "-"}`);
  } else {
    console.log(`    summary: ${rating.summary}`);
    console.log(`    second look: ${rating.secondLook ?? "-"}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function windowDays(): number | null {
  if (SCORE_ALL) return null;
  if (RESCORE_DAYS != null) return RESCORE_DAYS;
  return WINDOW_DAYS;
}

async function main() {
  console.log("AI Location Scoring");
  console.log("=".repeat(40));

  if (LIMIT != null && !(LIMIT > 0)) throw new Error("--limit must be a positive number");
  if (RESCORE_DAYS != null && !(RESCORE_DAYS > 0)) throw new Error("--rescore-days must be a positive number");

  if (!NO_MODEL && !process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "Warning: ANTHROPIC_API_KEY is not set. Add it to .env.local " +
        "(the GitHub secret is named ANTHROPIC)."
    );
  }

  const supabase = getProdClient();
  const profile = await loadProfile(supabase);
  const propertyCategoryId = await getCategoryId(supabase, CATEGORIES.PROPERTY);

  const cities = CITY_ARG ? [CITY_ARG] : getCityIds();
  const days = windowDays();
  console.log(`Profile: v${profile.version} (${profile.points.length} points, model ${profile.model})`);
  console.log(`Cities: ${cities.join(", ")}`);
  console.log(`Window: ${days == null ? "all listings" : `last ${days} days`}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} listings per city`);
  console.log(`Cap: ${MAX_PER_RUN} listings per run`);
  if (DRY_RUN) console.log(`Dry run: nothing is written${NO_MODEL ? ", and the model is not called (facts only)" : ""}`);
  console.log();

  const examples = await loadExamples(supabase, propertyCategoryId);
  console.log(`Feedback examples available: ${examples.length}\n`);

  const system = buildSystemPrompt(profile);
  const schema = buildOutputSchema(profile);

  let budget = MAX_PER_RUN;
  let totalCandidates = 0;
  let totalScored = 0;
  let totalFailed = 0;
  const totalUsage: Usage = { input: 0, output: 0 };

  for (const cityId of cities) {
    if (budget <= 0) {
      console.log(`${cityId}: skipped, the run cap of ${MAX_PER_RUN} is reached`);
      continue;
    }

    const all = await cityListings(supabase, cityId, propertyCategoryId);
    const market = await cityMarket(supabase, cityId, propertyCategoryId);
    const windowStart = days == null ? null : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const inWindow = windowStart ? all.filter((l) => l.createdAt >= windowStart) : all;

    // Unrated means no row for the *active* profile: a new profile version
    // rates everything again, and a listing that failed last time is retried.
    const rated = await alreadyRated(supabase, profile.id, inWindow.map((l) => l.id));
    let listings = inWindow.filter((l) => !rated.has(l.id));
    if (LIMIT) listings = listings.slice(0, LIMIT);
    listings = listings.slice(0, budget);

    if (listings.length === 0) {
      console.log(`${cityId}: no unrated listings found (${all.length} active, ${inWindow.length} in window)`);
      continue;
    }

    console.log(`${cityId}: rating ${listings.length} listings (${all.length} active, ${rated.size} already rated in window)`);
    budget -= listings.length;
    totalCandidates += listings.length;
    const ctx: RunContext = { supabase, profile, system, schema, examples, market };
    let scored = 0;
    let failed = 0;

    for (let i = 0; i < listings.length; i += BATCH_SIZE) {
      const batch = listings.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(async (l) => ({ listing: l, ...(await rateListing(ctx, l)) })));

      for (const { listing, facts, rating, exampleCount } of results) {
        if (DRY_RUN) printDryRun(ctx, listing, facts, rating, exampleCount);
        if (NO_MODEL) continue;
        if (!rating) {
          failed++;
          continue;
        }
        if (rating.usage) {
          totalUsage.input += rating.usage.input;
          totalUsage.output += rating.usage.output;
        }
        if (DRY_RUN) {
          scored++;
          continue;
        }
        const err = await saveRating(ctx, listing, rating);
        if (err) {
          console.error(`  Failed to save ${listing.address}: ${err}`);
          failed++;
        } else {
          scored++;
        }
      }

      if (NO_MODEL) continue;
      console.log(
        `  Processed ${Math.min(i + BATCH_SIZE, listings.length)}/${listings.length} listings for ${cityId} (scored ${scored}, failed ${failed})`
      );

      // If the very first batch scored nothing, the problem is the setup
      // (missing key, wrong model, API down), so stop rather than repeat it
      // hundreds of times.
      if (i === 0 && scored === 0) {
        throw new Error(
          `The first batch of ${batch.length} listings scored nothing. ` +
            `Stopping before the rest of the run. See the errors above.`
        );
      }

      if (i + BATCH_SIZE < listings.length) await sleep(BATCH_DELAY_MS);
    }

    totalScored += scored;
    totalFailed += failed;
    if (!NO_MODEL) console.log(`${cityId}: scored ${scored}/${listings.length} listings\n`);
  }

  if (NO_MODEL) {
    console.log(`\nDone. Checked facts for ${totalCandidates} listings. Nothing was written.`);
    return;
  }

  console.log(
    `Done. Total scored: ${totalScored}/${totalCandidates} (failed: ${totalFailed})` +
      `, tokens in ${totalUsage.input} / out ${totalUsage.output}` +
      (DRY_RUN ? ". Dry run, nothing was written." : "")
  );

  // Fail loudly. A silent "scored 0" is why this step did nothing for three
  // weeks without anyone noticing.
  if (totalCandidates === 0) return;

  if (totalScored === 0) {
    throw new Error(`Scoring failed for all ${totalCandidates} listings. Nothing was written.`);
  }

  if (totalFailed / totalCandidates > MAX_FAILURE_RATE) {
    throw new Error(
      `Scoring failed for ${totalFailed} of ${totalCandidates} listings ` +
        `(over the ${Math.round(MAX_FAILURE_RATE * 100)}% failure threshold).`
    );
  }
}

// Only run when started directly: the weekly learner (ai-learner.ts) imports
// this file to reuse rateListing and the database readers.
if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

#!/usr/bin/env npx ts-node

/**
 * AI Location Scoring
 *
 * Sends newly scraped property listings to Claude for a qualitative assessment
 * of their potential as specialty coffee cafe locations. Stores the result
 * in the image_analysis column.
 *
 * Usage:
 *   npx ts-node --project scripts/data-pipeline/tsconfig.json scripts/data-pipeline/score-listings.ts
 *   npx ts-node --project scripts/data-pipeline/tsconfig.json scripts/data-pipeline/score-listings.ts --city madrid
 *   npx ts-node --project scripts/data-pipeline/tsconfig.json scripts/data-pipeline/score-listings.ts --city prague --limit 20
 *   npx ts-node --project scripts/data-pipeline/tsconfig.json scripts/data-pipeline/score-listings.ts --all   # backfill, ignores the 24h window
 */

// Parse CLI arguments before imports (same pattern as other pipeline scripts)
const args = process.argv.slice(2);
const cityArgIndex = args.indexOf("--city");
const CITY_ARG = cityArgIndex !== -1 ? args[cityArgIndex + 1]?.toLowerCase() : null;
const limitArgIndex = args.indexOf("--limit");
const LIMIT = limitArgIndex !== -1 ? parseInt(args[limitArgIndex + 1], 10) : null;
// --all drops the 24h recency filter so a backfill can reach older listings.
const SCORE_ALL = args.includes("--all");

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

import Anthropic from "@anthropic-ai/sdk";
import { getProdClient } from "./lib/supabase";
import { getCityIds } from "./config/cities";
import { getCategoryId } from "./lib/scraper-utils";
import { CATEGORIES } from "./lib/categories";
import type { Place } from "./lib/supabase";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You evaluate commercial real estate listings for specialty coffee cafe potential. Score each listing 0-100 and give a one-line reason.

Rents are given in the listing's own currency (EUR or CZK). Judge affordability against local market rates for that currency and city — never assume euros.

High scores (70-100): street-level, high foot traffic area, near metro/transit, good size (50-150sqm), reasonable rent, commercial street, corner unit, good frontage.
Medium scores (40-69): decent location but some drawbacks (basement, side street, expensive, too small/large, limited frontage).
Low scores (0-39): poor location for cafe (industrial area, upper floor, very expensive rent for size, residential-only street, no foot traffic indicators).

Respond with JSON only: {"reason": "one sentence", "qualitative_score": N}`;

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 200;

// A run is treated as broken (exit 1) if more than this share of the listings
// it attempted failed to score. One malformed reply is tolerated; a dead API
// key or an outage is not.
const MAX_FAILURE_RATE = 0.25;

/**
 * Currency per scraper source. Prague listings are in crowns; treating them as
 * euros made every Prague property look ~25x overpriced to the model.
 */
const CURRENCY_BY_SOURCE: Record<string, string> = {
  sreality: "CZK",
  idealista: "EUR",
  idealista_transfer: "EUR",
};

/**
 * Build the user prompt from a Place record
 */
function buildUserPrompt(place: Place): string {
  const meta = (place.metadata || {}) as Record<string, unknown>;
  const size = meta.size || meta.area || "unknown";
  const rent = meta.price || meta.rent || "unknown";
  const district = meta.district || meta.neighborhood || "";
  const source = place.source || "unknown";
  const currency =
    (typeof meta.currency === "string" ? meta.currency : null) ||
    CURRENCY_BY_SOURCE[source] ||
    null;

  // Calculate rent per sqm if both values are numbers
  let rentPerSqm = "";
  const rentNum = typeof rent === "number" ? rent : parseFloat(String(rent));
  const sizeNum = typeof size === "number" ? size : parseFloat(String(size));
  if (!isNaN(rentNum) && !isNaN(sizeNum) && sizeNum > 0) {
    const perSqm = (rentNum / sizeNum).toFixed(1);
    rentPerSqm = currency ? ` (${perSqm} ${currency}/sqm)` : ` (${perSqm}/sqm)`;
  }

  // Gather extra details from metadata. Idealista writes hasStorefront;
  // the older `storefront` key is kept as a fallback for hand-added places.
  const extras: string[] = [];
  if (meta.floor != null) extras.push(`floor: ${meta.floor}`);
  if (meta.hasStorefront || meta.storefront) extras.push("has storefront");
  if (meta.nearestMetro) extras.push(`near metro: ${meta.nearestMetro}`);
  if (meta.description) extras.push(String(meta.description).slice(0, 200));

  const rentLine = currency
    ? `Monthly rent: ${rent} ${currency}${rentPerSqm}`
    : `Monthly rent: ${rent} (currency unknown)${rentPerSqm}`;

  const lines = [
    `Location: ${place.address}${district ? `, ${district}` : ""}`,
    `Size: ${size}sqm`,
    rentLine,
    `Source: ${source}`,
  ];
  if (extras.length > 0) {
    lines.push(`Additional: ${extras.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Score a single listing.
 *
 * Returns null for a listing-level problem (bad JSON, odd response shape).
 * Throws for account-level problems (bad or missing API key) so the run stops
 * immediately instead of burning through every listing with the same error.
 */
async function scoreListing(
  place: Place
): Promise<{ reason: string; qualitative_score: number } | null> {
  const userPrompt = buildUserPrompt(place);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      // Room for the model's own reasoning plus the JSON answer. Too low and
      // the reply gets cut off mid-thought and cannot be parsed.
      max_tokens: 1024,
      // Scoring a listing is a judgement call, not a research task. Low effort
      // keeps it quick and cheap while still letting the model think a little.
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    // The reply can open with a thinking block, so take the first *text*
    // block rather than whatever happens to be first.
    const block = response.content.find(b => b.type === "text");
    if (!block || block.type !== "text") {
      const kinds = response.content.map(b => b.type).join(", ") || "nothing";
      console.error(`  No text in the reply for ${place.address} (got: ${kinds})`);
      return null;
    }

    // Model may wrap JSON in markdown fences despite instructions
    const raw = block.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(raw);
    if (typeof parsed.qualitative_score !== "number" || typeof parsed.reason !== "string") {
      console.error(`  Invalid response shape: ${block.text}`);
      return null;
    }

    const score = Math.max(0, Math.min(100, Math.round(parsed.qualitative_score)));
    return { reason: parsed.reason, qualitative_score: score };
  } catch (err) {
    if (
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError
    ) {
      throw new Error(
        `Anthropic rejected the credentials (${err.status}). ` +
          `Set ANTHROPIC_API_KEY in .env.local locally, or check the ANTHROPIC secret in GitHub.`
      );
    }
    console.error(`  Error scoring ${place.address}: ${err}`);
    return null;
  }
}

/**
 * Fetch unscored property listings for a given city.
 *
 * Default window is the last 24 hours (not 12h) because the Idealista scrape
 * jobs can run up to 12h combined before this script runs; scrapes are 3+ days
 * apart so a wider window never pulls in a previous batch. `--all` drops the
 * window entirely for backfills.
 *
 * Only rows in the Property category are scored — POI scrapes (transit, gyms,
 * cafes) also land in `places` and are not listings we can rate.
 */
async function getUnscoredListings(
  cityId: string | null,
  categoryId: string,
  limit: number | null
) {
  const supabase = getProdClient();

  let query = supabase
    .from("places")
    .select("*")
    .eq("status", "active")
    .eq("category_id", categoryId)
    .is("image_analysis", null)
    .order("created_at", { ascending: false });

  if (!SCORE_ALL) {
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", windowStart);
  }

  if (cityId) {
    query = query.eq("city_id", cityId);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Place[];
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main entry point
 */
async function main() {
  console.log("AI Location Scoring");
  console.log("=".repeat(40));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "Warning: ANTHROPIC_API_KEY is not set. Add it to .env.local " +
        "(the GitHub secret is named ANTHROPIC)."
    );
  }

  // Determine which cities to process
  const cities = CITY_ARG ? [CITY_ARG] : getCityIds();
  console.log(`Cities: ${cities.join(", ")}`);
  console.log(`Window: ${SCORE_ALL ? "all unscored listings" : "last 24 hours"}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} listings per city`);
  console.log();

  const supabase = getProdClient();
  const propertyCategoryId = await getCategoryId(supabase, CATEGORIES.PROPERTY);

  let totalCandidates = 0;
  let totalScored = 0;
  let totalFailed = 0;

  for (const cityId of cities) {
    const listings = await getUnscoredListings(cityId, propertyCategoryId, LIMIT);

    if (listings.length === 0) {
      console.log(`${cityId}: no unscored listings found`);
      continue;
    }

    console.log(`${cityId}: found ${listings.length} unscored listings`);
    totalCandidates += listings.length;
    let scored = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < listings.length; i += BATCH_SIZE) {
      const batch = listings.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (place) => {
          const result = await scoreListing(place);
          return { place, result };
        })
      );

      // Write results to DB
      for (const { place, result } of results) {
        if (!result || !place.id) {
          failed++;
          continue;
        }

        const imageAnalysis = {
          text: {
            reason: result.reason,
            qualitative_score: result.qualitative_score,
            model: MODEL,
            scored_at: new Date().toISOString(),
          },
        };

        const { error } = await supabase
          .from("places")
          .update({ image_analysis: imageAnalysis })
          .eq("id", place.id);

        if (error) {
          console.error(`  Failed to update ${place.address}: ${error.message}`);
          failed++;
        } else {
          scored++;
        }
      }

      console.log(`  Processed ${Math.min(i + BATCH_SIZE, listings.length)}/${listings.length} listings for ${cityId} (scored ${scored}, failed ${failed})`);

      // If the very first batch scored nothing, the problem is the setup
      // (missing key, wrong model, API down) — stop rather than repeat it
      // hundreds of times.
      if (i === 0 && scored === 0) {
        throw new Error(
          `The first batch of ${batch.length} listings scored nothing. ` +
            `Stopping before the rest of the run. See the errors above.`
        );
      }

      // Rate limit delay between batches
      if (i + BATCH_SIZE < listings.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    totalScored += scored;
    totalFailed += failed;
    console.log(`${cityId}: scored ${scored}/${listings.length} listings\n`);
  }

  console.log(`Done. Total scored: ${totalScored}/${totalCandidates} (failed: ${totalFailed})`);

  // Fail loudly. A silent "scored 0" is why this step did nothing for three
  // weeks without anyone noticing.
  if (totalCandidates === 0) return;

  if (totalScored === 0) {
    throw new Error(
      `Scoring failed for all ${totalCandidates} listings. Nothing was written.`
    );
  }

  if (totalFailed / totalCandidates > MAX_FAILURE_RATE) {
    throw new Error(
      `Scoring failed for ${totalFailed} of ${totalCandidates} listings ` +
        `(over the ${Math.round(MAX_FAILURE_RATE * 100)}% failure threshold).`
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});

#!/usr/bin/env npx ts-node

/**
 * AI Location Scoring
 *
 * Sends newly scraped listings to Claude Haiku for a qualitative assessment
 * of their potential as specialty coffee cafe locations. Stores the result
 * in the image_analysis column.
 *
 * Usage:
 *   npx ts-node --project scripts/data-pipeline/tsconfig.json scripts/data-pipeline/score-listings.ts
 *   npx ts-node --project scripts/data-pipeline/tsconfig.json scripts/data-pipeline/score-listings.ts --city madrid
 *   npx ts-node --project scripts/data-pipeline/tsconfig.json scripts/data-pipeline/score-listings.ts --city prague --limit 20
 */

// Parse CLI arguments before imports (same pattern as other pipeline scripts)
const args = process.argv.slice(2);
const cityArgIndex = args.indexOf("--city");
const CITY_ARG = cityArgIndex !== -1 ? args[cityArgIndex + 1]?.toLowerCase() : null;
const limitArgIndex = args.indexOf("--limit");
const LIMIT = limitArgIndex !== -1 ? parseInt(args[limitArgIndex + 1], 10) : null;

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

import Anthropic from "@anthropic-ai/sdk";
import { getProdClient } from "./lib/supabase";
import { getCityIds } from "./config/cities";
import type { Place } from "./lib/supabase";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const SYSTEM_PROMPT = `You evaluate commercial real estate listings for specialty coffee cafe potential. Score each listing 0-100 and give a one-line reason.

High scores (70-100): street-level, high foot traffic area, near metro/transit, good size (50-150sqm), reasonable rent, commercial street, corner unit, good frontage.
Medium scores (40-69): decent location but some drawbacks (basement, side street, expensive, too small/large, limited frontage).
Low scores (0-39): poor location for cafe (industrial area, upper floor, very expensive rent for size, residential-only street, no foot traffic indicators).

Respond with JSON only: {"reason": "one sentence", "qualitative_score": N}`;

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 200;

/**
 * Build the user prompt from a Place record
 */
function buildUserPrompt(place: Place): string {
  const meta = (place.metadata || {}) as Record<string, unknown>;
  const size = meta.size || meta.area || "unknown";
  const rent = meta.price || meta.rent || "unknown";
  const currency = meta.currency || "€";
  const district = meta.district || meta.neighborhood || "";
  const source = place.source || "unknown";

  // Calculate rent per sqm if both values are numbers
  let rentPerSqm = "";
  const rentNum = typeof rent === "number" ? rent : parseFloat(String(rent));
  const sizeNum = typeof size === "number" ? size : parseFloat(String(size));
  if (!isNaN(rentNum) && !isNaN(sizeNum) && sizeNum > 0) {
    rentPerSqm = ` (${(rentNum / sizeNum).toFixed(1)}/sqm)`;
  }

  // Gather extra details from metadata
  const extras: string[] = [];
  if (meta.floor != null) extras.push(`floor: ${meta.floor}`);
  if (meta.storefront) extras.push("has storefront");
  if (meta.nearestMetro) extras.push(`near metro: ${meta.nearestMetro}`);
  if (meta.description) extras.push(String(meta.description).slice(0, 200));

  const lines = [
    `Location: ${place.address}${district ? `, ${district}` : ""}`,
    `Size: ${size}sqm`,
    `Monthly rent: ${currency}${rent}${rentPerSqm}`,
    `Source: ${source}`,
  ];
  if (extras.length > 0) {
    lines.push(`Additional: ${extras.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Score a single listing with Claude Haiku
 */
async function scoreListing(
  place: Place
): Promise<{ reason: string; qualitative_score: number } | null> {
  const userPrompt = buildUserPrompt(place);

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      console.log(`  Unexpected response type: ${block.type}`);
      return null;
    }

    // Model may wrap JSON in markdown fences despite instructions
    const raw = block.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(raw);
    if (typeof parsed.qualitative_score !== "number" || typeof parsed.reason !== "string") {
      console.log(`  Invalid response shape: ${block.text}`);
      return null;
    }

    const score = Math.max(0, Math.min(100, Math.round(parsed.qualitative_score)));
    return { reason: parsed.reason, qualitative_score: score };
  } catch (err) {
    console.log(`  Error scoring ${place.address}: ${err}`);
    return null;
  }
}

/**
 * Fetch unscored listings from the last 24 hours for a given city.
 * 24h (not 12h) because the Idealista scrape jobs can run up to 12h
 * combined before this script runs; scrapes are 3+ days apart so a
 * wider window never pulls in a previous batch.
 */
async function getUnscoredListings(cityId: string | null, limit: number | null) {
  const supabase = getProdClient();
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("places")
    .select("*")
    .gte("created_at", windowStart)
    .eq("status", "active")
    .is("image_analysis", null)
    .order("created_at", { ascending: false });

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

  // Determine which cities to process
  const cities = CITY_ARG ? [CITY_ARG] : getCityIds();
  console.log(`Cities: ${cities.join(", ")}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} listings per city`);
  console.log();

  const supabase = getProdClient();
  let totalScored = 0;

  for (const cityId of cities) {
    const listings = await getUnscoredListings(cityId, LIMIT);

    if (listings.length === 0) {
      console.log(`${cityId}: no unscored listings found`);
      continue;
    }

    console.log(`${cityId}: found ${listings.length} unscored listings`);
    let scored = 0;

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
        if (!result || !place.id) continue;

        const imageAnalysis = {
          text: {
            reason: result.reason,
            qualitative_score: result.qualitative_score,
            model: "claude-haiku-4-5",
            scored_at: new Date().toISOString(),
          },
        };

        const { error } = await supabase
          .from("places")
          .update({ image_analysis: imageAnalysis })
          .eq("id", place.id);

        if (error) {
          console.log(`  Failed to update ${place.address}: ${error.message}`);
        } else {
          scored++;
        }
      }

      console.log(`  Scored ${Math.min(i + BATCH_SIZE, listings.length)}/${listings.length} listings for ${cityId}`);

      // Rate limit delay between batches
      if (i + BATCH_SIZE < listings.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    totalScored += scored;
    console.log(`${cityId}: scored ${scored}/${listings.length} listings\n`);
  }

  console.log(`Done. Total scored: ${totalScored}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

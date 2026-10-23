#!/usr/bin/env npx ts-node

/**
 * Google Regular-Cafe Refresh
 *
 * Re-searches Google Places for "specialty coffee" across each city and
 * updates public/data/google_places_<city>.csv plus the coffee-trip
 * enrichment file. Runs monthly from .github/workflows/euct-refresh.yml,
 * right after the European Coffee Trip refresh, which commits the files.
 *
 * Needs GOOGLE_PLACES_API_KEY. Without it the refresh is skipped, not failed.
 *
 * Usage:
 *   npm run refresh:google                      # Madrid + Prague
 *   npm run refresh:google -- --city prague     # one city
 *   npm run refresh:google -- --dry-run         # fetch and report, write nothing
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

import * as fs from "fs";
import Papa from "papaparse";
import { CITIES, type CityBounds } from "./config/cities";
import { cafePlaceId, diffCafes, saveToReportFile, type ComparableCafe } from "./lib/cafe-report";
import {
  DETAILS_FIELD_MASK,
  ENRICHMENT_COLUMNS,
  GOOGLE_COLUMNS,
  SEARCH_FIELD_MASK,
  checkGoogleSafety,
  coffeeTripKey,
  gridCells,
  mergeGoogleCity,
  type CoffeeTripCafe,
  type EnrichmentRow,
  type GooglePlace,
  type GoogleRow,
  type PlaceCheck,
} from "./lib/google-cafes";

const DATA_DIR = path.join(__dirname, "../../public/data");
const REPORT_FILE = path.join(DATA_DIR, "cafe-changes.json");

/** Cities refreshed by default and their files. Barcelona stays frozen, like its coffee-trip cafes. */
const CITY_FILES: Record<string, { google: string; enrichment: string; coffeeTrip: string }> = {
  madrid: {
    google: "google_places_madrid.csv",
    enrichment: "google_places_enrichment.csv",
    coffeeTrip: "cafe_info.csv",
  },
  prague: {
    google: "google_places_prague.csv",
    enrichment: "google_places_enrichment_prague.csv",
    coffeeTrip: "prague_cafe_info.csv",
  },
};

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const SEARCH_QUERY = "specialty coffee";
const GRID_SIZE = 6;
const PAGE_SIZE = 20;
/** Google's limit for one search, across all its pages. A square that hits it is split. */
const MAX_RESULTS_PER_SEARCH = 60;
// A 6x6 grid needs at most 108 searches (3 pages per square). Quarters of full
// squares only start below SPLIT_BUDGET, so splitting never reaches the hard cap,
// which only stops a runaway loop.
const SPLIT_BUDGET = 200;
const MAX_SEARCHES_PER_CITY = 300;
const MAX_CHECKS_PER_CITY = 300;
const CHECK_PAUSE_MS = 200;
// More new cafes than this share of the city in one run is the search catching
// up (like the first run with split squares), not new openings: not emailed as new.
const CATCH_UP_RATIO = 0.25;
// After this many failed checks in a row Google is down or throttling us: skip the rest.
const MAX_FAILED_CHECKS_IN_A_ROW = 5;
const TIMEOUT_MS = 30_000;
const BACKOFF_MS = [2_000, 5_000];

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const cityArg = args.includes("--city") ? args[args.indexOf("--city") + 1]?.toLowerCase() : null;
const API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? "";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One Google call with a timeout and two retries. 404 resolves to null; other failures throw. */
async function googleRequest(url: string, init: RequestInit, fieldMask: string): Promise<unknown | null> {
  let lastError = "";
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": API_KEY, "X-Goog-FieldMask": fieldMask },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 404) return null;
      if (response.ok) return await response.json();
      lastError = `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < BACKOFF_MS.length) await sleep(BACKOFF_MS[attempt]);
  }
  throw new Error(lastError);
}

/**
 * Search every grid square (up to 60 results each). A square that comes back
 * full is searched again as four quarters, while the split budget lasts.
 * Throws if a square still fails after retries.
 */
async function searchCity(
  bounds: CityBounds
): Promise<{ places: GooglePlace[]; searches: number; split: number; skipped: number }> {
  const byId = new Map<string, GooglePlace>();
  let searches = 0;
  let split = 0;
  let skipped = 0;

  const queue = gridCells(bounds, GRID_SIZE);
  const gridSize = queue.length;
  for (let i = 0; i < queue.length; i++) {
    if (i >= gridSize && searches >= SPLIT_BUDGET) {
      skipped = queue.length - i;
      break;
    }
    const cell = queue[i];
    let results = 0;
    let pageToken: string | undefined;
    do {
      if (searches >= MAX_SEARCHES_PER_CITY) throw new Error(`spend cap of ${MAX_SEARCHES_PER_CITY} searches reached`);
      searches++;
      const data = (await googleRequest(
        SEARCH_URL,
        {
          method: "POST",
          body: JSON.stringify({
            textQuery: SEARCH_QUERY,
            languageCode: "en",
            locationRestriction: {
              rectangle: {
                low: { latitude: cell.south, longitude: cell.west },
                high: { latitude: cell.north, longitude: cell.east },
              },
            },
            maxResultCount: PAGE_SIZE,
            ...(pageToken ? { pageToken } : {}),
          }),
        },
        SEARCH_FIELD_MASK
      )) as { places?: GooglePlace[]; nextPageToken?: string } | null;

      for (const place of data?.places ?? []) byId.set(place.id, place);
      results += data?.places?.length ?? 0;
      pageToken = data?.nextPageToken;
      if (pageToken) await sleep(300);
    } while (pageToken);

    if (results >= MAX_RESULTS_PER_SEARCH) {
      split++;
      queue.push(...gridCells(cell, 2));
    }
  }
  return { places: [...byId.values()], searches, split, skipped };
}

/**
 * Ask Google about one place the search missed, with the same details the
 * search returns. Any error counts as "failed": the cafe is kept as it was.
 */
async function checkPlace(id: string, name: string): Promise<PlaceCheck> {
  try {
    const data = (await googleRequest(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
      { method: "GET" },
      DETAILS_FIELD_MASK
    )) as GooglePlace | null;
    if (!data) return { status: "gone" };
    if (data.businessStatus === "CLOSED_PERMANENTLY") return { status: "closed" };
    return { status: "open", place: data };
  } catch (err) {
    console.log(`  Check failed for ${name}: ${err instanceof Error ? err.message : err}`);
    return { status: "failed" };
  }
}

function readCsv<T>(fileName: string): { rows: T[]; columns: string[] } {
  const parsed = Papa.parse<T>(fs.readFileSync(path.join(DATA_DIR, fileName), "utf-8"), {
    header: true,
    skipEmptyLines: true,
  });
  return { rows: parsed.data, columns: parsed.meta.fields ?? [] };
}

function writeCsv(fileName: string, rows: object[], columns: readonly string[]): void {
  fs.writeFileSync(path.join(DATA_DIR, fileName), Papa.unparse(rows, { columns: [...columns], newline: "\n" }) + "\n");
}

/** Refresh one city. Returns false when a safety stop left its files untouched. */
async function refreshCity(city: string): Promise<boolean> {
  const files = CITY_FILES[city];
  console.log(`\n=== ${city} (${files.google}) ===`);

  const google = readCsv<GoogleRow>(files.google);
  const enrichment = readCsv<EnrichmentRow>(files.enrichment);
  const coffeeTrip = readCsv<CoffeeTripCafe>(files.coffeeTrip).rows.filter((c) => c.latitude && c.longitude);

  let found: GooglePlace[];
  try {
    const result = await searchCity(CITIES[city].bounds);
    found = result.places;
    console.log(
      `  ${result.searches} searches, ${found.length} places (file has ${google.rows.length}); ` +
        `${result.split} full squares split, ${result.skipped} quarters skipped over budget`
    );
  } catch (err) {
    console.error(`  STOPPED, files left untouched: search failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }

  // Cafes the search missed: ask Google about each one before removing anything.
  const foundIds = new Set(found.map((p) => p.id));
  const missing = google.rows.filter((r) => r.source_id && !foundIds.has(r.source_id));
  const checks = new Map<string, PlaceCheck>();
  let failedInARow = 0;
  for (const row of missing) {
    if (checks.size >= MAX_CHECKS_PER_CITY || failedInARow >= MAX_FAILED_CHECKS_IN_A_ROW) {
      checks.set(row.source_id, { status: "failed" });
      continue;
    }
    const check = await checkPlace(row.source_id, row.name);
    failedInARow = check.status === "failed" ? failedInARow + 1 : 0;
    checks.set(row.source_id, check);
    await sleep(CHECK_PAUSE_MS);
  }
  const tally = (s: PlaceCheck["status"]) => [...checks.values()].filter((c) => c.status === s).length;
  console.log(
    `  Missed by search: ${missing.length} (still open ${tally("open")}, closed ${tally("closed")}, ` +
      `gone ${tally("gone")}, check failed ${tally("failed")})`
  );
  if (tally("failed")) {
    // ::warning:: shows on the GitHub run page without failing the run.
    console.log(`::warning::${city}: ${tally("failed")} cafe checks failed, those cafes keep their old details`);
  }

  const now = new Date().toISOString();
  const { rows, enrichment: nextEnrichment, stats } = mergeGoogleCity({
    existing: google.rows,
    found,
    checks,
    coffeeTrip,
    enrichment: enrichment.rows,
    now,
  });

  const stop = checkGoogleSafety(google.rows.length, found.length, stats.removed.length);
  if (stop) {
    console.error(`  STOPPED, files left untouched: ${stop}`);
    return false;
  }

  console.log(
    `  Refreshed ${stats.refreshed} from search and ${stats.refreshedByLookup} by lookup, ` +
      `kept unseen ${stats.keptUnseen}, added ${stats.added.length}, ` +
      `removed ${stats.removed.length}, relinked ${stats.relinked.length}`
  );
  const skipped = Object.entries(stats.skippedTypes).sort((a, b) => b[1] - a[1]);
  console.log(
    `  Skipped ${skipped.reduce((n, [, c]) => n + c, 0)} new non-cafes: ` +
      skipped.map(([type, count]) => `${type} ${count}`).join(", ")
  );
  console.log(`  Coffee-trip details: updated ${stats.coffeeTripUpdated}, added ${stats.coffeeTripAdded.length}`);
  for (const [label, names] of Object.entries({
    Added: stats.added,
    Removed: stats.removed,
    Relinked: stats.relinked,
    "Coffee-trip details added": stats.coffeeTripAdded,
  })) {
    if (names.length) console.log(`  ${label}: ${names.join("; ")}`);
  }

  if (DRY_RUN) {
    console.log("  Dry run: files not written");
    return true;
  }
  writeCsv(files.google, rows, GOOGLE_COLUMNS);
  writeCsv(files.enrichment, nextEnrichment, ENRICHMENT_COLUMNS);
  console.log(`  Wrote ${rows.length} cafes, ${nextEnrichment.length} coffee-trip details`);

  // Report. A file without a price column has never been refreshed: its "new" would
  // include cafes the old search simply missed, and its ratings are months old.
  const asComparable = (r: GoogleRow): ComparableCafe => ({
    placeId: cafePlaceId(r.lat, r.lon),
    name: r.name,
    rating: r.rating,
    price: r.priceRange,
  });
  const firstRefresh = !google.columns.includes("priceRange");
  const catchUp = stats.added.length > google.rows.length * CATCH_UP_RATIO;
  if (catchUp) console.log(`  ${stats.added.length} new cafes is a catch-up: not reported as new`);
  const changes = diffCafes("regular", google.rows.map(asComparable), rows.map(asComparable), {
    reportAdded: !firstRefresh && !catchUp,
    reportChanged: !firstRefresh,
  });

  // Coffee-trip pins' Google details: rating and price changes only, linked to the pin.
  if (enrichment.columns.includes("gp_priceRange")) {
    const pins = new Map(coffeeTrip.map((c) => [coffeeTripKey(c.latitude, c.longitude), c]));
    const asPin = (e: EnrichmentRow): ComparableCafe | null => {
      const pin = pins.get(coffeeTripKey(e.euct_lat, e.euct_lon));
      return pin
        ? { placeId: cafePlaceId(pin.latitude, pin.longitude), name: pin.name, rating: e.gp_rating, price: e.gp_priceRange }
        : null;
    };
    const known = (list: EnrichmentRow[]) => list.map(asPin).filter((c): c is ComparableCafe => c !== null);
    const pinChanges = diffCafes("coffee-trip", known(enrichment.rows), known(nextEnrichment), { reportAdded: false });
    changes.changed.push(...pinChanges.changed);
  }

  saveToReportFile(REPORT_FILE, city, changes);
  return true;
}

async function main() {
  if (!API_KEY) {
    // ::warning:: shows on the GitHub run page without failing the run.
    console.log("::warning::GOOGLE_PLACES_API_KEY is not set, Google cafe refresh skipped");
    return;
  }
  if (cityArg && !CITY_FILES[cityArg]) {
    console.error(`Unknown city "${cityArg}". Choose one of: ${Object.keys(CITY_FILES).join(", ")}`);
    process.exit(1);
  }

  let allOk = true;
  for (const city of cityArg ? [cityArg] : Object.keys(CITY_FILES)) {
    // One city failing must not block the other.
    if (!(await refreshCity(city))) allOk = false;
  }
  console.log(`\nDone${DRY_RUN ? " (dry run)" : ""}.`);
  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

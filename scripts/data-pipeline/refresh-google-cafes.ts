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
  ENRICHMENT_COLUMNS,
  GOOGLE_COLUMNS,
  SEARCH_FIELD_MASK,
  checkGoogleSafety,
  coffeeTripKey,
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
// A 6x6 grid needs at most 108 searches (3 pages per square). The caps stop a runaway loop.
const MAX_SEARCHES_PER_CITY = 300;
const MAX_CHECKS_PER_CITY = 300;
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

function gridCells(bounds: CityBounds): CityBounds[] {
  const latStep = (bounds.north - bounds.south) / GRID_SIZE;
  const lonStep = (bounds.east - bounds.west) / GRID_SIZE;
  const cells: CityBounds[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      cells.push({
        south: bounds.south + row * latStep,
        north: bounds.south + (row + 1) * latStep,
        west: bounds.west + col * lonStep,
        east: bounds.west + (col + 1) * lonStep,
      });
    }
  }
  return cells;
}

/** Search every grid square (up to 60 results each). Throws if a square still fails after retries. */
async function searchCity(bounds: CityBounds): Promise<{ places: GooglePlace[]; searches: number }> {
  const byId = new Map<string, GooglePlace>();
  let searches = 0;

  for (const cell of gridCells(bounds)) {
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
      pageToken = data?.nextPageToken;
      if (pageToken) await sleep(300);
    } while (pageToken);
  }
  return { places: [...byId.values()], searches };
}

/** Ask Google about one place the search missed. Any error counts as "failed": the cafe is kept. */
async function checkPlace(id: string): Promise<PlaceCheck> {
  try {
    const data = (await googleRequest(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
      { method: "GET" },
      "id,businessStatus"
    )) as { id?: string; businessStatus?: string } | null;
    if (!data) return { status: "gone" };
    if (data.businessStatus === "CLOSED_PERMANENTLY") return { status: "closed" };
    return { status: "open", newId: data.id && data.id !== id ? data.id : undefined };
  } catch {
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
    console.log(`  ${result.searches} searches, ${found.length} places (file has ${google.rows.length})`);
  } catch (err) {
    console.error(`  STOPPED, files left untouched: search failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }

  // Cafes the search missed: ask Google about each one before removing anything.
  const foundIds = new Set(found.map((p) => p.id));
  const missing = google.rows.map((r) => r.source_id).filter((id) => id && !foundIds.has(id));
  const checks = new Map<string, PlaceCheck>();
  for (const id of missing) {
    checks.set(id, checks.size < MAX_CHECKS_PER_CITY ? await checkPlace(id) : { status: "failed" });
  }
  const tally = (s: PlaceCheck["status"]) => [...checks.values()].filter((c) => c.status === s).length;
  console.log(
    `  Missed by search: ${missing.length} (still open ${tally("open")}, closed ${tally("closed")}, ` +
      `gone ${tally("gone")}, check failed ${tally("failed")})`
  );

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
    `  Refreshed ${stats.refreshed}, kept unseen ${stats.keptUnseen}, added ${stats.added.length}, ` +
      `removed ${stats.removed.length}, relinked ${stats.relinked.length}, skipped non-cafes ${stats.skippedNonCafe}`
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
  const changes = diffCafes("regular", google.rows.map(asComparable), rows.map(asComparable), {
    reportAdded: !firstRefresh,
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

#!/usr/bin/env npx ts-node

/**
 * Sreality.cz Scraper
 *
 * Scrapes property listings from a Sreality search URL via the rebuilt 2026
 * Sreality JSON API (https://www.sreality.cz/api/v1/estates) and writes to
 * Supabase.
 *
 * Two phases:
 *   1. Search list endpoint -> one "seed" per listing (id, name, gps, price,
 *      photos). The list reply already carries enough to publish.
 *   2. Detail endpoint per listing -> enrich the seed with description,
 *      condition, size, floor, etc. If a detail fetch fails, the seed is kept.
 *
 * Usage:
 *   npm run fetch:sreality                                    # Interactive
 *   npm run fetch:sreality -- --headless --url "https://..."  # CI mode
 *   npm run fetch:sreality -- --city prague                   # Set city
 */

const args = process.argv.slice(2);
const HEADLESS = args.includes("--headless");
const DRY_RUN = args.includes("--dry-run"); // run all phases, print results, no DB writes
const cityArgIndex = args.indexOf("--city");
const CITY_ARG = cityArgIndex !== -1 ? args[cityArgIndex + 1]?.toLowerCase() : null;
const urlArgIndex = args.indexOf("--url");
const URL_ARG = urlArgIndex !== -1 ? args[urlArgIndex + 1] : null;

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

import * as readline from "readline";
import { SOURCES, getCategoryForSreality } from "./lib/categories";
import {
  parseSrealityUrl,
  buildApiUrl,
  CATEGORY_TYPE_SLUGS,
  CATEGORY_MAIN_SLUGS,
  CATEGORY_SUB_DETAIL_SLUGS,
} from "./config/sreality";
import { getCity } from "./config/cities";
import {
  getDevClient,
  getProdClient,
  checkConfig,
  markUnseenAsInactive,
} from "./lib/supabase";
import {
  getCategoryId,
  publishListings,
  sendScraperReport,
  type ValidatedListing,
} from "./lib/scraper-utils";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SEARCH_API = "https://www.sreality.cz/api/v1/estates/search";
const DETAIL_API_BASE = "https://www.sreality.cz/api/v1/estates";
const DELAY_BETWEEN_PAGES = 500;
const DELAY_BETWEEN_DETAILS = 300;
const MAX_OFFSET = 5000; // safety cap so pagination can never loop forever

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json",
};

const CZ_BOUNDS = {
  latMin: 48.5,
  latMax: 51.1,
  lonMin: 12.0,
  lonMax: 18.9,
};

// Listings containing these terms (case-insensitive) in name are excluded
const BLOCKED_KEYWORDS = ["kancelář", "kanceláře"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SrealityListing {
  hashId: string;
  url: string;
  name: string;
  locality: string;
  price: number | null;
  pricePerSqm: number | null;
  size: number | null;
  latitude: number | null;
  longitude: number | null;
  description: string;
  photos: string[];
  condition: string | null;
  buildingType: string | null;
  floor: string | null;
  elevator: boolean | null;
  barrierFree: boolean | null;
  garage: boolean | null;
  energyRating: string | null;
  moveInDate: string | null;
  nearbyPoi: Record<string, unknown>;
}

// Loose shapes for the parts of the API payloads we read
interface CodebookValue {
  name?: string;
  value?: number;
}
interface SrealityLocality {
  city?: string;
  citypart?: string;
  quarter?: string;
  street?: string;
  gps_lat?: number;
  gps_lon?: number;
  city_seo_name?: string;
  citypart_seo_name?: string | null;
  quarter_seo_name?: string | null;
  street_seo_name?: string | null;
}
interface SrealityImage {
  url?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPrompt(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function isValidCzCoordinate(lat: number, lon: number): boolean {
  return (
    lat >= CZ_BOUNDS.latMin && lat <= CZ_BOUNDS.latMax &&
    lon >= CZ_BOUNDS.lonMin && lon <= CZ_BOUNDS.lonMax
  );
}

// sReality's image CDN (sdn.cz) returns HTTP 401 for a bare image URL. A
// transform suffix is mandatory and only specific whitelisted presets work.
// This preset is the one sreality.cz itself serves; it yields a ~750px JPEG.
const SREALITY_IMG_TRANSFORM = "?fl=res,749,562,3|shr,,20|jpg,90";

// Normalize one raw image entry into a ready-to-display URL.
// The search (list) API returns advert_images as bare strings
// ("//d18-a.sdn.cz/..."); the detail API returns objects ({ url: "//..." }).
// Accept either shape, force https, and append the CDN transform.
function normalizePhoto(img: string | SrealityImage | undefined): string | null {
  const raw = typeof img === "string" ? img : img?.url;
  if (!raw || typeof raw !== "string") return null;
  let url = raw.startsWith("//") ? `https:${raw}` : raw;
  // Append the CDN transform only when the URL carries no query string yet, so
  // an already-transformed (or otherwise signed) URL is never double-appended.
  if (url.includes("sdn.cz") && !url.includes("?")) {
    url += SREALITY_IMG_TRANSFORM;
  }
  return url;
}

function collectPhotos(images: Array<string | SrealityImage> | undefined): string[] {
  if (!images) return [];
  return images
    .map(normalizePhoto)
    .filter((u): u is string => u !== null);
}

// Codebook fields look like {name, value}. value 1 = yes, 2 = no, 0 = unset.
function cbBool(field: CodebookValue | undefined | null): boolean | null {
  if (!field || typeof field.value !== "number") return null;
  if (field.value === 1) return true;
  if (field.value === 2) return false;
  return null;
}

// Codebook label, or null when unset. value 0 and "- ..." names (e.g.
// "- nezadáno", "- vyber třídu") are placeholders, not real values.
function cbName(field: CodebookValue | undefined | null): string | null {
  if (!field || !field.name) return null;
  if (field.value === 0 || field.name.startsWith("- ")) return null;
  return field.name;
}

// Human-readable address from the locality object.
function buildAddress(loc: SrealityLocality | undefined): string {
  if (!loc) return "";
  const part = loc.citypart || loc.quarter;
  return [loc.street, part, loc.city].filter(Boolean).join(", ");
}

// Locality slug segment for the public detail URL: "praha-nove-mesto-petrska".
function buildLocalitySlug(loc: SrealityLocality | undefined): string {
  if (!loc) return "";
  const part = loc.citypart_seo_name || loc.quarter_seo_name;
  return [loc.city_seo_name, part, loc.street_seo_name].filter(Boolean).join("-");
}

// Public detail URL, e.g.
// https://www.sreality.cz/detail/pronajem/komercni/restaurace/praha-karlin-vitkova/123
function buildDetailUrl(
  typeCb: number | undefined,
  mainCb: number | undefined,
  subCb: number | undefined,
  loc: SrealityLocality | undefined,
  hashId: string
): string {
  const typeSlug = (typeCb && CATEGORY_TYPE_SLUGS[typeCb]) || "pronajem";
  const mainSlug = (mainCb && CATEGORY_MAIN_SLUGS[mainCb]) || "komercni";
  const subSlug = (subCb && CATEGORY_SUB_DETAIL_SLUGS[subCb]) || "ostatni-komercni-prostory";
  const localitySlug = buildLocalitySlug(loc);
  return `https://www.sreality.cz/detail/${typeSlug}/${mainSlug}/${subSlug}/${localitySlug}/${hashId}`;
}

// Flat poi_*_distance fields -> a single object kept in metadata.
function extractPoi(result: Record<string, unknown>): Record<string, unknown> {
  const poi: Record<string, unknown> = {};
  for (const key of Object.keys(result)) {
    if (key.startsWith("poi_") && key.endsWith("_distance") && result[key] != null) {
      poi[key] = result[key];
    }
  }
  return poi;
}

// ---------------------------------------------------------------------------
// Phase 1: Fetch listing seeds via the search API
// ---------------------------------------------------------------------------

// Map one search-result row into a publishable seed listing.
function mapListResult(r: Record<string, any>): SrealityListing {
  const hashId = String(r.hash_id);
  const loc: SrealityLocality | undefined = r.locality;
  return {
    hashId,
    url: buildDetailUrl(
      r.category_type_cb?.value,
      r.category_main_cb?.value,
      r.category_sub_cb?.value,
      loc,
      hashId
    ),
    name: r.advert_name || `Listing ${hashId}`,
    locality: buildAddress(loc),
    price: r.price_summary_czk ?? r.price_summary ?? r.price_czk ?? null,
    pricePerSqm: r.price_czk_m2 ?? null,
    size: null,
    latitude: loc?.gps_lat ?? null,
    longitude: loc?.gps_lon ?? null,
    description: "",
    photos: collectPhotos(r.advert_images),
    condition: null,
    buildingType: null,
    floor: null,
    elevator: null,
    barrierFree: null,
    garage: null,
    energyRating: null,
    moveInDate: null,
    nearbyPoi: {},
  };
}

async function fetchListViaApi(
  searchUrl: string,
  cityId: string
): Promise<{ seeds: SrealityListing[]; reportedTotal: number }> {
  const city = getCity(cityId);
  if (!city) {
    throw new Error(`Unknown city "${cityId}". Check config/cities.ts.`);
  }
  const apiParams = parseSrealityUrl(searchUrl, city.srealityRegionId);

  console.log(`  API params: type=${apiParams.category_type_cb} main=${apiParams.category_main_cb} sub=${apiParams.category_sub_cb || "all"}`);
  if (apiParams.building_condition) console.log(`  Condition filter: ${apiParams.building_condition}`);
  if (apiParams.usable_area_from || apiParams.usable_area_to) {
    console.log(`  Area filter: ${apiParams.usable_area_from ?? "0"}-${apiParams.usable_area_to ?? "∞"} m²`);
  }

  const seeds: SrealityListing[] = [];
  const seenIds = new Set<string>();
  let reportedTotal = 0;
  let offset = 0;

  while (offset < MAX_OFFSET) {
    const url = buildApiUrl(apiParams, offset);
    console.log(`  Offset ${offset}: fetching...`);

    try {
      const res = await fetch(url, { headers: REQUEST_HEADERS });
      if (!res.ok) {
        console.log(`  Got HTTP ${res.status}, stopping pagination.`);
        break;
      }

      const data = await res.json();
      reportedTotal = data.pagination?.total ?? reportedTotal;

      const results: Record<string, any>[] = data.results || [];
      if (results.length === 0) {
        console.log(`  Offset ${offset}: 0 results, done.`);
        break;
      }

      let newOnThisPage = 0;
      for (const r of results) {
        if (typeof r.hash_id !== "number") continue;
        const hashId = String(r.hash_id);
        if (seenIds.has(hashId)) continue;
        seenIds.add(hashId);
        seeds.push(mapListResult(r));
        newOnThisPage++;
      }

      console.log(`    ${results.length} results, ${newOnThisPage} new (${seeds.length} total of ${reportedTotal})`);

      if (newOnThisPage === 0) {
        console.log(`  No new listings, done.`);
        break;
      }

      offset += apiParams.limit;
      if (reportedTotal > 0 && offset >= reportedTotal) break;
      await sleep(DELAY_BETWEEN_PAGES);
    } catch (err) {
      console.error(`  Error fetching offset ${offset}:`, err);
      break;
    }
  }

  return { seeds, reportedTotal };
}

// ---------------------------------------------------------------------------
// Phase 2: Enrich each seed with detail data
// ---------------------------------------------------------------------------

// Merge detail fields onto a seed. Detail wins; seed is the fallback.
function mergeDetail(seed: SrealityListing, result: Record<string, any>): SrealityListing {
  const loc: SrealityLocality | undefined = result.locality;
  const detailPhotos = collectPhotos(result.advert_images);

  return {
    ...seed,
    name: result.advert_name || seed.name,
    locality: buildAddress(loc) || seed.locality,
    description: result.advert_description || "",
    price: result.price_summary_czk ?? result.price_summary ?? seed.price,
    pricePerSqm: result.price_czk_m2 ?? seed.pricePerSqm,
    size: typeof result.usable_area === "number" ? result.usable_area : seed.size,
    latitude: loc?.gps_lat ?? seed.latitude,
    longitude: loc?.gps_lon ?? seed.longitude,
    photos: detailPhotos.length > 0 ? detailPhotos : seed.photos,
    condition: cbName(result.building_condition),
    buildingType: cbName(result.building_type),
    floor: result.floor_number != null ? String(result.floor_number) : null,
    elevator: cbBool(result.elevator),
    barrierFree: cbBool(result.easy_access),
    garage: typeof result.garage === "boolean" ? result.garage : null,
    energyRating: cbName(result.energy_efficiency_rating_cb),
    moveInDate: result.ready_date || result.beginning_date || null,
    nearbyPoi: extractPoi(result),
  };
}

async function fetchListingDetail(seed: SrealityListing): Promise<SrealityListing> {
  try {
    const res = await fetch(`${DETAIL_API_BASE}/${seed.hashId}`, { headers: REQUEST_HEADERS });
    if (!res.ok) {
      if (res.status === 404 || res.status === 410) {
        console.log(`    ${seed.hashId}: listing removed (${res.status}), using list data`);
      } else {
        console.log(`    ${seed.hashId}: HTTP ${res.status}, using list data`);
      }
      return seed;
    }

    const data = await res.json();
    const result = data.result;
    if (!result) return seed;

    return mergeDetail(seed, result);
  } catch (err) {
    console.error(`    ${seed.hashId}: fetch error, using list data:`, err);
    return seed;
  }
}

async function enrichWithDetails(seeds: SrealityListing[]): Promise<SrealityListing[]> {
  const listings: SrealityListing[] = [];
  let done = 0;

  for (const seed of seeds) {
    listings.push(await fetchListingDetail(seed));
    done++;
    if (done % 20 === 0) {
      console.log(`  Progress: ${done}/${seeds.length}`);
    }
    await sleep(DELAY_BETWEEN_DETAILS);
  }

  return listings;
}

// ---------------------------------------------------------------------------
// Transform Sreality listings to ValidatedListing format
// ---------------------------------------------------------------------------

function transformListings(listings: SrealityListing[]): { valid: ValidatedListing[]; skipped: number } {
  let skipped = 0;
  const valid: ValidatedListing[] = [];

  for (const listing of listings) {
    if (!listing.latitude || !listing.longitude) {
      skipped++;
      continue;
    }
    if (!isValidCzCoordinate(listing.latitude, listing.longitude)) {
      skipped++;
      continue;
    }
    if (!listing.name) {
      skipped++;
      continue;
    }

    const nameToCheck = listing.name.toLowerCase();
    if (BLOCKED_KEYWORDS.some((kw) => nameToCheck.includes(kw))) {
      console.log(`  Filtered (office keyword): ${listing.name}`);
      skipped++;
      continue;
    }

    valid.push({
      sourceId: listing.hashId,
      name: listing.name,
      address: listing.locality,
      latitude: listing.latitude,
      longitude: listing.longitude,
      price: listing.price,
      photos: listing.photos,
      metadata: {
        url: listing.url,
        price: listing.price,
        pricePerSqm: listing.pricePerSqm,
        size: listing.size,
        district: listing.locality,
        condition: listing.condition,
        buildingType: listing.buildingType,
        floor: listing.floor,
        elevator: listing.elevator,
        barrierFree: listing.barrierFree,
        garage: listing.garage,
        energyRating: listing.energyRating,
        moveInDate: listing.moveInDate,
        description: listing.description,
        nearbyPoi: listing.nearbyPoi,
      },
    });
  }

  return { valid, skipped };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n=== Sreality.cz Scraper ===\n");

  const config = checkConfig();
  if (!config.dev && !config.prod) {
    console.error("No Supabase credentials found. Add them to .env.local");
    process.exit(1);
  }

  let searchUrl = URL_ARG || "";
  if (!searchUrl) {
    if (HEADLESS) {
      console.error("--headless mode requires --url parameter");
      process.exit(1);
    }
    const rl = createPrompt();
    searchUrl = await ask(rl, "Paste Sreality search URL: ");
    rl.close();
  }

  if (!searchUrl.includes("sreality.cz")) {
    console.error("Not a valid Sreality URL.");
    process.exit(1);
  }

  const selectedCityId = CITY_ARG || "prague";
  console.log(`City: ${selectedCityId}`);

  const writeToDevFirst = !HEADLESS && config.dev;
  const writeToProd = HEADLESS && config.prod;

  // Phase 1: Fetch listing seeds via the search API
  console.log("\n--- Phase 1: Fetching listings via API ---\n");
  const { seeds, reportedTotal } = await fetchListViaApi(searchUrl, selectedCityId);

  if (seeds.length === 0) {
    console.error("\nNo listings found. Check the URL and filters.");
    process.exit(1);
  }
  console.log(`\nFound ${seeds.length} listings total (sReality reported ${reportedTotal}).`);

  // Phase 2: Enrich with details
  console.log("\n--- Phase 2: Fetching listing details ---\n");
  const listings = await enrichWithDetails(seeds);
  console.log(`\nEnriched ${listings.length} listings.`);

  const { valid: validListings, skipped: skippedValidation } = transformListings(listings);
  console.log(`\nValid listings: ${validListings.length} (skipped ${skippedValidation} with missing data)`);

  if (DRY_RUN) {
    console.log("\n[dry-run] Sample of mapped listings (first 3):");
    console.log(JSON.stringify(validListings.slice(0, 3), null, 2));
    console.log(`\n[dry-run] ${validListings.length} valid, ${skippedValidation} skipped. No DB writes.`);
    return;
  }

  const seenIds = new Set(validListings.map((l) => l.sourceId));

  // Phase 3: Publish
  console.log("\n--- Phase 3: Publishing to Supabase ---");

  if (writeToDevFirst) {
    const devClient = getDevClient();
    const categoryId = await getCategoryId(devClient, getCategoryForSreality());

    const devResult = await publishListings(
      devClient, validListings, selectedCityId, categoryId, SOURCES.SREALITY, "DEV"
    );
    console.log(`\n  DEV results:`);
    console.log(`    Inserted:      ${devResult.inserted}`);
    console.log(`    Updated:       ${devResult.updated}`);
    console.log(`    Price changes: ${devResult.priceChanges}`);
    console.log(`    Errors:        ${devResult.errors}`);

    const { inactivated: devInactivated } = await markUnseenAsInactive(
      devClient, selectedCityId, SOURCES.SREALITY, seenIds, 0.5
    );
    if (devInactivated > 0) console.log(`    Inactivated:   ${devInactivated}`);

    if (config.prod) {
      const rl = createPrompt();
      const answer = await ask(rl, "\nPush to PROD? (y/n): ");
      rl.close();

      if (answer.toLowerCase() === "y") {
        const prodClient = getProdClient();
        const prodCategoryId = await getCategoryId(prodClient, getCategoryForSreality());
        const prodResult = await publishListings(
          prodClient, validListings, selectedCityId, prodCategoryId, SOURCES.SREALITY, "PROD"
        );
        console.log(`\n  PROD results:`);
        console.log(`    Inserted:      ${prodResult.inserted}`);
        console.log(`    Updated:       ${prodResult.updated}`);
        console.log(`    Price changes: ${prodResult.priceChanges}`);
        console.log(`    Errors:        ${prodResult.errors}`);

        const { inactivated: prodInactivated } = await markUnseenAsInactive(
          prodClient, selectedCityId, SOURCES.SREALITY, seenIds, 0.5
        );
        if (prodInactivated > 0) console.log(`    Inactivated:   ${prodInactivated}`);
      }
    }
  }

  if (writeToProd) {
    const prodClient = getProdClient();
    const categoryId = await getCategoryId(prodClient, getCategoryForSreality());

    const result = await publishListings(
      prodClient, validListings, selectedCityId, categoryId, SOURCES.SREALITY, "PROD"
    );
    console.log(`\n  PROD results:`);
    console.log(`    Inserted:      ${result.inserted}`);
    console.log(`    Updated:       ${result.updated}`);
    console.log(`    Price changes: ${result.priceChanges}`);
    console.log(`    Errors:        ${result.errors}`);

    const { inactivated, safetyGuardTripped } = await markUnseenAsInactive(
      prodClient, selectedCityId, SOURCES.SREALITY, seenIds, 0.5
    );
    if (inactivated > 0) console.log(`    Inactivated:   ${inactivated}`);

    console.log("\nSending report...");
    await sendScraperReport({
      sourceName: "Sreality",
      city: selectedCityId,
      totalScraped: listings.length,
      inserted: result.inserted,
      updated: result.updated,
      priceChanges: result.priceChanges,
      errors: result.errors,
      skippedValidation,
      inactivated,
      safetyGuardTripped,
      reportedTotal,
    });
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

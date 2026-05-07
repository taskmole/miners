#!/usr/bin/env npx ts-node

/**
 * Sreality.cz Scraper
 *
 * Scrapes property listings from a Sreality search URL, fetches detail data
 * via the Sreality API, and writes to Supabase.
 *
 * Usage:
 *   npm run fetch:sreality                                    # Interactive
 *   npm run fetch:sreality -- --headless --url "https://..."  # CI mode
 *   npm run fetch:sreality -- --city prague                   # Set city
 */

const args = process.argv.slice(2);
const HEADLESS = args.includes("--headless");
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
  CATEGORY_SUB_SLUGS,
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

const DETAIL_API_BASE = "https://www.sreality.cz/api/cs/v2/estates";
const DELAY_BETWEEN_PAGES = 500;
const DELAY_BETWEEN_DETAILS = 300;

const CZ_BOUNDS = {
  latMin: 48.5,
  latMax: 51.1,
  lonMin: 12.0,
  lonMax: 18.9,
};

// Listings containing these terms (case-insensitive) in name or description are excluded
const BLOCKED_KEYWORDS = ["kancelář", "kanceláře"];

// Czech field name to English property name mapping
const ITEM_FIELD_MAP: Record<string, string> = {
  "Celková cena": "totalPrice",
  "Cena za m²": "pricePerSqm",
  "Užitná ploch": "usableArea",
  "Stavba": "buildingType",
  "Stav objektu": "condition",
  "Podlaží": "floor",
  "Garáž": "garage",
  "Bezbariérový": "barrierFree",
  "Výtah": "elevator",
  "Energetická náročnost budovy": "energyRating",
  "Datum nastěhování": "moveInDate",
  "Typ domu": "houseType",
  "Aktualizace": "lastUpdate",
  "Poznámka k ceně": "priceNote",
};

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

// ---------------------------------------------------------------------------
// Phase 1: Fetch listing hash IDs via sReality JSON API
// ---------------------------------------------------------------------------

async function fetchSearchViaApi(
  searchUrl: string,
  cityId: string
): Promise<{ hashIds: string[]; reportedTotal: number }> {
  const city = getCity(cityId);
  if (!city) {
    throw new Error(`Unknown city "${cityId}". Check config/cities.ts.`);
  }
  const apiParams = parseSrealityUrl(searchUrl, city.srealityRegionId);

  console.log(`  API params: type=${apiParams.category_type_cb} main=${apiParams.category_main_cb} sub=${apiParams.category_sub_cb || "all"}`);
  if (apiParams.building_condition) console.log(`  Condition filter: ${apiParams.building_condition}`);
  if (apiParams.usable_area) console.log(`  Area filter: ${apiParams.usable_area}`);

  const allHashIds: Set<string> = new Set();
  let reportedTotal = 0;
  let page = 0;

  const MAX_PAGES = 100;
  while (page < MAX_PAGES) {
    const url = buildApiUrl(apiParams, page);
    console.log(`  Page ${page}: fetching...`);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      });

      if (!res.ok) {
        console.log(`  Got HTTP ${res.status}, stopping pagination.`);
        break;
      }

      const data = await res.json();

      if (page === 0) {
        reportedTotal = data.result_size ?? 0;
        console.log(`  sReality reports ${reportedTotal} total results`);
      }

      const estates = data._embedded?.estates || [];
      if (estates.length === 0) {
        console.log(`  Page ${page}: 0 estates, done.`);
        break;
      }

      let newOnThisPage = 0;
      for (const estate of estates) {
        if (typeof estate.hash_id !== "number") continue;
        const hashId = String(estate.hash_id);
        if (!allHashIds.has(hashId)) {
          allHashIds.add(hashId);
          newOnThisPage++;
        }
      }

      console.log(`    ${estates.length} estates, ${newOnThisPage} new (${allHashIds.size} total)`);

      if (newOnThisPage === 0) {
        console.log(`  No new listings on page ${page}, done.`);
        break;
      }

      page++;
      await sleep(DELAY_BETWEEN_PAGES);
    } catch (err) {
      console.error(`  Error fetching page ${page}:`, err);
      break;
    }
  }

  if (reportedTotal > 0 && allHashIds.size < reportedTotal * 0.8) {
    console.log(`  Warning: collected ${allHashIds.size} but sReality reported ${reportedTotal}. Possible pagination cap.`);
  }

  return { hashIds: Array.from(allHashIds), reportedTotal };
}

// ---------------------------------------------------------------------------
// Phase 2: Fetch detail for each listing via API
// ---------------------------------------------------------------------------

function parseItemValue(name: string, value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value;
  const str = String(value).trim();
  if (str === "True" || str === "true") return true;
  if (str === "False" || str === "false") return false;
  if (name === "Užitná ploch") {
    const num = parseFloat(str.replace(/\s/g, "").replace(",", "."));
    return isNaN(num) ? str : num;
  }
  return str;
}

async function fetchListingDetail(hashId: string): Promise<SrealityListing | null> {
  try {
    const res = await fetch(`${DETAIL_API_BASE}/${hashId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      if (res.status === 404 || res.status === 410) {
        console.log(`    ${hashId}: listing removed (${res.status}), skipping`);
        return null;
      }
      console.log(`    ${hashId}: HTTP ${res.status}, skipping`);
      return null;
    }

    const data = await res.json();

    const fields: Record<string, unknown> = {};
    for (const item of data.items || []) {
      const englishName = ITEM_FIELD_MAP[item.name];
      if (englishName) {
        fields[englishName] = parseItemValue(item.name, item.value);
      }
    }

    const lat = data.map?.lat ?? null;
    const lon = data.map?.lon ?? null;
    const price = data.price_czk?.value_raw ?? null;
    const pricePerSqm = data.price_czk?.alt?.value_raw ?? null;

    // Use view size (749x562) for faster loading instead of self (1920x1080)
    const photos: string[] = [];
    for (const img of data._embedded?.images || []) {
      const photoUrl = img._links?.view?.href || img._links?.self?.href;
      if (photoUrl) photos.push(photoUrl);
    }

    const description = data.text?.value || "";
    const name = data.name?.value || `Listing ${hashId}`;
    const locality = data.locality?.value || "";

    // Build full URL with category path segments
    const seo = data.seo || {};
    const typeSlug = CATEGORY_TYPE_SLUGS[seo.category_type_cb] || "pronajem";
    const mainSlug = CATEGORY_MAIN_SLUGS[seo.category_main_cb] || "komercni";
    const subSlug = CATEGORY_SUB_SLUGS[seo.category_sub_cb] || "ostatni";
    const seoLocality = seo.locality || "";
    const url = `https://www.sreality.cz/detail/${typeSlug}/${mainSlug}/${subSlug}/${seoLocality}/${hashId}`;

    const nearbyPoi: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      if (key.startsWith("poi_") && data[key]?.values) {
        nearbyPoi[key] = data[key].values.map((v: Record<string, unknown>) => ({
          name: v.description || v.name,
          distance: v.distance,
          walkDistance: v.walkDistance,
        }));
      }
    }

    const size = typeof fields.usableArea === "number" ? fields.usableArea : null;

    return {
      hashId,
      url,
      name,
      locality,
      price,
      pricePerSqm,
      size,
      latitude: lat,
      longitude: lon,
      description,
      photos,
      condition: (fields.condition as string) ?? null,
      buildingType: (fields.buildingType as string) ?? null,
      floor: (fields.floor as string) ?? null,
      elevator: (fields.elevator as boolean) ?? null,
      barrierFree: (fields.barrierFree as boolean) ?? null,
      garage: (fields.garage as boolean) ?? null,
      energyRating: (fields.energyRating as string) ?? null,
      moveInDate: (fields.moveInDate as string) ?? null,
      nearbyPoi,
    };
  } catch (err) {
    console.error(`    ${hashId}: fetch error:`, err);
    return null;
  }
}

async function fetchAllDetails(hashIds: string[]): Promise<SrealityListing[]> {
  const listings: SrealityListing[] = [];
  let done = 0;

  for (const hashId of hashIds) {
    const listing = await fetchListingDetail(hashId);
    if (listing) listings.push(listing);
    done++;
    if (done % 20 === 0) {
      console.log(`  Progress: ${done}/${hashIds.length} (${listings.length} valid)`);
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

    const textToCheck = `${listing.name} ${listing.description || ""}`.toLowerCase();
    if (BLOCKED_KEYWORDS.some((kw) => textToCheck.includes(kw))) {
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

  // Phase 1: Fetch listing IDs via JSON API
  console.log("\n--- Phase 1: Fetching listings via API ---\n");
  const { hashIds, reportedTotal } = await fetchSearchViaApi(searchUrl, selectedCityId);

  if (hashIds.length === 0) {
    console.error("\nNo listings found. Check the URL and filters.");
    process.exit(1);
  }
  console.log(`\nFound ${hashIds.length} listings total (sReality reported ${reportedTotal}).`);

  // Phase 2: Fetch details
  console.log("\n--- Phase 2: Fetching listing details ---\n");
  const listings = await fetchAllDetails(hashIds);
  console.log(`\nFetched ${listings.length} listing details (${hashIds.length - listings.length} failed/removed).`);

  if (listings.length === 0) {
    console.error("\nAll detail fetches failed. Aborting.");
    process.exit(1);
  }

  const { valid: validListings, skipped: skippedValidation } = transformListings(listings);
  console.log(`\nValid listings: ${validListings.length} (skipped ${skippedValidation} with missing data)`);

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

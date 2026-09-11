#!/usr/bin/env npx ts-node

/**
 * Idealista Scraper
 *
 * Fetches commercial rental listings from Idealista, extracts full photo
 * galleries, detects price changes, and writes directly to Supabase.
 *
 * Usage:
 *   npm run fetch:idealista                        # Interactive city selection
 *   npm run fetch:idealista -- --headless --city madrid   # CI / GitHub Actions
 */

// Parse CLI arguments
const args = process.argv.slice(2);
const HEADLESS = args.includes("--headless");
const SKIP_REPORT = args.includes("--skip-report");
const cityArgIndex = args.indexOf("--city");
const CITY_ARG = cityArgIndex !== -1 ? args[cityArgIndex + 1]?.toLowerCase() : null;
const modeArgIndex = args.indexOf("--mode");
const MODE: "rental" | "transfer" = modeArgIndex !== -1 && args[modeArgIndex + 1] === "transfer" ? "transfer" : "rental";
// --dry-run scrapes and reports but never writes to Supabase. --limit N caps
// how many detail pages are fetched. Both exist so a swap can be proven cheaply
// without touching production data.
const DRY_RUN = args.includes("--dry-run");
const limitArgIndex = args.indexOf("--limit");
const LIMIT = limitArgIndex !== -1 ? parseInt(args[limitArgIndex + 1], 10) : null;
const statsFileArgIndex = args.indexOf("--stats-file");
const STATS_FILE = statsFileArgIndex !== -1 ? args[statsFileArgIndex + 1] : null;

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

import * as fs from "fs";
import * as readline from "readline";
import * as cheerio from "cheerio";
import * as zlib from "zlib";
import { getCityIds, getCity, hasIdealistaSupport } from "./config/cities";
import { SOURCES, getCategoryForIdealista } from "./lib/categories";
import {
  getDevClient,
  getProdClient,
  getExistingSourceIds,
  checkConfig,
  markUnseenAsInactive,
} from "./lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  detectPriceChange,
  getCategoryId,
  publishListings as publishListingsShared,
  sendScraperReport,
  type ValidatedListing,
  type ScraperReport,
  type PublishStats,
} from "./lib/scraper-utils";
import {
  buildSearchUrl,
  getFiltersForCity,
  getTransferFilters,
  extractGalleryPhotos,
  extractListingId,
  isValidCoordinate,
  PROXY_CONFIG,
  buildProxyUri,
} from "./config/idealista";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IdealistaListing {
  title: string;
  url: string;
  price: number | null;
  priceByArea: number | null;
  transfer: number | null;
  size: number | null;
  address: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  bathrooms: number | null;
  hasAirConditioning: boolean | null;
  hasStorefront: boolean | null;
  datePosted: string | null;
  photos: string[];
}

// ---------------------------------------------------------------------------
// HTTP client (Bright Data Web Unlocker)
// ---------------------------------------------------------------------------

let proxyAgent: unknown = null;

async function getProxyAgent(): Promise<unknown> {
  if (proxyAgent) return proxyAgent;
  try {
    const { ProxyAgent } = await import("undici");
    proxyAgent = new ProxyAgent({
      uri: buildProxyUri(),
      // Web Unlocker terminates TLS with its own certificate. Bright Data's
      // documented alternatives are installing their CA or skipping the check;
      // we skip, since we only ever read public listing pages.
      requestTls: { rejectUnauthorized: false },
      connections: PROXY_CONFIG.detailConcurrency * 2,
    });
    return proxyAgent;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to create Bright Data proxy agent: ${msg}`);
    process.exit(1);
  }
}

async function readResponseBody(response: Response): Promise<string> {
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) return "";
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      return zlib.gunzipSync(buffer).toString("utf-8");
    } catch {
      console.log("    Warning: gzip magic detected but decompression failed, using raw text");
    }
  }
  return buffer.toString("utf-8");
}

async function fetchWithRetry(
  url: string,
  timeoutMs: number,
  maxRetries = PROXY_CONFIG.maxRetries
): Promise<string | null> {
  const agent = await getProxyAgent();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (requestCount >= PROXY_CONFIG.maxRequestsPerRun) {
      console.error(
        `\n  SPEND CAP: hit ${PROXY_CONFIG.maxRequestsPerRun} requests this run. ` +
        `Refusing further fetches.`
      );
      return null;
    }
    requestCount++;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      // No User-Agent header on purpose: Web Unlocker manages the browser
      // fingerprint itself, and overriding it makes the disguise inconsistent.
      const response = await fetch(url, {
        signal: controller.signal,
        // undici dispatcher for proxy routing
        dispatcher: agent,
      } as any);

      clearTimeout(timer);

      if (response.status === 404) return null;

      if (response.ok) return await readResponseBody(response);

      // Retryable status
      if (attempt < maxRetries) {
        const wait = PROXY_CONFIG.backoffMs[attempt] ?? 8_000;
        console.log(`    HTTP ${response.status}, retrying in ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }

      console.log(`    HTTP ${response.status} after ${maxRetries + 1} attempts, skipping.`);
      return null;
    } catch (err: unknown) {
      if (attempt < maxRetries) {
        const wait = PROXY_CONFIG.backoffMs[attempt] ?? 8_000;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`    Error: ${msg.slice(0, 80)}, retrying in ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Every billable request passes through fetchWithRetry, so counting here
 * bounds the whole run. Retries count too, deliberately: a retry storm is
 * exactly the runaway we want to stop.
 */
let requestCount = 0;
export function getRequestCount(): number {
  return requestCount;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Search page scraper
// ---------------------------------------------------------------------------

function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", "");
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

function parseSize(text: string): number | null {
  const match = text.match(/(\d+)\s*m/);
  return match ? parseInt(match[1], 10) : null;
}

function parsePricePerM2(text: string): number | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*[€/]*\s*m/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(",", "."));
  return isNaN(val) ? null : val;
}

function parseRelativeDate(text: string): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const now = new Date();

  if (t.includes("today") || t.includes("hoy")) return now.toISOString().slice(0, 10);
  if (t.includes("yesterday") || t.includes("ayer")) {
    now.setDate(now.getDate() - 1);
    return now.toISOString().slice(0, 10);
  }
  if (t.includes("hour") || t.includes("hora")) return now.toISOString().slice(0, 10);

  const daysMatch = t.match(/(\d+)\s*(?:day|día)/);
  if (daysMatch) {
    now.setDate(now.getDate() - parseInt(daysMatch[1], 10));
    return now.toISOString().slice(0, 10);
  }
  const weeksMatch = t.match(/(\d+)\s*(?:week|semana)/);
  if (weeksMatch) {
    now.setDate(now.getDate() - parseInt(weeksMatch[1], 10) * 7);
    return now.toISOString().slice(0, 10);
  }
  const monthsMatch = t.match(/(\d+)\s*(?:month|mes)/);
  if (monthsMatch) {
    now.setDate(now.getDate() - parseInt(monthsMatch[1], 10) * 30);
    return now.toISOString().slice(0, 10);
  }
  return null;
}

function parseListingCard($: cheerio.CheerioAPI, article: any): Partial<IdealistaListing> {
  const el = $(article);
  const listing: Partial<IdealistaListing> = {};

  // Title + URL
  const link = el.find("a.item-link");
  listing.title = link.text().trim();
  const href = link.attr("href");
  listing.url = href ? new URL(href, "https://www.idealista.com").toString() : "";

  // Price
  const priceEl = el.find(".item-price");
  listing.price = priceEl.length ? parsePrice(priceEl.text()) : null;

  // Price per m2
  const details = el.find(".item-detail-char");
  listing.priceByArea = null;
  if (details.length) {
    details.find("span").each((_, span) => {
      const t = $(span).text();
      if (t.includes("/m") || t.includes("€/m")) {
        listing.priceByArea = parsePricePerM2(t);
      }
    });
  }

  // Transfer price
  const transferEl = el.find(".item-price-transfer, .item-transfer");
  listing.transfer = transferEl.length ? parsePrice(transferEl.text()) : null;

  // Size
  listing.size = null;
  el.find(".item-detail span, .item-detail").each((_, elem) => {
    const t = $(elem).text();
    if ((t.includes("m²") || t.includes("m2")) && listing.size === null) {
      listing.size = parseSize(t);
    }
  });

  // Address + district from title
  let addr = listing.title || "";
  addr = addr.replace(/^Commercial premises in\s*/i, "");
  addr = addr.replace(/^Local comercial en\s*/i, "");
  listing.address = addr;

  const parts = addr.split(",").map((p) => p.trim());
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].toLowerCase();
    listing.district = last === "madrid" || last === "barcelona"
      ? parts[parts.length - 2]
      : parts[parts.length - 1];
  } else {
    listing.district = "";
  }

  // Date
  const dateEl = el.find(".item-time, .item-date");
  listing.datePosted = dateEl.length ? parseRelativeDate(dateEl.text()) : null;

  // Thumbnail (fallback if detail page fails)
  const img = el.find("img");
  const thumbSrc = img.attr("src") || img.attr("data-src") || "";
  listing.photos = thumbSrc.includes("idealista.com") ? [thumbSrc] : [];

  return listing;
}

/**
 * Returns the listings found plus whether the sweep was complete.
 *
 * `complete` is false if ANY search page failed, not just if we gave up early.
 * One failed page silently drops ~30 listings, and the inactivation step would
 * then read those 30 as "no longer on Idealista" and hide them. Losing a page
 * must therefore disable inactivation for the whole run.
 */
async function scrapeSearchPages(
  cityArea: string,
  filters: ReturnType<typeof getFiltersForCity>
): Promise<{ listings: Partial<IdealistaListing>[]; complete: boolean }> {
  const allListings: Partial<IdealistaListing>[] = [];
  let consecutiveSearchFailures = 0;
  let anyPageFailed = false;

  for (let page = 1; page <= PROXY_CONFIG.maxSearchPages; page++) {
    const url = buildSearchUrl(cityArea, page, filters);
    console.log(`  Page ${page}: ${url}`);

    const html = await fetchWithRetry(url, PROXY_CONFIG.searchTimeoutMs);
    if (!html) {
      consecutiveSearchFailures++;
      anyPageFailed = true;
      console.log(`    Failed to fetch page ${page}, skipping.`);

      // Each failed page costs up to 3 attempts x 90s. Grinding through all 34
      // would burn ~2.5h before detail pages even start, so give up early when
      // the provider is clearly down.
      if (consecutiveSearchFailures >= PROXY_CONFIG.searchFailureThreshold) {
        console.error(
          `\n  ${consecutiveSearchFailures} search pages failed in a row. Stopping Phase 1.`
        );
        break;
      }
      if (page < PROXY_CONFIG.maxSearchPages) {
        await sleep(PROXY_CONFIG.delayBetweenSearchPagesMs);
      }
      continue;
    }
    consecutiveSearchFailures = 0;

    const $ = cheerio.load(html);
    const articles = $("article.item");

    if (articles.length === 0) {
      console.log(`    No listings found on page ${page}, stopping.`);
      break;
    }

    console.log(`    Found ${articles.length} listings`);

    articles.each((_, article) => {
      const listing = parseListingCard($, article);
      if (listing.url) allListings.push(listing);
    });

    // Check for next page
    const nextBtn = $("a.icon-arrow-right-after, .pagination .next");
    if (nextBtn.length === 0) {
      console.log(`    Last page reached.`);
      break;
    }

    if (page < PROXY_CONFIG.maxSearchPages) {
      await sleep(PROXY_CONFIG.delayBetweenSearchPagesMs);
    }
  }

  return { listings: allListings, complete: !anyPageFailed };
}

// ---------------------------------------------------------------------------
// Detail page scraper
// ---------------------------------------------------------------------------

function scrapeDetailHtml(html: string): {
  latitude: number | null;
  longitude: number | null;
  bathrooms: number | null;
  hasAirConditioning: boolean;
  hasStorefront: boolean;
  photos: string[];
} {
  // Coordinates
  let latitude: number | null = null;
  let longitude: number | null = null;

  const coordMatch = html.match(/center.*?([0-9]{1,2}\.[0-9]+).*?(-?[0-9]{1,3}\.[0-9]+)/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    if (isValidCoordinate(lat, lon)) {
      latitude = lat;
      longitude = lon;
    }
  }

  if (latitude === null) {
    const latMatch = html.match(/"latitude":\s*"?([0-9.-]+)"?/);
    const lonMatch = html.match(/"longitude":\s*"?([0-9.-]+)"?/);
    if (latMatch && lonMatch) {
      latitude = parseFloat(latMatch[1]);
      longitude = parseFloat(lonMatch[1]);
    }
  }

  // Bathrooms
  const bathroomMatch = html.match(/(\d+)\s*toilets?\s*(?:or\s*)?bathrooms?/i);
  const bathrooms = bathroomMatch ? parseInt(bathroomMatch[1], 10) : null;

  // Features
  const hasStorefront = /street\s*level|planta\s*calle|a\s*pie\s*de\s*calle/i.test(html);
  const hasAirConditioning = /air\s*condition|aire\s*acondicionado|climatizaci[oó]n/i.test(html);

  // Gallery photos
  const photos = extractGalleryPhotos(html);

  return { latitude, longitude, bathrooms, hasAirConditioning, hasStorefront, photos };
}

async function enrichWithDetailPage(
  listing: Partial<IdealistaListing>
): Promise<IdealistaListing> {
  const result: IdealistaListing = {
    title: listing.title || "",
    url: listing.url || "",
    price: listing.price ?? null,
    priceByArea: listing.priceByArea ?? null,
    transfer: listing.transfer ?? null,
    size: listing.size ?? null,
    address: listing.address || "",
    district: listing.district || "",
    latitude: null,
    longitude: null,
    bathrooms: null,
    hasAirConditioning: null,
    hasStorefront: null,
    datePosted: listing.datePosted ?? null,
    photos: listing.photos || [],
  };

  if (!listing.url) return result;

  const html = await fetchWithRetry(listing.url, PROXY_CONFIG.detailTimeoutMs);
  if (!html) return result;

  const detail = scrapeDetailHtml(html);
  result.latitude = detail.latitude;
  result.longitude = detail.longitude;
  result.bathrooms = detail.bathrooms;
  result.hasAirConditioning = detail.hasAirConditioning;
  result.hasStorefront = detail.hasStorefront;

  // Use gallery photos if found, otherwise keep thumbnail from search page
  if (detail.photos.length > 0) {
    result.photos = detail.photos;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Source ID generation
// ---------------------------------------------------------------------------

function generateSourceId(url: string): string | null {
  return extractListingId(url);
}

// detectPriceChange, getCategoryId, ScraperReport, sendScraperReport imported from ./lib/scraper-utils

// ---------------------------------------------------------------------------
// Publish to Supabase (validates Idealista listings, then delegates to shared)
// ---------------------------------------------------------------------------

async function publishListings(
  client: SupabaseClient,
  listings: IdealistaListing[],
  cityId: string,
  categoryId: string,
  envName: string,
  source: string
): Promise<PublishStats & { skippedValidation: number }> {
  let skippedValidation = 0;

  const validated: ValidatedListing[] = [];
  for (const listing of listings) {
    if (!listing.latitude || !listing.longitude) continue;
    const hasPrice = listing.price && listing.price > 0;
    const hasTransfer = listing.transfer && listing.transfer > 0;
    if ((!hasPrice && !hasTransfer) || !listing.title) {
      skippedValidation++;
      continue;
    }
    const sourceId = generateSourceId(listing.url);
    if (!sourceId) {
      skippedValidation++;
      continue;
    }
    // For transfer listings, Idealista puts the traspaso fee in .item-price
    // and the monthly rent in .item-price-transfer, so we swap them here
    // so price always means monthly rent and transfer always means the fee.
    const isTransfer = source === SOURCES.IDEALISTA_TRANSFER;
    const rentPrice = isTransfer ? listing.transfer : listing.price;
    const transferFee = isTransfer ? listing.price : listing.transfer;

    validated.push({
      sourceId,
      name: listing.title,
      address: listing.address,
      latitude: listing.latitude,
      longitude: listing.longitude,
      price: rentPrice,
      photos: listing.photos,
      metadata: {
        url: listing.url,
        price: rentPrice,
        priceByArea: listing.priceByArea,
        transfer: transferFee,
        size: listing.size,
        district: listing.district,
        bathrooms: listing.bathrooms,
        hasAirConditioning: listing.hasAirConditioning,
        hasStorefront: listing.hasStorefront,
        datePosted: listing.datePosted,
      },
    });
  }

  const stats = await publishListingsShared(
    client, validated, cityId, categoryId, source, envName
  );

  if (skippedValidation > 0) {
    console.log(`  Skipped (validation): ${skippedValidation}`);
  }

  return { ...stats, skippedValidation };
}

// ---------------------------------------------------------------------------
// User prompts
// ---------------------------------------------------------------------------

function createPrompt(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

async function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(50));
  console.log("  Idealista Scraper");
  console.log("=".repeat(50));

  if (HEADLESS) console.log("  Mode: HEADLESS (CI)");
  else console.log("  Mode: INTERACTIVE");
  console.log(`  Type: ${MODE === "transfer" ? "TRANSFERS (traspaso)" : "RENTALS"}`);

  // Check for Bright Data credentials
  const missingCreds = ["BRIGHTDATA_CUSTOMER_ID", "BRIGHTDATA_ZONE", "BRIGHTDATA_PASSWORD"]
    .filter((k) => !process.env[k]);
  if (missingCreds.length > 0) {
    console.error(`\nError: missing Bright Data credentials: ${missingCreds.join(", ")}`);
    console.error("Add them to your .env.local file (or to the GitHub Actions secrets).");
    process.exit(1);
  }

  // Check Supabase config
  const config = checkConfig();
  if (HEADLESS) {
    if (!config.prod) {
      console.error("\nError: Supabase PROD credentials not configured for headless mode.");
      process.exit(1);
    }
  } else {
    if (!config.dev) {
      console.error("\nError: Supabase DEV credentials not configured.");
      process.exit(1);
    }
  }

  // City selection
  const idealistaCities = getCityIds().filter(hasIdealistaSupport);
  let selectedCityId: string;

  if (HEADLESS && CITY_ARG) {
    if (!idealistaCities.includes(CITY_ARG)) {
      console.error(`\nError: City "${CITY_ARG}" does not support Idealista.`);
      console.error(`Available: ${idealistaCities.join(", ")}`);
      process.exit(1);
    }
    selectedCityId = CITY_ARG;
  } else if (HEADLESS) {
    selectedCityId = idealistaCities[0];
  } else {
    const rl = createPrompt();
    console.log("\nCities with Idealista support:");
    idealistaCities.forEach((id, i) => {
      const city = getCity(id);
      console.log(`  ${i + 1}. ${city?.name} (${id})`);
    });

    const input = await ask(rl, "\nEnter city number or ID: ");
    rl.close();

    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= idealistaCities.length) {
      selectedCityId = idealistaCities[num - 1];
    } else if (idealistaCities.includes(input.toLowerCase())) {
      selectedCityId = input.toLowerCase();
    } else {
      console.error(`Invalid city: ${input}`);
      process.exit(1);
    }
  }

  const city = getCity(selectedCityId)!;
  const activeSource = MODE === "transfer" ? SOURCES.IDEALISTA_TRANSFER : SOURCES.IDEALISTA;
  const activeFilters = MODE === "transfer" ? getTransferFilters(selectedCityId) : getFiltersForCity(selectedCityId);
  console.log(`\nSelected: ${city.name}`);
  console.log(`Filters: ${JSON.stringify(activeFilters)}\n`);

  // Phase 1: Scrape search pages
  console.log("Phase 1: Scraping search pages...");
  const searchResult = await scrapeSearchPages(city.idealistaArea!, activeFilters);
  let partialListings = searchResult.listings;
  if (!searchResult.complete) {
    console.log("\n  WARNING: at least one search page failed. Inactivation will be skipped.");
  }
  console.log(`\n  Total listings from search: ${partialListings.length}\n`);

  if (LIMIT && LIMIT > 0 && partialListings.length > LIMIT) {
    partialListings = partialListings.slice(0, LIMIT);
    console.log(`  --limit ${LIMIT}: only enriching the first ${LIMIT}.\n`);
  }

  if (partialListings.length === 0) {
    console.error("\nNo listings found. Provider blocked, or Idealista changed its markup.");
    console.error("Exiting non-zero so the run is visibly red rather than silently empty.");
    process.exit(1);
  }

  // Phase 2: Enrich with detail pages
  console.log("Phase 2: Fetching detail pages for coordinates and photos...");
  console.log(`  Concurrency: ${PROXY_CONFIG.detailConcurrency} at a time\n`);

  const listings: IdealistaListing[] = new Array(partialListings.length);
  let completed = 0;
  let consecutiveFailures = 0;
  let aborted = false;

  /**
   * Worker pool. Each worker pulls the next index off a shared counter until
   * the list is exhausted, so slow pages never block fast ones.
   */
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      if (aborted) return;
      const i = cursor++;
      if (i >= partialListings.length) return;

      const partial = partialListings[i];
      const enriched = await enrichWithDetailPage(partial);
      listings[i] = enriched;

      const hasCoords = !!(enriched.latitude && enriched.longitude);
      completed++;

      // Circuit breaker: a long unbroken run of failures means Bright Data or
      // Idealista is down, not that these particular listings are bad.
      if (hasCoords) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
        if (consecutiveFailures >= PROXY_CONFIG.circuitBreakerThreshold) {
          console.error(
            `\n  CIRCUIT BREAKER: ${consecutiveFailures} failures in a row. ` +
            `Stopping early to avoid burning credits.\n`
          );
          aborted = true;
          return;
        }
      }

      const shortTitle = (partial.title || "Unknown").slice(0, 45);
      console.log(
        `  [${completed}/${partialListings.length}] ${shortTitle}... ` +
        `${hasCoords ? "OK" : "NO COORDS"} (${enriched.photos.length} photos)`
      );
    }
  }

  const startedAt = Date.now();
  await Promise.all(
    Array.from({ length: PROXY_CONFIG.detailConcurrency }, () => worker())
  );
  const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
  console.log(`\n  Detail pages done in ${elapsedMin} min.`);
  console.log(
    `  Billable requests this run: ${getRequestCount()} ` +
    `(~$${(getRequestCount() * 0.0015).toFixed(2)})`
  );

  // Drop holes left by an aborted run so downstream code never sees undefined.
  const scraped = listings.filter(Boolean);

  // Filter to listings with valid coordinates
  const valid = scraped.filter((l) => l.latitude && l.longitude);
  const noCoords = scraped.length - valid.length;
  console.log(`\n  With coordinates: ${valid.length}`);
  if (noCoords > 0) console.log(`  Skipped (no coords): ${noCoords}`);

  // A run that stopped early, or that was deliberately capped with --limit, has
  // NOT seen the full catalogue. Inactivation compares "what I saw" against
  // "what is in the database", so running it on a partial result would mark
  // live listings as gone and delete them from the dashboard and the digest.
  // markUnseenAsInactive's own 50% guard does not protect us here: an abort at
  // 70% passes that guard and would still wrongly hide the other 30%.
  // A high no-coordinate rate means the provider is degraded (e.g. returning
  // 200s with an interstitial that parses as an empty page) rather than the
  // listings genuinely lacking coordinates. Treat it like any other incomplete
  // run. Baseline healthy rate is ~0%.
  const noCoordRate = scraped.length > 0 ? noCoords / scraped.length : 0;
  const degraded = noCoordRate > 0.2;
  if (degraded) {
    console.error(
      `\n  WARNING: ${Math.round(noCoordRate * 100)}% of detail pages returned no ` +
      `coordinates. Treating this run as incomplete.`
    );
  }

  const incompleteRun =
    aborted || degraded || !searchResult.complete || (LIMIT !== null && LIMIT > 0);


  // Deduplicate within batch by Idealista listing ID
  const deduped = new Map<string, IdealistaListing>();
  for (const listing of valid) {
    const sid = generateSourceId(listing.url);
    if (sid && !deduped.has(sid)) deduped.set(sid, listing);
  }
  if (deduped.size < valid.length) {
    console.log(`  Deduplicated: ${valid.length} -> ${deduped.size}`);
  }

  const finalListings = Array.from(deduped.values());
  const totalPhotos = finalListings.reduce((sum, l) => sum + l.photos.length, 0);
  console.log(`  Total gallery photos: ${totalPhotos}`);

  // Phase 3: Publish to Supabase
  if (DRY_RUN) {
    console.log("\nDRY RUN: skipping Supabase writes.");
    const withCoords = finalListings.length;
    const withPhotos = finalListings.filter((l) => l.photos.length > 0).length;
    const withTransfer = finalListings.filter((l) => l.transfer && l.transfer > 0).length;
    const withBathrooms = finalListings.filter((l) => l.bathrooms !== null).length;
    console.log(`  Ready to publish: ${withCoords}`);
    console.log(`  With photos:      ${withPhotos}`);
    console.log(`  With transfer:    ${withTransfer}`);
    console.log(`  With bathrooms:   ${withBathrooms}`);
    console.log("\nDone (dry run).");
    return;
  }

  console.log("\nPhase 3: Publishing to Supabase...");

  // Determine which environment(s) to write to
  const writeToDevFirst = !HEADLESS && config.dev;
  const writeToProd = HEADLESS;

  // Build seenIds from the Phase 1 SEARCH results, not from the enriched set.
  //
  // Appearing on a search page is the proof that a listing still exists.
  // Coordinates are a requirement for publishing it, not for it existing. If
  // seenIds came from the enriched set (as it used to), scattered detail-page
  // failures would look identical to "delisted" and would hide live listings
  // from the dashboard and the digest.
  const seenIds = new Set<string>();
  for (const l of searchResult.listings) {
    const sid = l.url ? generateSourceId(l.url) : null;
    if (sid) seenIds.add(sid);
  }

  const sourceName = MODE === "transfer" ? "Idealista Transfers" : "Idealista";

  if (writeToDevFirst) {
    const devClient = getDevClient();
    const categoryId = await getCategoryId(devClient, getCategoryForIdealista());

    const devResult = await publishListings(devClient, finalListings, selectedCityId, categoryId, "DEV", activeSource);
    console.log(`\n  DEV results:`);
    console.log(`    Inserted:      ${devResult.inserted}`);
    console.log(`    Updated:       ${devResult.updated}`);
    console.log(`    Price changes: ${devResult.priceChanges}`);
    console.log(`    Errors:        ${devResult.errors}`);

    if (incompleteRun) {
      console.log(`    Skipping inactivation: run was incomplete.`);
    } else {
      const { inactivated: devInactivated } = await markUnseenAsInactive(devClient, selectedCityId, activeSource, seenIds, 0.5);
      if (devInactivated > 0) console.log(`    Inactivated:   ${devInactivated}`);
    }

    // Ask about PROD
    if (config.prod) {
      const rl = createPrompt();
      const answer = await ask(rl, "\nPush to PROD? (y/n): ");
      rl.close();

      if (answer.toLowerCase() === "y") {
        const prodClient = getProdClient();
        const prodCategoryId = await getCategoryId(prodClient, getCategoryForIdealista());
        const prodResult = await publishListings(prodClient, finalListings, selectedCityId, prodCategoryId, "PROD", activeSource);
        console.log(`\n  PROD results:`);
        console.log(`    Inserted:      ${prodResult.inserted}`);
        console.log(`    Updated:       ${prodResult.updated}`);
        console.log(`    Price changes: ${prodResult.priceChanges}`);
        console.log(`    Errors:        ${prodResult.errors}`);

        if (incompleteRun) {
          console.log(`    Skipping inactivation: run was incomplete.`);
        } else {
          const { inactivated: prodInactivated } = await markUnseenAsInactive(prodClient, selectedCityId, activeSource, seenIds, 0.5);
          if (prodInactivated > 0) console.log(`    Inactivated:   ${prodInactivated}`);
        }
      }
    }
  }

  if (writeToProd) {
    const prodClient = getProdClient();
    const categoryId = await getCategoryId(prodClient, getCategoryForIdealista());

    const result = await publishListings(prodClient, finalListings, selectedCityId, categoryId, "PROD", activeSource);
    console.log(`\n  PROD results:`);
    console.log(`    Inserted:      ${result.inserted}`);
    console.log(`    Updated:       ${result.updated}`);
    console.log(`    Price changes: ${result.priceChanges}`);
    console.log(`    Errors:        ${result.errors}`);
    if (result.skippedValidation > 0) console.log(`    Skipped (val): ${result.skippedValidation}`);

    let inactivated = 0;
    let safetyGuardTripped = false;
    if (incompleteRun) {
      const why = aborted
        ? "circuit breaker"
        : !searchResult.complete
        ? "a search page failed"
        : degraded
        ? "too many detail pages returned no coordinates"
        : "--limit";
      console.log(`\n  Skipping inactivation: run was incomplete (${why}).`);
      console.log(`  Existing listings are left untouched rather than wrongly hidden.`);
      safetyGuardTripped = true;
    } else {
      ({ inactivated, safetyGuardTripped } = await markUnseenAsInactive(prodClient, selectedCityId, activeSource, seenIds, 0.5));
      if (inactivated > 0) console.log(`    Inactivated:   ${inactivated}`);
    }

    // Validation failure rate check
    const validationFailRate = finalListings.length > 0 ? result.skippedValidation / finalListings.length : 0;
    if (validationFailRate > 0.2) {
      console.error(`\n  ERROR: ${Math.round(validationFailRate * 100)}% of listings failed validation. HTML structure may have changed.`);
    }

    // Write stats file for combined report step
    if (STATS_FILE) {
      const stats = {
        sourceName,
        city: city.name,
        totalScraped: finalListings.length,
        inserted: result.inserted,
        updated: result.updated,
        priceChanges: result.priceChanges,
        errors: result.errors,
        skippedValidation: result.skippedValidation,
        inactivated,
        safetyGuardTripped,
      };
      fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
      console.log(`\n  Stats written to ${STATS_FILE}`);
    }

    if (!SKIP_REPORT) {
      console.log("\nSending report...");
      await sendScraperReport({
        sourceName,
        city: city.name,
        totalScraped: finalListings.length,
        inserted: result.inserted,
        updated: result.updated,
        priceChanges: result.priceChanges,
        errors: result.errors,
        skippedValidation: result.skippedValidation,
        inactivated,
        safetyGuardTripped,
      });
    } else {
      console.log("\nSkipping report (--skip-report flag set).");
    }

    if (validationFailRate > 0.2) {
      process.exit(1);
    }

    // An aborted run still published what it managed to scrape, but the job
    // must go red so the incomplete run is noticed rather than silently kept.
    if (aborted) {
      console.error("\n  Run aborted early by the circuit breaker. Failing the job.");
      process.exit(1);
    }
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error("\nFatal error:", error.message || error);
  process.exit(1);
});

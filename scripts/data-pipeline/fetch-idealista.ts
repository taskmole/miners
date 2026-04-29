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
const cityArgIndex = args.indexOf("--city");
const CITY_ARG = cityArgIndex !== -1 ? args[cityArgIndex + 1]?.toLowerCase() : null;

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

import * as readline from "readline";
import * as cheerio from "cheerio";
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
  extractGalleryPhotos,
  extractListingId,
  isValidCoordinate,
  PROXY_CONFIG,
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
// HTTP client (XHR proxy)
// ---------------------------------------------------------------------------

let proxyAgent: unknown = null;

async function getProxyAgent(): Promise<unknown> {
  if (proxyAgent) return proxyAgent;
  try {
    const { ProxyAgent } = await import("undici");
    proxyAgent = new ProxyAgent({
      uri: PROXY_CONFIG.url,
      requestTls: { rejectUnauthorized: false },
    });
    return proxyAgent;
  } catch {
    console.error("Failed to create proxy agent via undici. Install undici or https-proxy-agent.");
    process.exit(1);
  }
}

async function fetchWithRetry(
  url: string,
  timeoutMs: number,
  maxRetries = PROXY_CONFIG.maxRetries
): Promise<string | null> {
  const apiKey = process.env.XHR_API_KEY!;
  const agent = await getProxyAgent();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        headers: {
          "x-xhr-api-key": apiKey,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        signal: controller.signal,
        // undici dispatcher for proxy routing
        dispatcher: agent,
      } as any);

      clearTimeout(timer);

      if (response.status === 404) return null;

      if (response.ok) return await response.text();

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

async function scrapeSearchPages(
  cityArea: string,
  cityId: string
): Promise<Partial<IdealistaListing>[]> {
  const filters = getFiltersForCity(cityId);
  const allListings: Partial<IdealistaListing>[] = [];

  for (let page = 1; page <= PROXY_CONFIG.maxSearchPages; page++) {
    const url = buildSearchUrl(cityArea, page, filters);
    console.log(`  Page ${page}: ${url}`);

    const html = await fetchWithRetry(url, PROXY_CONFIG.searchTimeoutMs);
    if (!html) {
      console.log(`    Failed to fetch page ${page}, skipping.`);
      if (page < PROXY_CONFIG.maxSearchPages) {
        await sleep(PROXY_CONFIG.delayBetweenSearchPagesMs);
      }
      continue;
    }

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

  return allListings;
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
  envName: string
): Promise<PublishStats & { skippedValidation: number }> {
  let skippedValidation = 0;

  const validated: ValidatedListing[] = [];
  for (const listing of listings) {
    if (!listing.latitude || !listing.longitude) continue;
    if (!listing.price || listing.price <= 0 || !listing.title) {
      skippedValidation++;
      continue;
    }
    const sourceId = generateSourceId(listing.url);
    if (!sourceId) {
      skippedValidation++;
      continue;
    }
    validated.push({
      sourceId,
      name: listing.title,
      address: listing.address,
      latitude: listing.latitude,
      longitude: listing.longitude,
      price: listing.price,
      photos: listing.photos,
      metadata: {
        url: listing.url,
        price: listing.price,
        priceByArea: listing.priceByArea,
        transfer: listing.transfer,
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
    client, validated, cityId, categoryId, SOURCES.IDEALISTA, envName
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

  // Check for XHR proxy key
  if (!process.env.XHR_API_KEY) {
    console.error("\nError: XHR_API_KEY not found in environment.");
    console.error("Add it to your .env.local file.");
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
  console.log(`\nSelected: ${city.name}`);
  console.log(`Filters: ${JSON.stringify(getFiltersForCity(selectedCityId))}\n`);

  // Phase 1: Scrape search pages
  console.log("Phase 1: Scraping search pages...");
  const partialListings = await scrapeSearchPages(city.idealistaArea!, selectedCityId);
  console.log(`\n  Total listings from search: ${partialListings.length}\n`);

  if (partialListings.length === 0) {
    console.log("No listings found. The proxy may be blocked or filters too narrow.");
    process.exit(0);
  }

  // Phase 2: Enrich with detail pages
  console.log("Phase 2: Fetching detail pages for coordinates and photos...");
  console.log("  Waiting 10s for CAPTCHA solver to reset...");
  await sleep(10_000);

  const listings: IdealistaListing[] = [];

  // Batch pause state
  const batchSizes = PROXY_CONFIG.detailBatchSizes;
  const batchPauses = PROXY_CONFIG.detailBatchPausesMs;
  let batchCount = 0;
  let nextBatchBoundary = batchSizes[0];

  // Circuit breaker state
  const recentResults: boolean[] = [];

  for (let i = 0; i < partialListings.length; i++) {
    const partial = partialListings[i];
    const shortTitle = (partial.title || "Unknown").slice(0, 55);
    process.stdout.write(`  [${i + 1}/${partialListings.length}] ${shortTitle}...`);

    const enriched = await enrichWithDetailPage(partial);
    listings.push(enriched);

    const photoCount = enriched.photos.length;
    const hasCoords = enriched.latitude && enriched.longitude;
    console.log(` ${hasCoords ? "OK" : "NO COORDS"} (${photoCount} photos)`);

    // Circuit breaker: track recent success/failure
    recentResults.push(!!hasCoords);
    if (recentResults.length > 10) recentResults.shift();

    if (recentResults.length >= 10) {
      const failures = recentResults.filter((r) => !r).length;
      if (failures >= PROXY_CONFIG.circuitBreakerThreshold) {
        console.log(`\n  Circuit breaker: ${failures}/10 recent failures, pausing ${PROXY_CONFIG.circuitBreakerPauseMs / 1000}s for solver recovery...`);
        await sleep(PROXY_CONFIG.circuitBreakerPauseMs);
        recentResults.length = 0;
      }
    }

    // Batch pause
    if (i + 1 === nextBatchBoundary && i < partialListings.length - 1) {
      const pauseRange = batchPauses[batchCount % batchPauses.length];
      const pauseDuration = randomBetween(pauseRange[0], pauseRange[1]);
      console.log(`\n  Batch pause: waiting ${Math.round(pauseDuration / 1000)}s for solver cooldown... (batch ${batchCount + 1})`);
      await sleep(pauseDuration);
      batchCount++;
      nextBatchBoundary += batchSizes[batchCount % batchSizes.length];
    }

    // Rate limiting with jitter
    if (i < partialListings.length - 1) {
      const delay = randomBetween(PROXY_CONFIG.delayBetweenDetailPagesMs, PROXY_CONFIG.delayBetweenDetailPagesMs + 500);
      await sleep(delay);
    }
  }

  // Filter to listings with valid coordinates
  const valid = listings.filter((l) => l.latitude && l.longitude);
  const noCoords = listings.length - valid.length;
  console.log(`\n  With coordinates: ${valid.length}`);
  if (noCoords > 0) console.log(`  Skipped (no coords): ${noCoords}`);

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
  console.log("\nPhase 3: Publishing to Supabase...");

  // Determine which environment(s) to write to
  const writeToDevFirst = !HEADLESS && config.dev;
  const writeToProd = HEADLESS;

  // Build seenIds once (used for marking unseen listings as inactive)
  const seenIds = new Set(Array.from(deduped.keys()));

  if (writeToDevFirst) {
    const devClient = getDevClient();
    const categoryId = await getCategoryId(devClient, getCategoryForIdealista());

    const devResult = await publishListings(devClient, finalListings, selectedCityId, categoryId, "DEV");
    console.log(`\n  DEV results:`);
    console.log(`    Inserted:      ${devResult.inserted}`);
    console.log(`    Updated:       ${devResult.updated}`);
    console.log(`    Price changes: ${devResult.priceChanges}`);
    console.log(`    Errors:        ${devResult.errors}`);

    const { inactivated: devInactivated } = await markUnseenAsInactive(devClient, selectedCityId, SOURCES.IDEALISTA, seenIds, 0.5);
    if (devInactivated > 0) console.log(`    Inactivated:   ${devInactivated}`);

    // Ask about PROD
    if (config.prod) {
      const rl = createPrompt();
      const answer = await ask(rl, "\nPush to PROD? (y/n): ");
      rl.close();

      if (answer.toLowerCase() === "y") {
        const prodClient = getProdClient();
        const prodCategoryId = await getCategoryId(prodClient, getCategoryForIdealista());
        const prodResult = await publishListings(prodClient, finalListings, selectedCityId, prodCategoryId, "PROD");
        console.log(`\n  PROD results:`);
        console.log(`    Inserted:      ${prodResult.inserted}`);
        console.log(`    Updated:       ${prodResult.updated}`);
        console.log(`    Price changes: ${prodResult.priceChanges}`);
        console.log(`    Errors:        ${prodResult.errors}`);

        const { inactivated: prodInactivated } = await markUnseenAsInactive(prodClient, selectedCityId, SOURCES.IDEALISTA, seenIds, 0.5);
        if (prodInactivated > 0) console.log(`    Inactivated:   ${prodInactivated}`);
      }
    }
  }

  if (writeToProd) {
    const prodClient = getProdClient();
    const categoryId = await getCategoryId(prodClient, getCategoryForIdealista());

    const result = await publishListings(prodClient, finalListings, selectedCityId, categoryId, "PROD");
    console.log(`\n  PROD results:`);
    console.log(`    Inserted:      ${result.inserted}`);
    console.log(`    Updated:       ${result.updated}`);
    console.log(`    Price changes: ${result.priceChanges}`);
    console.log(`    Errors:        ${result.errors}`);
    if (result.skippedValidation > 0) console.log(`    Skipped (val): ${result.skippedValidation}`);

    const { inactivated, safetyGuardTripped } = await markUnseenAsInactive(prodClient, selectedCityId, SOURCES.IDEALISTA, seenIds, 0.5);
    if (inactivated > 0) console.log(`    Inactivated:   ${inactivated}`);

    // Validation failure rate check
    const validationFailRate = finalListings.length > 0 ? result.skippedValidation / finalListings.length : 0;
    if (validationFailRate > 0.2) {
      console.error(`\n  ERROR: ${Math.round(validationFailRate * 100)}% of listings failed validation. HTML structure may have changed.`);
    }

    // Send email report
    console.log("\nSending report...");
    await sendScraperReport({
      sourceName: "Idealista",
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

    if (validationFailRate > 0.2) {
      process.exit(1);
    }
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error("\nFatal error:", error.message || error);
  process.exit(1);
});

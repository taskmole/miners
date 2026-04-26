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
  buildSearchUrl,
  getFiltersForCity,
  extractGalleryPhotos,
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

interface DbPlace {
  city_id: string;
  category_id: string;
  source: string;
  source_id: string;
  name: string;
  address: string;
  location: string;
  metadata: Record<string, unknown>;
  photos: string[];
  status: string;
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
  let page = 1;

  while (true) {
    const url = buildSearchUrl(cityArea, page, filters);
    console.log(`  Page ${page}: ${url}`);

    const html = await fetchWithRetry(url, PROXY_CONFIG.searchTimeoutMs);
    if (!html) {
      console.log(`    Failed to fetch page ${page}, stopping pagination.`);
      break;
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

    page++;
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
// Source ID generation (coordinate-based dedup)
// ---------------------------------------------------------------------------

function generateSourceId(lat: number, lon: number): string {
  return `${lat.toFixed(5)}-${lon.toFixed(5)}`;
}

// ---------------------------------------------------------------------------
// Price change detection
// ---------------------------------------------------------------------------

/**
 * Detect price changes by comparing new price against existing metadata.
 * Accepts the already-fetched existing row to avoid a redundant DB query.
 */
function detectPriceChange(
  existingMeta: Record<string, unknown> | null,
  newPrice: number | null
): {
  priceChanged: boolean;
  priceHistory: Array<{ price: number; date: string }>;
} {
  if (!existingMeta) {
    return { priceChanged: false, priceHistory: [] };
  }

  const oldPrice = existingMeta.price as number | null;
  const existingHistory = (existingMeta.price_history as Array<{ price: number; date: string }>) || [];

  if (oldPrice !== null && newPrice !== null && oldPrice !== newPrice) {
    return {
      priceChanged: true,
      priceHistory: [
        ...existingHistory,
        { price: oldPrice, date: new Date().toISOString().slice(0, 10) },
      ],
    };
  }

  return { priceChanged: false, priceHistory: existingHistory };
}

// ---------------------------------------------------------------------------
// Category ID lookup
// ---------------------------------------------------------------------------

async function getCategoryId(client: SupabaseClient): Promise<string> {
  const categoryName = getCategoryForIdealista();
  const { data } = await client
    .from("categories")
    .select("id")
    .eq("name", categoryName)
    .single();

  if (!data) {
    throw new Error(
      `Category "${categoryName}" not found in database. Run "npm run publish" first to seed categories.`
    );
  }
  return data.id;
}

// ---------------------------------------------------------------------------
// Publish to Supabase
// ---------------------------------------------------------------------------

async function publishListings(
  client: SupabaseClient,
  listings: IdealistaListing[],
  cityId: string,
  categoryId: string,
  envName: string
): Promise<{ inserted: number; updated: number; priceChanges: number; errors: number; skippedValidation: number }> {
  let inserted = 0;
  let updated = 0;
  let priceChanges = 0;
  let errors = 0;
  let skippedValidation = 0;

  console.log(`\nPublishing ${listings.length} listings to ${envName}...`);

  // Pre-validate listings and compute source IDs
  const validListings: { listing: IdealistaListing; sourceId: string }[] = [];
  for (const listing of listings) {
    if (!listing.latitude || !listing.longitude) continue;
    if (!listing.price || listing.price <= 0 || !listing.title) {
      skippedValidation++;
      continue;
    }
    validListings.push({
      listing,
      sourceId: generateSourceId(listing.latitude, listing.longitude),
    });
  }

  // Batch fetch all existing records in one query (replaces N individual SELECTs)
  const sourceIds = validListings.map((v) => v.sourceId);
  const { data: existingRows } = await client
    .from("places")
    .select("id, source_id, metadata")
    .eq("source", SOURCES.IDEALISTA)
    .in("source_id", sourceIds);

  // Build lookup map: source_id -> { id, metadata }
  const existingMap = new Map<string, { id: string; metadata: Record<string, unknown> | null }>();
  for (const row of existingRows || []) {
    existingMap.set(row.source_id, {
      id: row.id,
      metadata: row.metadata as Record<string, unknown> | null,
    });
  }

  const now = new Date().toISOString();

  for (const { listing, sourceId } of validListings) {
    const existing = existingMap.get(sourceId);

    // Price change detection (uses pre-fetched metadata, no extra query)
    const existingMeta = existing?.metadata ?? null;
    const { priceChanged, priceHistory } = detectPriceChange(existingMeta, listing.price);
    if (priceChanged) priceChanges++;

    const metadata: Record<string, unknown> = {
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
      price_history: priceHistory,
      price_changed: priceChanged,
    };

    try {
      if (existing) {
        const { error } = await client
          .from("places")
          .update({
            name: listing.title,
            address: listing.address,
            location: `POINT(${listing.longitude} ${listing.latitude})`,
            metadata,
            photos: listing.photos,
            status: "active",
            updated_at: now,
            last_seen_at: now,
          })
          .eq("id", existing.id);

        if (error) {
          console.error(`  Error updating ${listing.title?.slice(0, 50)}:`, error.message);
          errors++;
        } else {
          updated++;
        }
      } else {
        const { error } = await client.from("places").insert({
          city_id: cityId,
          category_id: categoryId,
          source: SOURCES.IDEALISTA,
          source_id: sourceId,
          name: listing.title,
          address: listing.address,
          location: `POINT(${listing.longitude} ${listing.latitude})`,
          metadata,
          photos: listing.photos,
          is_new: true,
          status: "active",
          created_at: now,
          updated_at: now,
          last_seen_at: now,
        });

        if (error) {
          console.error(`  Error inserting ${listing.title?.slice(0, 50)}:`, error.message);
          errors++;
        } else {
          inserted++;
        }
      }
    } catch (err) {
      console.error(`  Exception for ${listing.title?.slice(0, 50)}:`, err);
      errors++;
    }
  }

  if (skippedValidation > 0) {
    console.log(`  Skipped (validation): ${skippedValidation}`);
  }

  return { inserted, updated, priceChanges, errors, skippedValidation };
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Email report
// ---------------------------------------------------------------------------

interface ScraperReport {
  city: string;
  totalScraped: number;
  inserted: number;
  updated: number;
  priceChanges: number;
  errors: number;
  skippedValidation: number;
  inactivated: number;
  safetyGuardTripped: boolean;
}

async function sendScraperReport(report: ScraperReport): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("  No RESEND_API_KEY set, skipping email report.");
    return;
  }

  const isAlert = report.safetyGuardTripped || report.errors > 5 || report.totalScraped === 0;
  const prefix = isAlert ? "ALERT" : "OK";

  const subject = `Scraper ${prefix}: ${report.city} - ${report.totalScraped} listings (${report.inserted} new, ${report.priceChanges} price changes)`;

  const lines = [
    `Idealista Scraper Report - ${report.city}`,
    `${"=".repeat(45)}`,
    ``,
    `Total scraped:      ${report.totalScraped}`,
    `  New listings:     ${report.inserted}`,
    `  Updated:          ${report.updated}`,
    `  Price changes:    ${report.priceChanges}`,
    `  Errors:           ${report.errors}`,
    `  Failed validation:${report.skippedValidation}`,
    `  Inactivated:      ${report.inactivated}`,
    ``,
  ];

  if (report.safetyGuardTripped) {
    lines.push(`WARNING: Safety guard tripped. Scraped far fewer listings`);
    lines.push(`than expected. Inactivation was skipped to protect data.`);
    lines.push(``);
  }

  if (report.totalScraped === 0) {
    lines.push(`WARNING: Zero listings scraped. The proxy may be blocked`);
    lines.push(`or Idealista changed their HTML structure.`);
    lines.push(``);
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Miners Scraper <onboarding@resend.dev>",
        to: ["founders@taskmole.co"],
        subject,
        text: lines.join("\n"),
      }),
    });

    if (res.ok) {
      console.log("  Report email sent.");
    } else {
      const body = await res.text();
      console.log(`  Failed to send email: ${res.status} ${body.slice(0, 100)}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  Failed to send email: ${msg}`);
  }
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
  const listings: IdealistaListing[] = [];

  for (let i = 0; i < partialListings.length; i++) {
    const partial = partialListings[i];
    const shortTitle = (partial.title || "Unknown").slice(0, 55);
    process.stdout.write(`  [${i + 1}/${partialListings.length}] ${shortTitle}...`);

    const enriched = await enrichWithDetailPage(partial);
    listings.push(enriched);

    const photoCount = enriched.photos.length;
    const hasCoords = enriched.latitude && enriched.longitude;
    console.log(` ${hasCoords ? "OK" : "NO COORDS"} (${photoCount} photos)`);

    // Rate limiting
    if (i < partialListings.length - 1) {
      await sleep(PROXY_CONFIG.delayBetweenDetailPagesMs);
    }
  }

  // Filter to listings with valid coordinates
  const valid = listings.filter((l) => l.latitude && l.longitude);
  const noCoords = listings.length - valid.length;
  console.log(`\n  With coordinates: ${valid.length}`);
  if (noCoords > 0) console.log(`  Skipped (no coords): ${noCoords}`);

  // Deduplicate within batch by source_id
  const deduped = new Map<string, IdealistaListing>();
  for (const listing of valid) {
    const sid = generateSourceId(listing.latitude!, listing.longitude!);
    if (!deduped.has(sid)) deduped.set(sid, listing);
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
  const writeToProd = HEADLESS || false;

  if (writeToDevFirst) {
    const devClient = getDevClient();
    const categoryId = await getCategoryId(devClient);

    const devResult = await publishListings(devClient, finalListings, selectedCityId, categoryId, "DEV");
    console.log(`\n  DEV results:`);
    console.log(`    Inserted:      ${devResult.inserted}`);
    console.log(`    Updated:       ${devResult.updated}`);
    console.log(`    Price changes: ${devResult.priceChanges}`);
    console.log(`    Errors:        ${devResult.errors}`);

    const seenIds = new Set(finalListings.map((l) => generateSourceId(l.latitude!, l.longitude!)));
    const { inactivated: devInactivated } = await markUnseenAsInactive(devClient, selectedCityId, SOURCES.IDEALISTA, seenIds, 0.5);
    if (devInactivated > 0) console.log(`    Inactivated:   ${devInactivated}`);

    // Ask about PROD
    if (config.prod) {
      const rl = createPrompt();
      const answer = await ask(rl, "\nPush to PROD? (y/n): ");
      rl.close();

      if (answer.toLowerCase() === "y") {
        const prodClient = getProdClient();
        const prodCategoryId = await getCategoryId(prodClient);
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
    const categoryId = await getCategoryId(prodClient);

    const result = await publishListings(prodClient, finalListings, selectedCityId, categoryId, "PROD");
    console.log(`\n  PROD results:`);
    console.log(`    Inserted:      ${result.inserted}`);
    console.log(`    Updated:       ${result.updated}`);
    console.log(`    Price changes: ${result.priceChanges}`);
    console.log(`    Errors:        ${result.errors}`);
    if (result.skippedValidation > 0) console.log(`    Skipped (val): ${result.skippedValidation}`);

    const seenIds = new Set(finalListings.map((l) => generateSourceId(l.latitude!, l.longitude!)));
    const { inactivated, safetyGuardTripped } = await markUnseenAsInactive(prodClient, selectedCityId, SOURCES.IDEALISTA, seenIds, 0.5);
    if (inactivated > 0) console.log(`    Inactivated:   ${inactivated}`);

    // Validation failure rate check
    const validationFailRate = result.skippedValidation / finalListings.length;
    if (validationFailRate > 0.2) {
      console.error(`\n  ERROR: ${Math.round(validationFailRate * 100)}% of listings failed validation. HTML structure may have changed.`);
    }

    // Send email report
    console.log("\nSending report...");
    await sendScraperReport({
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

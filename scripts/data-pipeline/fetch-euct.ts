#!/usr/bin/env npx ts-node

/**
 * European Coffee Trip Scraper
 *
 * Refreshes the EUCT cafe files in public/data/ through Bright Data Web
 * Unlocker (the site blocks plain requests). Runs monthly from
 * .github/workflows/euct-refresh.yml, which commits the changed files.
 *
 * Usage:
 *   npm run fetch:euct                       # Madrid + Prague
 *   npm run fetch:euct -- --city prague      # one city
 *   npm run fetch:euct -- --dry-run          # fetch and report, write nothing
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

import * as fs from "fs";
import Papa from "papaparse";
import { ProxyAgent } from "undici";
import { buildProxyUri, PROXY_CONFIG } from "./config/idealista";
import {
  EUCT_BASE_URL,
  EUCT_COLUMNS,
  checkSafety,
  linkKey,
  mergeCity,
  parseCafePage,
  parseCityPage,
  type CafeDetails,
  type EuctRow,
} from "./lib/euct";

/** Cities refreshed by default, and the file each one feeds. Barcelona stays frozen on purpose. */
const CITY_FILES: Record<string, string> = {
  madrid: "cafe_info.csv",
  prague: "prague_cafe_info.csv",
};

const CONCURRENCY = 4;
// ~360 pages per run; the cap leaves room for retries but stops a runaway loop.
const MAX_REQUESTS = 1_200;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const cityArg = args.includes("--city") ? args[args.indexOf("--city") + 1]?.toLowerCase() : null;

let requestCount = 0;
let agent: ProxyAgent | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch a page through Bright Data. Returns null on 404, repeated failure or the spend cap. */
async function fetchPage(url: string): Promise<string | null> {
  // Web Unlocker terminates TLS with its own certificate (see fetch-idealista.ts).
  agent ??= new ProxyAgent({ uri: buildProxyUri(), requestTls: { rejectUnauthorized: false } });

  for (let attempt = 0; attempt <= PROXY_CONFIG.maxRetries; attempt++) {
    if (requestCount >= MAX_REQUESTS) {
      console.error(`  SPEND CAP: ${MAX_REQUESTS} requests reached, skipping ${url}`);
      return null;
    }
    requestCount++;

    try {
      // No User-Agent on purpose: Web Unlocker manages the browser fingerprint.
      const response = await fetch(url, {
        dispatcher: agent,
        signal: AbortSignal.timeout(PROXY_CONFIG.detailTimeoutMs),
      } as RequestInit);
      if (response.status === 404) return null;
      if (response.ok) return await response.text();
      console.log(`  HTTP ${response.status}: ${url}`);
    } catch (err) {
      console.log(`  Error: ${(err instanceof Error ? err.message : String(err)).slice(0, 80)}: ${url}`);
    }

    if (attempt < PROXY_CONFIG.maxRetries) await sleep(PROXY_CONFIG.backoffMs[attempt]);
  }
  return null;
}

function readCityFile(filePath: string): { rows: EuctRow[]; newline: string } {
  const text = fs.readFileSync(filePath, "utf-8");
  const parsed = Papa.parse<EuctRow>(text, { header: true, skipEmptyLines: true });
  return { rows: parsed.data, newline: text.includes("\r\n") ? "\r\n" : "\n" };
}

/** Fetch every cafe page, a few at a time. Pages without a published date count as failed. */
async function fetchDetails(links: string[]): Promise<Map<string, CafeDetails | null>> {
  const details = new Map<string, CafeDetails | null>();
  let next = 0;

  async function worker() {
    while (next < links.length) {
      const link = links[next++];
      const html = await fetchPage(link);
      const parsed = html ? parseCafePage(html) : null;
      details.set(linkKey(link), parsed?.date_published ? parsed : null);
      if (details.size % 25 === 0) console.log(`  ${details.size}/${links.length} cafe pages`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return details;
}

/** Refresh one city. Returns false when a safety stop left the file untouched. */
async function refreshCity(city: string, fileName: string): Promise<boolean> {
  const filePath = path.join(__dirname, "../../public/data", fileName);
  console.log(`\n=== ${city} (${fileName}) ===`);

  const { rows: existing, newline } = readCityFile(filePath);
  const html = await fetchPage(`${EUCT_BASE_URL}/${city}`);
  const listed = html ? parseCityPage(html) : null;

  const stop = checkSafety(existing, listed);
  if (stop || !listed) {
    console.error(`  STOPPED, file left untouched: ${stop}`);
    return false;
  }
  console.log(`  Site lists ${listed.length} cafes (file has ${existing.length} rows)`);

  const details = await fetchDetails(listed.map((c) => c.link));
  const { rows, stats } = mergeCity(city, existing, listed, details);
  console.log(
    `  Kept ${stats.kept}, added ${stats.added}, removed ${stats.removed}, ` +
      `cafe pages failed ${stats.detailFailures} (kept their old details)`
  );

  const csv = Papa.unparse(rows, { columns: [...EUCT_COLUMNS], newline }) + newline;
  if (DRY_RUN) {
    console.log("  Dry run: file not written");
  } else {
    fs.writeFileSync(filePath, csv);
    console.log(`  Wrote ${rows.length} cafes`);
  }
  return true;
}

async function main() {
  if (cityArg && !CITY_FILES[cityArg]) {
    console.error(`Unknown city "${cityArg}". Choose one of: ${Object.keys(CITY_FILES).join(", ")}`);
    process.exit(1);
  }
  const cities = cityArg ? [cityArg] : Object.keys(CITY_FILES);

  let allOk = true;
  for (const city of cities) {
    // One city failing must not block the other.
    if (!(await refreshCity(city, CITY_FILES[city]))) allOk = false;
  }

  console.log(`\nDone. ${requestCount} Bright Data requests${DRY_RUN ? " (dry run)" : ""}.`);
  // Open proxy connections would otherwise keep the process alive.
  await agent?.close();
  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

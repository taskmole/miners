#!/usr/bin/env npx ts-node

/**
 * Send Combined Scraper Report
 *
 * Reads stats JSON files written by individual scraper runs and sends one
 * combined email covering all of them.
 *
 * Usage (GitHub Actions):
 *   npx ts-node send-combined-report.ts --stats /tmp/stats-rental.json --stats /tmp/stats-transfer.json
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

import * as fs from "fs";
import { sendCombinedScraperReport, type ScraperReport } from "./lib/scraper-utils";

const args = process.argv.slice(2);
const statsPaths: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--stats" && args[i + 1]) {
    statsPaths.push(args[++i]);
  }
}

if (statsPaths.length === 0) {
  console.error("Usage: send-combined-report.ts --stats <file> [--stats <file> ...]");
  process.exit(1);
}

const reports: ScraperReport[] = [];
for (const p of statsPaths) {
  if (!fs.existsSync(p)) {
    console.log(`Stats file not found, skipping: ${p}`);
    continue;
  }
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8")) as ScraperReport;
    reports.push(data);
    console.log(`Loaded stats from ${p}: ${data.sourceName} (${data.totalScraped} scraped)`);
  } catch {
    console.log(`Failed to parse stats file, skipping: ${p}`);
  }
}

async function main() {
  if (reports.length === 0) {
    console.log("No valid stats files found. Nothing to report.");
    process.exit(0);
  }

  console.log(`\nSending combined report for ${reports.length} scraper(s)...`);
  await sendCombinedScraperReport(reports);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

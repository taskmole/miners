#!/usr/bin/env npx ts-node

/**
 * Export Staging Data to CSV
 *
 * Converts staging JSON files to CSV format for frontend consumption
 * Output goes to /public/data/ for the existing data pipeline
 * Deduplicates against EU Coffee Trip cafes (50m proximity + address match)
 *
 * Usage: npm run export:csv
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { haversineDistance, DEFAULT_PROXIMITY_THRESHOLD } from "./lib/geo-utils";
import { areAddressesSimilar, DEFAULT_ADDRESS_SIMILARITY_THRESHOLD, areNamesSimilar, DEFAULT_NAME_SIMILARITY_THRESHOLD, nameSimilarity } from "./lib/address-utils";

// Directories
const STAGING_DIR = path.join(__dirname, "staging");
const OUTPUT_DIR = path.join(__dirname, "../../public/data");
const EUCT_DATA_FILE = path.join(__dirname, "../../public/data/data.csv");

/**
 * EU Coffee Trip cafe format (from data.csv)
 */
interface EUCTCafe {
  name: string;
  address: string;
  lat: number;
  lon: number;
}

/**
 * Staged place format (from fetch scripts)
 */
interface StagedPlace {
  source: string;
  source_id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  category: string;
  rating?: number;
  reviewCount?: number;
  website?: string;
  openingHours?: string[];
  primaryType?: string;
  fetchedAt: string;
}

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCSV(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  const str = String(value);
  // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert opening hours array to semicolon-separated string
 */
function formatOpeningHours(hours?: string[]): string {
  if (!hours || hours.length === 0) return "";
  return hours.join("; ");
}

/**
 * Build official Google Maps URL from a Google Place ID
 */
function googleMapsUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
}

/**
 * Matched pair: EUCT cafe + Google Places data for enrichment
 */
interface EnrichmentMatch {
  euct_name: string;
  euct_lat: number;
  euct_lon: number;
  gp_rating?: number;
  gp_reviewCount?: number;
  gp_website?: string;
  gp_openingHours?: string;
  gp_source_id: string;
  gp_google_maps_url: string;
}

/**
 * Convert enrichment matches to CSV string
 */
function toEnrichmentCSV(matches: EnrichmentMatch[]): string {
  const header = [
    "euct_name",
    "euct_lat",
    "euct_lon",
    "gp_rating",
    "gp_reviewCount",
    "gp_website",
    "gp_openingHours",
    "gp_source_id",
    "gp_google_maps_url",
  ].join(",");

  const rows = matches.map((m) =>
    [
      escapeCSV(m.euct_name),
      m.euct_lat,
      m.euct_lon,
      m.gp_rating ?? "",
      m.gp_reviewCount ?? "",
      escapeCSV(m.gp_website),
      escapeCSV(m.gp_openingHours),
      escapeCSV(m.gp_source_id),
      escapeCSV(m.gp_google_maps_url),
    ].join(",")
  );

  return [header, ...rows].join("\n");
}

/**
 * Convert staged places to CSV string
 */
function toCSV(places: StagedPlace[]): string {
  // CSV header
  const header = [
    "name",
    "address",
    "lat",
    "lon",
    "rating",
    "reviewCount",
    "website",
    "openingHours",
    "source_id",
    "category",
    "primaryType",
    "fetchedAt",
    "googleMapsUrl",
  ].join(",");

  // CSV rows
  const rows = places.map((p) =>
    [
      escapeCSV(p.name),
      escapeCSV(p.address),
      p.lat,
      p.lon,
      p.rating ?? "",
      p.reviewCount ?? "",
      escapeCSV(p.website),
      escapeCSV(formatOpeningHours(p.openingHours)),
      escapeCSV(p.source_id),
      escapeCSV(p.category),
      escapeCSV(p.primaryType),
      escapeCSV(p.fetchedAt),
      escapeCSV(googleMapsUrl(p.source_id)),
    ].join(",")
  );

  return [header, ...rows].join("\n");
}

/**
 * Load EU Coffee Trip cafes from data.csv
 */
function loadEUCTCafes(): EUCTCafe[] {
  if (!fs.existsSync(EUCT_DATA_FILE)) {
    console.log("  Warning: EU Coffee Trip data file not found, skipping deduplication");
    return [];
  }

  const content = fs.readFileSync(EUCT_DATA_FILE, "utf-8");
  const lines = content.split("\n").slice(1); // Skip header

  const cafes: EUCTCafe[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;

    // data.csv is semicolon-delimited
    const parts = line.split(";");
    if (parts.length < 5) continue;

    const name = parts[0];
    const address = parts[2];
    const lat = parseFloat(parts[3]);
    const lon = parseFloat(parts[4]);

    if (!isNaN(lat) && !isNaN(lon)) {
      cafes.push({ name, address, lat, lon });
    }
  }

  return cafes;
}

/**
 * Check if a Google Place is a duplicate of an EU Coffee Trip cafe
 * Uses proximity (50m) + EITHER address similarity (60%) OR name similarity (50%)
 * Also checks 100m for very close name matches
 */
function isDuplicateOfEUCT(
  place: StagedPlace,
  euctCafes: EUCTCafe[]
): { isDuplicate: boolean; matchedCafe?: EUCTCafe } {
  for (const euct of euctCafes) {
    const distance = haversineDistance(place.lat, place.lon, euct.lat, euct.lon);

    if (distance <= DEFAULT_PROXIMITY_THRESHOLD) {
      // Within 50m: match if EITHER address OR name is similar
      if (
        areAddressesSimilar(place.address, euct.address, DEFAULT_ADDRESS_SIMILARITY_THRESHOLD) ||
        areNamesSimilar(place.name, euct.name, DEFAULT_NAME_SIMILARITY_THRESHOLD)
      ) {
        return { isDuplicate: true, matchedCafe: euct };
      }
    } else if (distance <= 100) {
      // Between 50-100m: only match if name is very similar (higher threshold)
      if (areNamesSimilar(place.name, euct.name, 0.7)) {
        return { isDuplicate: true, matchedCafe: euct };
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Borderline candidate: within 100m with some name similarity, but not auto-matched
 */
interface BorderlineCandidate {
  place: StagedPlace;
  matchedCafe: EUCTCafe;
  distance: number;
  nameScore: number;
}

/**
 * Find borderline candidates that weren't auto-matched
 * These are within 100m with some name similarity (>0.2) for manual review
 */
function findBorderlineCandidates(
  places: StagedPlace[],
  euctCafes: EUCTCafe[]
): BorderlineCandidate[] {
  const candidates: BorderlineCandidate[] = [];

  for (const place of places) {
    let bestMatch: BorderlineCandidate | null = null;

    for (const euct of euctCafes) {
      const distance = haversineDistance(place.lat, place.lon, euct.lat, euct.lon);

      if (distance <= 100) {
        const nameScore = nameSimilarity(place.name, euct.name);

        // Any name similarity above 0.2 within 100m is worth reviewing
        if (nameScore > 0.2) {
          if (!bestMatch || nameScore > bestMatch.nameScore) {
            bestMatch = { place, matchedCafe: euct, distance, nameScore };
          }
        }
      }
    }

    if (bestMatch) {
      candidates.push(bestMatch);
    }
  }

  // Sort by distance (closest first)
  return candidates.sort((a, b) => a.distance - b.distance);
}

/**
 * Create readline interface
 */
function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask user a question
 */
async function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Main function
 */
async function main() {
  console.log("=".repeat(50));
  console.log("  Export Staging Data to CSV");
  console.log("=".repeat(50));

  // Check staging directory
  if (!fs.existsSync(STAGING_DIR)) {
    console.error("\nNo staging directory found. Run fetch first.");
    process.exit(1);
  }

  // List staging files
  const stagingFiles = fs
    .readdirSync(STAGING_DIR)
    .filter((f) => f.endsWith(".json"));

  if (stagingFiles.length === 0) {
    console.error("\nNo staging files found. Run fetch first.");
    process.exit(1);
  }

  const rl = createPrompt();

  try {
    // Show staging files
    console.log("\nStaging files found:");
    stagingFiles.forEach((file, i) => {
      const filePath = path.join(STAGING_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      console.log(`  ${i + 1}. ${file} (${data.length} places)`);
    });

    // Ask which file to export
    const fileInput = await ask(
      rl,
      "\nEnter file number to export (or 'all' to combine): "
    );

    let placesToExport: StagedPlace[] = [];
    let outputName: string;

    if (fileInput.toLowerCase() === "all") {
      // Combine all staging files
      for (const file of stagingFiles) {
        const filePath = path.join(STAGING_DIR, file);
        const data: StagedPlace[] = JSON.parse(
          fs.readFileSync(filePath, "utf-8")
        );
        placesToExport.push(...data);
      }
      // Deduplicate by source_id
      const seen = new Set<string>();
      placesToExport = placesToExport.filter((p) => {
        if (seen.has(p.source_id)) return false;
        seen.add(p.source_id);
        return true;
      });
      outputName = "google_places_cafes.csv";
      console.log(`\nCombined ${stagingFiles.length} files, ${placesToExport.length} unique places`);
    } else {
      const fileNum = parseInt(fileInput);
      if (isNaN(fileNum) || fileNum < 1 || fileNum > stagingFiles.length) {
        console.error(`\nInvalid selection: ${fileInput}`);
        process.exit(1);
      }

      const selectedFile = stagingFiles[fileNum - 1];
      const filePath = path.join(STAGING_DIR, selectedFile);
      placesToExport = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      // Extract city from filename
      const cityMatch = selectedFile.match(/google-places-(\w+)-/);
      const city = cityMatch ? cityMatch[1] : "unknown";
      outputName = `google_places_${city}.csv`;
      console.log(`\nSelected: ${selectedFile} (${placesToExport.length} places)`);
    }

    // Load EU Coffee Trip cafes for deduplication
    console.log("\nLoading EU Coffee Trip cafes for deduplication...");
    const euctCafes = loadEUCTCafes();
    console.log(`  Loaded ${euctCafes.length} EU Coffee Trip cafes`);

    // Deduplicate against EU Coffee Trip + create enrichment data
    const enrichmentMatches: EnrichmentMatch[] = [];

    if (euctCafes.length > 0) {
      console.log("\nChecking for duplicates (50m proximity + address match)...");
      const beforeCount = placesToExport.length;
      const duplicates: Array<{ place: StagedPlace; matchedCafe: EUCTCafe }> = [];

      placesToExport = placesToExport.filter((place) => {
        const { isDuplicate, matchedCafe } = isDuplicateOfEUCT(place, euctCafes);
        if (isDuplicate && matchedCafe) {
          duplicates.push({ place, matchedCafe });

          // Save matched Google Places data for EUCT enrichment
          enrichmentMatches.push({
            euct_name: matchedCafe.name,
            euct_lat: matchedCafe.lat,
            euct_lon: matchedCafe.lon,
            gp_rating: place.rating,
            gp_reviewCount: place.reviewCount,
            gp_website: place.website,
            gp_openingHours: formatOpeningHours(place.openingHours),
            gp_source_id: place.source_id,
            gp_google_maps_url: googleMapsUrl(place.source_id),
          });

          return false;
        }
        return true;
      });

      console.log(`  Found ${duplicates.length} duplicates (will enrich EUCT with their data):`);
      for (const dup of duplicates.slice(0, 10)) {
        console.log(`    - "${dup.place.name}" matches EUCT "${dup.matchedCafe.name}"`);
      }
      if (duplicates.length > 10) {
        console.log(`    ... and ${duplicates.length - 10} more`);
      }
      console.log(`  Matched for enrichment: ${enrichmentMatches.length}`);
      console.log(`  Regular cafes (non-matched): ${placesToExport.length}`);
    }

    // Find borderline candidates for manual review
    const borderlineCandidates = findBorderlineCandidates(placesToExport, euctCafes);

    if (borderlineCandidates.length > 0) {
      console.log(`\n${"=".repeat(50)}`);
      console.log(`  BORDERLINE MATCHES - Please review`);
      console.log(`  (within 100m + some name similarity)`);
      console.log(`${"=".repeat(50)}`);

      const confirmedBorderlines: Set<string> = new Set();

      for (let i = 0; i < borderlineCandidates.length; i++) {
        const c = borderlineCandidates[i];
        console.log(`\n  ${i + 1}/${borderlineCandidates.length}: GP "${c.place.name}"`);
        console.log(`     ${Math.round(c.distance)}m from "${c.matchedCafe.name}"`);
        console.log(`     GP addr:   ${c.place.address}`);
        console.log(`     EUCT addr: ${c.matchedCafe.address}`);
        console.log(`     Name similarity: ${Math.round(c.nameScore * 100)}%`);

        const answer = await ask(rl, `     → Same cafe? (y/n): `);

        if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
          confirmedBorderlines.add(c.place.source_id);

          // Add to enrichment
          enrichmentMatches.push({
            euct_name: c.matchedCafe.name,
            euct_lat: c.matchedCafe.lat,
            euct_lon: c.matchedCafe.lon,
            gp_rating: c.place.rating,
            gp_reviewCount: c.place.reviewCount,
            gp_website: c.place.website,
            gp_openingHours: formatOpeningHours(c.place.openingHours),
            gp_source_id: c.place.source_id,
            gp_google_maps_url: googleMapsUrl(c.place.source_id),
          });
        }
      }

      // Remove confirmed borderlines from regular cafes
      if (confirmedBorderlines.size > 0) {
        placesToExport = placesToExport.filter(
          (p) => !confirmedBorderlines.has(p.source_id)
        );
        console.log(`\n  Confirmed ${confirmedBorderlines.size} additional matches`);
        console.log(`  Total enrichment: ${enrichmentMatches.length}`);
        console.log(`  Regular cafes: ${placesToExport.length}`);
      }
    }

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Write regular cafes CSV (non-matched Google Places)
    const csvContent = toCSV(placesToExport);
    const outputPath = path.join(OUTPUT_DIR, outputName);
    fs.writeFileSync(outputPath, csvContent);

    console.log(`\nRegular cafes CSV exported:`);
    console.log(`  ${outputPath}`);
    console.log(`  ${placesToExport.length} places`);

    // Write enrichment CSV (matched pairs for EUCT enrichment)
    if (enrichmentMatches.length > 0) {
      const enrichmentCSV = toEnrichmentCSV(enrichmentMatches);
      const enrichmentPath = path.join(OUTPUT_DIR, "google_places_enrichment.csv");
      fs.writeFileSync(enrichmentPath, enrichmentCSV);

      console.log(`\nEnrichment CSV exported:`);
      console.log(`  ${enrichmentPath}`);
      console.log(`  ${enrichmentMatches.length} EUCT cafes will get Google Places data`);
    }

    // Ask if should delete staging files
    const deleteFiles = await ask(
      rl,
      `\nDelete processed staging file(s)? (yes/no): `
    );

    if (deleteFiles.toLowerCase() === "yes" || deleteFiles.toLowerCase() === "y") {
      if (fileInput.toLowerCase() === "all") {
        for (const file of stagingFiles) {
          fs.unlinkSync(path.join(STAGING_DIR, file));
        }
        console.log(`  Deleted ${stagingFiles.length} staging files.`);
      } else {
        const fileNum = parseInt(fileInput);
        fs.unlinkSync(path.join(STAGING_DIR, stagingFiles[fileNum - 1]));
        console.log("  Staging file deleted.");
      }
    }

    console.log("\nDone!");
  } finally {
    rl.close();
  }
}

// Run
main().catch((error) => {
  console.error("\nError:", error.message);
  process.exit(1);
});

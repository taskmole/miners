#!/usr/bin/env npx ts-node

/**
 * Google Places Fetch Script - Gyms
 *
 * Fetches upscale gyms (4+ stars) from Google Places API (Text Search)
 * Uses grid-based searching to overcome the 60-result API limit
 * Filters to only include places rated 4.0 or above
 *
 * Usage:
 *   npm run fetch:gyms                    # Single search (60 max)
 *   npm run fetch:gyms -- --grid          # 6x6 grid (default, up to 2160)
 *   npm run fetch:gyms -- --grid 3        # 3x3 grid (quick test, up to 540)
 *   npm run fetch:gyms -- --grid 7        # 7x7 grid (max coverage)
 *   npm run fetch:gyms -- --limit 500     # Limit total results
 *   npm run fetch:gyms -- --min-rating 4.5  # Custom minimum rating (default 4.0)
 */

// Parse command line arguments
const args = process.argv.slice(2);
const limitIndex = args.indexOf("--limit");
const MAX_TOTAL_RESULTS = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) || 5000 : 5000;

// Minimum rating filter (default 4.0)
const ratingIndex = args.indexOf("--min-rating");
const MIN_RATING = ratingIndex !== -1 ? parseFloat(args[ratingIndex + 1]) || 4.0 : 4.0;

// Grid mode: --grid or --grid N (default 6x6)
const gridIndex = args.indexOf("--grid");
const GRID_MODE = gridIndex !== -1;
const GRID_SIZE = GRID_MODE
  ? (parseInt(args[gridIndex + 1]) || 6)
  : 1; // 1 = no grid, single search

// Load environment variables from .env.local
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

import * as fs from "fs";
import * as readline from "readline";
import { getCityIds, getCity } from "./config/cities";
import { CATEGORIES } from "./lib/categories";

// Google Places API endpoint
const GOOGLE_PLACES_URL =
  "https://places.googleapis.com/v1/places:searchText";

// Fields to request from Google (controls billing)
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.primaryType",
  "places.websiteUri",
  "places.regularOpeningHours",
  "nextPageToken",
].join(",");

// Search query
const SEARCH_QUERY = "gym";

// Maximum results per request (Google limit is 20)
const MAX_RESULTS_PER_PAGE = 20;

// Output directory
const OUTPUT_DIR = path.join(__dirname, "../../public/data");

/**
 * City bounds type
 */
interface CityBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

/**
 * Google Places API response types
 */
interface GooglePlace {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  websiteUri?: string;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
  };
}

interface GooglePlacesResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

/**
 * Create a grid of cells from city bounds
 */
function createGrid(bounds: CityBounds, size: number): CityBounds[] {
  const cells: CityBounds[] = [];
  const latStep = (bounds.north - bounds.south) / size;
  const lonStep = (bounds.east - bounds.west) / size;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
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

/**
 * Create readline interface for user prompts
 */
function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask user a question and return answer
 */
async function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Fetch places from a single cell (with pagination up to 60 results)
 */
async function fetchCell(
  apiKey: string,
  bounds: CityBounds
): Promise<GooglePlace[]> {
  const places: GooglePlace[] = [];
  let pageToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      textQuery: SEARCH_QUERY,
      languageCode: "en",
      locationRestriction: {
        rectangle: {
          low: { latitude: bounds.south, longitude: bounds.west },
          high: { latitude: bounds.north, longitude: bounds.east },
        },
      },
      maxResultCount: MAX_RESULTS_PER_PAGE,
    };

    if (pageToken) {
      body.pageToken = pageToken;
    }

    const response = await fetch(GOOGLE_PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API error: ${response.status} - ${errorText}`);
    }

    const data: GooglePlacesResponse = await response.json();

    if (data.places) {
      places.push(...data.places);
    }

    pageToken = data.nextPageToken;

    // Small delay between pages
    if (pageToken) {
      await new Promise((r) => setTimeout(r, 300));
    }
  } while (pageToken);

  return places;
}

/**
 * Fetch places using grid search
 */
async function fetchWithGrid(
  apiKey: string,
  bounds: CityBounds,
  gridSize: number,
  limit: number
): Promise<{ places: GooglePlace[]; limitReached: boolean }> {
  const cells = createGrid(bounds, gridSize);
  const allPlaces: GooglePlace[] = [];
  const seenIds = new Set<string>();
  let limitReached = false;

  console.log(`\nGrid search: ${gridSize}×${gridSize} = ${cells.length} cells`);
  console.log(`Max possible results: ${cells.length * 60} (before deduplication)`);
  console.log(`Limit: ${limit}\n`);

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    process.stdout.write(`  Cell ${i + 1}/${cells.length}... `);

    try {
      const cellPlaces = await fetchCell(apiKey, cell);

      // Deduplicate by place ID
      let newCount = 0;
      for (const place of cellPlaces) {
        if (!seenIds.has(place.id)) {
          seenIds.add(place.id);
          allPlaces.push(place);
          newCount++;
        }
      }

      console.log(`${cellPlaces.length} found, ${newCount} new (total: ${allPlaces.length})`);

      // Check limit
      if (allPlaces.length >= limit) {
        limitReached = true;
        console.log(`\n  ** Limit of ${limit} reached **`);
        break;
      }

      // Delay between cells to be nice to API
      if (i < cells.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (error) {
      console.log(`ERROR - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { places: allPlaces, limitReached };
}

/**
 * Fetch places (single search, no grid)
 */
async function fetchSingle(
  apiKey: string,
  bounds: CityBounds,
  limit: number
): Promise<{ places: GooglePlace[]; limitReached: boolean }> {
  console.log(`\nSingle search (no grid) - max 60 results`);
  console.log(`Limit: ${limit}\n`);

  const places = await fetchCell(apiKey, bounds);
  const limitReached = places.length >= limit;

  console.log(`  Total: ${places.length} places fetched`);
  if (places.length < 60) {
    console.log(`  ** All available results fetched **\n`);
  } else {
    console.log(`  ** Hit 60-result API limit. Use --grid for more results. **\n`);
  }

  return { places: places.slice(0, limit), limitReached };
}

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCSV(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build official Google Maps URL from a Google Place ID
 */
function googleMapsUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
}

/**
 * Convert opening hours array to semicolon-separated string
 */
function formatOpeningHours(hours?: string[]): string {
  if (!hours || hours.length === 0) return "";
  return hours.join("; ");
}

/**
 * Convert places array to CSV string
 */
function toCSV(places: GooglePlace[]): string {
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

  const now = new Date().toISOString();

  const rows = places.map((p) =>
    [
      escapeCSV(p.displayName.text),
      escapeCSV(p.formattedAddress),
      p.location.latitude,
      p.location.longitude,
      p.rating ?? "",
      p.userRatingCount ?? "",
      escapeCSV(p.websiteUri),
      escapeCSV(formatOpeningHours(p.regularOpeningHours?.weekdayDescriptions)),
      escapeCSV(p.id),
      escapeCSV(CATEGORIES.GYM),
      escapeCSV(p.primaryType),
      escapeCSV(now),
      escapeCSV(googleMapsUrl(p.id)),
    ].join(",")
  );

  return [header, ...rows].join("\n");
}

/**
 * Main function
 */
async function main() {
  console.log("=".repeat(50));
  console.log("  Google Places Fetch - Gyms (4+ Stars)");
  console.log("=".repeat(50));

  // Show mode
  if (GRID_MODE) {
    console.log(`  Grid: ${GRID_SIZE}×${GRID_SIZE} = ${GRID_SIZE * GRID_SIZE} cells`);
    console.log(`  Max results: ${GRID_SIZE * GRID_SIZE * 60} (before deduplication)`);
  } else {
    console.log("  Grid: OFF (single search, max 60 results)");
  }
  console.log(`  Minimum rating: ${MIN_RATING} stars`);
  console.log(`  Limit: ${MAX_TOTAL_RESULTS} places`);

  // Check for API key
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("\nError: GOOGLE_PLACES_API_KEY not found in environment.");
    console.error("Add it to your .env.local file.");
    process.exit(1);
  }

  const rl = createPrompt();

  try {
    // Show city options
    const cityIds = getCityIds();
    console.log("\nAvailable cities:");
    cityIds.forEach((id, i) => {
      const city = getCity(id);
      console.log(`  ${i + 1}. ${city?.name} (${id})`);
    });

    // Ask for city
    const cityInput = await ask(rl, "\nEnter city number or ID: ");

    // Parse city selection
    let selectedCityId: string;
    const cityNum = parseInt(cityInput);
    if (!isNaN(cityNum) && cityNum >= 1 && cityNum <= cityIds.length) {
      selectedCityId = cityIds[cityNum - 1];
    } else if (cityIds.includes(cityInput.toLowerCase())) {
      selectedCityId = cityInput.toLowerCase();
    } else {
      console.error(`\nInvalid city: ${cityInput}`);
      process.exit(1);
    }

    const city = getCity(selectedCityId)!;
    console.log(`\nSelected: ${city.name}`);

    // Fetch from Google Places
    let googlePlaces: GooglePlace[];
    let limitReached: boolean;

    if (GRID_MODE) {
      const result = await fetchWithGrid(apiKey, city.bounds, GRID_SIZE, MAX_TOTAL_RESULTS);
      googlePlaces = result.places;
      limitReached = result.limitReached;
    } else {
      const result = await fetchSingle(apiKey, city.bounds, MAX_TOTAL_RESULTS);
      googlePlaces = result.places;
      limitReached = result.limitReached;
    }

    if (googlePlaces.length === 0) {
      console.log("No gyms found from Google.");
      process.exit(0);
    }

    // Filter by minimum rating
    const beforeFilter = googlePlaces.length;
    googlePlaces = googlePlaces.filter((p) => p.rating !== undefined && p.rating >= MIN_RATING);

    console.log(`\nRating filter (${MIN_RATING}+ stars):`);
    console.log(`  Before: ${beforeFilter} places`);
    console.log(`  After:  ${googlePlaces.length} places (removed ${beforeFilter - googlePlaces.length} below ${MIN_RATING} stars)`);

    if (limitReached) {
      console.log(`\n** WARNING: Hit limit of ${MAX_TOTAL_RESULTS}. There may be more places. **`);
    }

    if (googlePlaces.length === 0) {
      console.log("\nNo gyms found with the minimum rating. Try lowering --min-rating.");
      process.exit(0);
    }

    // Show preview
    console.log(`\nTop 10 results:`);
    const sorted = [...googlePlaces].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    sorted.slice(0, 10).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.displayName.text} - ${p.rating}★ (${p.userRatingCount || 0} reviews)`);
    });
    if (googlePlaces.length > 10) {
      console.log(`  ... and ${googlePlaces.length - 10} more`);
    }

    // Ask to save
    const save = await ask(rl, `\nSave ${googlePlaces.length} gyms to CSV? (yes/no): `);
    if (save.toLowerCase() !== "yes" && save.toLowerCase() !== "y") {
      console.log("Cancelled.");
      process.exit(0);
    }

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Write CSV
    const csvContent = toCSV(googlePlaces);
    const outputFile = path.join(OUTPUT_DIR, `gyms_${selectedCityId}.csv`);
    fs.writeFileSync(outputFile, csvContent);

    console.log(`\nCSV exported:`);
    console.log(`  ${outputFile}`);
    console.log(`  ${googlePlaces.length} gyms (${MIN_RATING}+ stars)`);
    console.log("\nDone!");
  } finally {
    rl.close();
  }
}

// Run if called directly
main().catch((error) => {
  console.error("\nError:", error.message);
  process.exit(1);
});

#!/usr/bin/env npx ts-node

/**
 * Google Places Fetch Script
 *
 * Fetches specialty coffee locations from Google Places API (Text Search)
 * Uses grid-based searching to overcome the 60-result API limit
 *
 * Usage:
 *   npm run fetch:google                    # Single search (60 max)
 *   npm run fetch:google -- --grid          # 6x6 grid (default, up to 2160)
 *   npm run fetch:google -- --grid 3        # 3x3 grid (quick test, up to 540)
 *   npm run fetch:google -- --grid 7        # 7x7 grid (max coverage)
 *   npm run fetch:google -- --refresh       # Include existing places for updates
 *   npm run fetch:google -- --limit 500     # Limit total results
 */

// Parse command line arguments
const args = process.argv.slice(2);
const REFRESH_MODE = args.includes("--refresh");
const limitIndex = args.indexOf("--limit");
const MAX_TOTAL_RESULTS = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) || 5000 : 5000;

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
import { CITIES, getCityIds, getCity } from "./config/cities";
import { SOURCES, getCategoryForGooglePlace } from "./lib/categories";
import { haversineDistance, DEFAULT_PROXIMITY_THRESHOLD } from "./lib/geo-utils";
import {
  areAddressesSimilar,
  DEFAULT_ADDRESS_SIMILARITY_THRESHOLD,
} from "./lib/address-utils";
import { getDevClient, getExistingSourceIds, checkConfig } from "./lib/supabase";

// Google Places API endpoint
const GOOGLE_PLACES_URL =
  "https://places.googleapis.com/v1/places:searchText";

// Fields to request from Google (controls billing)
// IMPORTANT: nextPageToken must be included or pagination won't work!
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
const SEARCH_QUERY = "specialty coffee";

// Maximum results per request (Google limit is 20)
const MAX_RESULTS_PER_PAGE = 20;

// Staging output directory
const STAGING_DIR = path.join(__dirname, "staging");

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
 * Create a grid of cells from city bounds
 * Each cell is a smaller bounding box that can be searched independently
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
 * Our staging format for review
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
 * Divides the city into cells and searches each independently
 */
async function fetchWithGrid(
  apiKey: string,
  bounds: CityBounds,
  gridSize: number,
  limit: number
): Promise<{ places: GooglePlace[]; limitReached: boolean; cellsSearched: number }> {
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

      // Deduplicate by source_id
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
      // Continue with next cell
    }
  }

  return {
    places: allPlaces,
    limitReached,
    cellsSearched: Math.min(cells.length, allPlaces.length >= limit ? cells.indexOf(cells.find(() => true)!) + 1 : cells.length),
  };
}

/**
 * Fetch places from Google Places API (single search, no grid)
 */
async function fetchGooglePlaces(
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
 * Convert Google Place to our staging format
 */
function toStagedPlace(gPlace: GooglePlace): StagedPlace {
  return {
    source: SOURCES.GOOGLE_PLACES,
    source_id: gPlace.id,
    name: gPlace.displayName.text,
    address: gPlace.formattedAddress,
    lat: gPlace.location.latitude,
    lon: gPlace.location.longitude,
    category: getCategoryForGooglePlace(gPlace.primaryType || ""),
    rating: gPlace.rating,
    reviewCount: gPlace.userRatingCount,
    website: gPlace.websiteUri,
    openingHours: gPlace.regularOpeningHours?.weekdayDescriptions,
    primaryType: gPlace.primaryType,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Check if a place might be a duplicate of existing places
 * Uses proximity (50m) + address similarity (60%)
 */
function findPotentialDuplicate(
  newPlace: StagedPlace,
  existingPlaces: StagedPlace[]
): StagedPlace | null {
  for (const existing of existingPlaces) {
    // Check proximity
    const distance = haversineDistance(
      newPlace.lat,
      newPlace.lon,
      existing.lat,
      existing.lon
    );

    if (distance <= DEFAULT_PROXIMITY_THRESHOLD) {
      // Within 50m, also check address similarity
      if (
        areAddressesSimilar(
          newPlace.address,
          existing.address,
          DEFAULT_ADDRESS_SIMILARITY_THRESHOLD
        )
      ) {
        return existing;
      }
    }
  }
  return null;
}

/**
 * Main function
 */
async function main() {
  console.log("=".repeat(50));
  console.log("  Google Places Fetch - Specialty Coffee");
  console.log("=".repeat(50));

  // Show mode
  if (GRID_MODE) {
    console.log(`  Grid: ${GRID_SIZE}×${GRID_SIZE} = ${GRID_SIZE * GRID_SIZE} cells`);
    console.log(`  Max results: ${GRID_SIZE * GRID_SIZE * 60} (before deduplication)`);
  } else {
    console.log("  Grid: OFF (single search, max 60 results)");
  }
  if (REFRESH_MODE) {
    console.log("  Mode: REFRESH (includes existing places for updates)");
  } else {
    console.log("  Mode: NEW ONLY (skips places already in database)");
  }
  console.log(`  Limit: ${MAX_TOTAL_RESULTS} places`);

  // Check for API key
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("\nError: GOOGLE_PLACES_API_KEY not found in environment.");
    console.error("Add it to your .env.local file.");
    process.exit(1);
  }

  // Check Supabase config
  const config = checkConfig();
  if (!config.dev) {
    console.error("\nError: Supabase DEV credentials not configured.");
    console.error("Add SUPABASE_DEV_URL and SUPABASE_DEV_KEY to .env.local");
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

    // Fetch from Google Places (grid or single search)
    let googlePlaces: GooglePlace[];
    let limitReached: boolean;

    if (GRID_MODE) {
      const result = await fetchWithGrid(
        apiKey,
        city.bounds,
        GRID_SIZE,
        MAX_TOTAL_RESULTS
      );
      googlePlaces = result.places;
      limitReached = result.limitReached;
    } else {
      const result = await fetchGooglePlaces(
        apiKey,
        city.bounds,
        MAX_TOTAL_RESULTS
      );
      googlePlaces = result.places;
      limitReached = result.limitReached;
    }

    if (googlePlaces.length === 0) {
      console.log("No places found from Google.");
      process.exit(0);
    }

    // Convert to staging format
    const stagedPlaces = googlePlaces.map(toStagedPlace);

    // Get existing source_ids from database
    console.log("Checking for existing places in database...");
    const client = getDevClient();
    const existingIds = await getExistingSourceIds(client, SOURCES.GOOGLE_PLACES);
    console.log(`  Found ${existingIds.size} existing Google Places in DB\n`);

    // Filter based on mode
    let placesToStage: StagedPlace[];
    if (REFRESH_MODE) {
      // Refresh mode: include all places (existing will be updated)
      placesToStage = stagedPlaces;
      console.log(`Results (REFRESH mode - all places staged for update):`);
      console.log(`  Total fetched:    ${stagedPlaces.length}`);
      console.log(`  Will be updated:  ${stagedPlaces.filter((p) => existingIds.has(p.source_id)).length}`);
      console.log(`  New places:       ${stagedPlaces.filter((p) => !existingIds.has(p.source_id)).length}`);
    } else {
      // Normal mode: only NEW places (not in DB by source_id)
      placesToStage = stagedPlaces.filter((p) => !existingIds.has(p.source_id));
      console.log(`Results:`);
      console.log(`  Total fetched: ${stagedPlaces.length}`);
      console.log(`  Already in DB: ${stagedPlaces.length - placesToStage.length}`);
      console.log(`  New places:    ${placesToStage.length}`);
    }

    // Report limit status
    if (limitReached) {
      console.log(`\n** WARNING: Hit limit of ${MAX_TOTAL_RESULTS}. There may be more places. **`);
    } else {
      console.log(`\n** Fetched all available results (${stagedPlaces.length} total, under limit of ${MAX_TOTAL_RESULTS}) **`);
    }

    if (placesToStage.length === 0) {
      console.log("\nNo new places to review. Database is up to date.");
      process.exit(0);
    }

    // Save to staging file
    if (!fs.existsSync(STAGING_DIR)) {
      fs.mkdirSync(STAGING_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const modeLabel = REFRESH_MODE ? "refresh" : "new";
    const gridLabel = GRID_MODE ? `grid${GRID_SIZE}x${GRID_SIZE}` : "single";
    const stagingFile = path.join(
      STAGING_DIR,
      `google-places-${selectedCityId}-${gridLabel}-${modeLabel}-${timestamp}.json`
    );

    fs.writeFileSync(stagingFile, JSON.stringify(placesToStage, null, 2));

    console.log(`\nStaging file saved:`);
    console.log(`  ${stagingFile}`);
    console.log(`\nNext step: Run "npm run publish" to push to database.`);
  } finally {
    rl.close();
  }
}

// Run if called directly
main().catch((error) => {
  console.error("\nError:", error.message);
  process.exit(1);
});

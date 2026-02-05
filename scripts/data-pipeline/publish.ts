#!/usr/bin/env npx ts-node

/**
 * Publish Script - Push Staging Data to Supabase
 *
 * Reads staging files and pushes approved data to Supabase
 * Always writes to DEV first, then asks before PROD
 *
 * Usage: npm run publish
 */

// Load environment variables from .env.local
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env.local") });

import * as fs from "fs";
import * as readline from "readline";
import { getDevClient, getProdClient, checkConfig } from "./lib/supabase";
import { CATEGORIES, SOURCES } from "./lib/categories";
import { getCity, getCityIds } from "./config/cities";
import { SupabaseClient } from "@supabase/supabase-js";

// Staging directory
const STAGING_DIR = path.join(__dirname, "staging");

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
 * Database place format
 */
interface DbPlace {
  city_id: string;
  category_id: string;
  source: string;
  source_id: string;
  name: string;
  address: string;
  location: string; // PostGIS point: POINT(lon lat)
  metadata: Record<string, unknown>;
  status: string;
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
 * Seed cities if they don't exist
 */
async function seedCities(client: SupabaseClient): Promise<void> {
  console.log("Checking cities...");

  const cityIds = getCityIds();

  for (const cityId of cityIds) {
    const city = getCity(cityId);
    if (!city) continue;

    // Check if city exists
    const { data: existing } = await client
      .from("cities")
      .select("id")
      .eq("id", cityId)
      .single();

    if (!existing) {
      console.log(`  Creating city: ${city.name}`);

      // Calculate center point from bounds
      const centerLat = (city.bounds.north + city.bounds.south) / 2;
      const centerLon = (city.bounds.east + city.bounds.west) / 2;

      // Determine country from city name
      const countryMap: Record<string, string> = {
        madrid: "Spain",
        barcelona: "Spain",
        prague: "Czech Republic",
      };

      const { error } = await client.from("cities").insert({
        id: cityId,
        name: city.name,
        country: countryMap[cityId] || null,
        center: `POINT(${centerLon} ${centerLat})`,
        enabled: true,
      });

      if (error) {
        console.error(`  Error creating city ${cityId}:`, error.message);
      }
    } else {
      console.log(`  City exists: ${city.name}`);
    }
  }
}

/**
 * Seed categories if they don't exist, return category map
 */
async function seedCategories(
  client: SupabaseClient
): Promise<Map<string, string>> {
  console.log("Checking categories...");

  const categoryMap = new Map<string, string>();

  // Category definitions with icons and colors
  const categoryDefs = [
    {
      name: CATEGORIES.EU_COFFEE_TRIP,
      icon: "coffee",
      color: "#8B4513",
      is_system: true,
    },
    {
      name: CATEGORIES.REGULAR_CAFE,
      icon: "coffee",
      color: "#6B4423",
      is_system: true,
    },
    {
      name: CATEGORIES.THE_MINERS,
      icon: "star",
      color: "#FFD700",
      is_system: true,
    },
    {
      name: CATEGORIES.PROPERTY,
      icon: "building",
      color: "#4169E1",
      is_system: true,
    },
    {
      name: CATEGORIES.TRANSIT_STATION,
      icon: "train",
      color: "#228B22",
      is_system: true,
    },
    {
      name: CATEGORIES.OFFICE_CENTER,
      icon: "briefcase",
      color: "#708090",
      is_system: true,
    },
    {
      name: CATEGORIES.SHOPPING_CENTER,
      icon: "shopping-bag",
      color: "#FF69B4",
      is_system: true,
    },
    {
      name: CATEGORIES.HIGH_STREET,
      icon: "map-pin",
      color: "#FF4500",
      is_system: true,
    },
    {
      name: CATEGORIES.UNIVERSITY,
      icon: "graduation-cap",
      color: "#800080",
      is_system: true,
    },
    {
      name: CATEGORIES.STUDENT_DORM,
      icon: "home",
      color: "#9370DB",
      is_system: true,
    },
    {
      name: CATEGORIES.NEW_DEVELOPMENT,
      icon: "construction",
      color: "#FFA500",
      is_system: true,
    },
  ];

  for (const cat of categoryDefs) {
    // Check if category exists
    const { data: existing } = await client
      .from("categories")
      .select("id, name")
      .eq("name", cat.name)
      .single();

    if (existing) {
      categoryMap.set(cat.name, existing.id);
      console.log(`  Category exists: ${cat.name}`);
    } else {
      console.log(`  Creating category: ${cat.name}`);

      const { data: created, error } = await client
        .from("categories")
        .insert(cat)
        .select("id")
        .single();

      if (error) {
        console.error(`  Error creating category ${cat.name}:`, error.message);
      } else if (created) {
        categoryMap.set(cat.name, created.id);
      }
    }
  }

  return categoryMap;
}

/**
 * Convert staged place to database format
 */
function toDbPlace(
  staged: StagedPlace,
  cityId: string,
  categoryId: string
): DbPlace {
  // Build metadata from extra fields
  const metadata: Record<string, unknown> = {};

  if (staged.rating !== undefined) metadata.rating = staged.rating;
  if (staged.reviewCount !== undefined) metadata.reviewCount = staged.reviewCount;
  if (staged.website) metadata.website = staged.website;
  if (staged.openingHours) metadata.openingHours = staged.openingHours;
  if (staged.primaryType) metadata.primaryType = staged.primaryType;
  metadata.fetchedAt = staged.fetchedAt;

  return {
    city_id: cityId,
    category_id: categoryId,
    source: staged.source,
    source_id: staged.source_id,
    name: staged.name,
    address: staged.address,
    location: `POINT(${staged.lon} ${staged.lat})`, // PostGIS format: POINT(lon lat)
    metadata,
    status: "active",
  };
}

/**
 * Get city ID from staging file name
 */
function getCityFromFilename(filename: string): string | null {
  // Format: google-places-madrid-new-2026-01-22T16-35-26-029Z.json
  // or: google-places-madrid-refresh-2026-01-22T16-35-26-029Z.json
  const match = filename.match(/google-places-(\w+)-(new|refresh)-/);
  if (match) return match[1];

  // Legacy format: google-places-madrid-2026-01-22T16-35-26-029Z.json
  const legacyMatch = filename.match(/google-places-(\w+)-\d{4}/);
  return legacyMatch ? legacyMatch[1] : null;
}

/**
 * Check if this is a refresh file (includes existing places for updates)
 */
function isRefreshFile(filename: string): boolean {
  return filename.includes("-refresh-");
}

/**
 * Mark places not seen in this fetch as inactive
 * Only called for REFRESH imports - protects user data by not deleting
 */
async function markUnseenAsInactive(
  client: SupabaseClient,
  cityId: string,
  source: string,
  seenSourceIds: Set<string>
): Promise<number> {
  console.log(`\nMarking unseen places as inactive...`);

  // Get all active places for this city/source
  const { data: existingPlaces, error } = await client
    .from("places")
    .select("id, source_id, name")
    .eq("city_id", cityId)
    .eq("source", source)
    .eq("status", "active");

  if (error) {
    console.error(`  Error fetching existing places:`, error.message);
    return 0;
  }

  if (!existingPlaces || existingPlaces.length === 0) {
    console.log(`  No existing active places to check.`);
    return 0;
  }

  // Find places not in the fetch results
  const unseenPlaces = existingPlaces.filter(
    (p) => !seenSourceIds.has(p.source_id)
  );

  if (unseenPlaces.length === 0) {
    console.log(`  All ${existingPlaces.length} existing places were seen in fetch.`);
    return 0;
  }

  console.log(`  Found ${unseenPlaces.length} places not in fetch results:`);
  for (const p of unseenPlaces.slice(0, 5)) {
    console.log(`    - ${p.name}`);
  }
  if (unseenPlaces.length > 5) {
    console.log(`    ... and ${unseenPlaces.length - 5} more`);
  }

  // Mark them as inactive (not deleted - preserves user data)
  let markedCount = 0;
  for (const place of unseenPlaces) {
    const { error: updateError } = await client
      .from("places")
      .update({
        status: "inactive",
        updated_at: new Date().toISOString(),
      })
      .eq("id", place.id);

    if (!updateError) {
      markedCount++;
    }
  }

  console.log(`  Marked ${markedCount} places as inactive.`);
  return markedCount;
}

/**
 * Publish places to database
 */
async function publishPlaces(
  client: SupabaseClient,
  places: DbPlace[],
  envName: string
): Promise<{ inserted: number; updated: number; errors: number }> {
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  console.log(`\nPublishing ${places.length} places to ${envName}...`);

  for (const place of places) {
    try {
      // Check if exists
      const { data: existing } = await client
        .from("places")
        .select("id")
        .eq("source", place.source)
        .eq("source_id", place.source_id)
        .single();

      if (existing) {
        // Update existing
        const { error } = await client
          .from("places")
          .update({
            name: place.name,
            address: place.address,
            location: place.location,
            metadata: place.metadata,
            status: place.status,
            updated_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) {
          console.error(`  Error updating ${place.name}:`, error.message);
          errors++;
        } else {
          updated++;
        }
      } else {
        // Insert new
        const { error } = await client.from("places").insert({
          ...place,
          is_new: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        });

        if (error) {
          console.error(`  Error inserting ${place.name}:`, error.message);
          errors++;
        } else {
          inserted++;
        }
      }
    } catch (err) {
      console.error(`  Exception for ${place.name}:`, err);
      errors++;
    }
  }

  return { inserted, updated, errors };
}

/**
 * Main function
 */
async function main() {
  console.log("=".repeat(50));
  console.log("  Publish - Push Staging Data to Supabase");
  console.log("=".repeat(50));

  // Check Supabase config
  const config = checkConfig();
  if (!config.dev) {
    console.error("\nError: Supabase DEV credentials not configured.");
    console.error("Add SUPABASE_DEV_URL and SUPABASE_DEV_KEY to .env.local");
    process.exit(1);
  }

  // List staging files
  if (!fs.existsSync(STAGING_DIR)) {
    console.error("\nNo staging directory found. Run fetch first.");
    process.exit(1);
  }

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

    // Ask which file to publish
    const fileInput = await ask(rl, "\nEnter file number to publish (or 'all'): ");

    let filesToPublish: string[] = [];

    if (fileInput.toLowerCase() === "all") {
      filesToPublish = stagingFiles;
    } else {
      const fileNum = parseInt(fileInput);
      if (!isNaN(fileNum) && fileNum >= 1 && fileNum <= stagingFiles.length) {
        filesToPublish = [stagingFiles[fileNum - 1]];
      } else {
        console.error(`\nInvalid selection: ${fileInput}`);
        process.exit(1);
      }
    }

    // Get DEV client
    const devClient = getDevClient();

    // Seed cities and categories in DEV
    console.log("\n--- Preparing DEV database ---");
    await seedCities(devClient);
    const categoryMap = await seedCategories(devClient);

    // Process each file
    for (const file of filesToPublish) {
      console.log(`\n--- Processing: ${file} ---`);

      // Read staging data
      const filePath = path.join(STAGING_DIR, file);
      const stagedPlaces: StagedPlace[] = JSON.parse(
        fs.readFileSync(filePath, "utf-8")
      );

      // Get city ID from filename
      const cityId = getCityFromFilename(file);
      if (!cityId) {
        console.error(`  Could not determine city from filename: ${file}`);
        continue;
      }

      // Get category ID
      const categoryId = categoryMap.get(CATEGORIES.REGULAR_CAFE);
      if (!categoryId) {
        console.error(`  Category not found: ${CATEGORIES.REGULAR_CAFE}`);
        continue;
      }

      console.log(`  City: ${cityId}`);
      console.log(`  Category: ${CATEGORIES.REGULAR_CAFE} (${categoryId})`);
      console.log(`  Places: ${stagedPlaces.length}`);

      // Convert to database format
      const dbPlaces = stagedPlaces.map((p) => toDbPlace(p, cityId, categoryId));

      // Publish to DEV
      const devResult = await publishPlaces(devClient, dbPlaces, "DEV");
      console.log(`\nDEV Results:`);
      console.log(`  Inserted: ${devResult.inserted}`);
      console.log(`  Updated:  ${devResult.updated}`);
      console.log(`  Errors:   ${devResult.errors}`);

      // For REFRESH files: mark places not in fetch as inactive
      if (isRefreshFile(file) && devResult.errors === 0) {
        const seenSourceIds = new Set(stagedPlaces.map((p) => p.source_id));
        await markUnseenAsInactive(
          devClient,
          cityId,
          SOURCES.GOOGLE_PLACES,
          seenSourceIds
        );
      }

      // Ask about PROD
      if (config.prod && devResult.errors === 0) {
        const pushToProd = await ask(
          rl,
          "\nPush to PROD as well? (yes/no): "
        );

        if (pushToProd.toLowerCase() === "yes" || pushToProd.toLowerCase() === "y") {
          const prodClient = getProdClient();

          // Seed cities and categories in PROD
          console.log("\n--- Preparing PROD database ---");
          await seedCities(prodClient);
          const prodCategoryMap = await seedCategories(prodClient);

          const prodCategoryId = prodCategoryMap.get(CATEGORIES.REGULAR_CAFE);
          if (prodCategoryId) {
            // Re-convert with prod category ID (should be same but let's be safe)
            const prodDbPlaces = stagedPlaces.map((p) =>
              toDbPlace(p, cityId, prodCategoryId)
            );

            const prodResult = await publishPlaces(
              prodClient,
              prodDbPlaces,
              "PROD"
            );
            console.log(`\nPROD Results:`);
            console.log(`  Inserted: ${prodResult.inserted}`);
            console.log(`  Updated:  ${prodResult.updated}`);
            console.log(`  Errors:   ${prodResult.errors}`);

            // For REFRESH files: mark places not in fetch as inactive in PROD too
            if (isRefreshFile(file) && prodResult.errors === 0) {
              const seenSourceIds = new Set(stagedPlaces.map((p) => p.source_id));
              await markUnseenAsInactive(
                prodClient,
                cityId,
                SOURCES.GOOGLE_PLACES,
                seenSourceIds
              );
            }
          }
        }
      }

      // Ask to delete staging file
      const deleteFile = await ask(
        rl,
        `\nDelete staging file ${file}? (yes/no): `
      );

      if (deleteFile.toLowerCase() === "yes" || deleteFile.toLowerCase() === "y") {
        fs.unlinkSync(filePath);
        console.log("  Staging file deleted.");
      }
    }

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

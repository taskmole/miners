#!/usr/bin/env npx ts-node

/**
 * Data Migration: localStorage → Supabase
 *
 * This script migrates user-generated data from browser localStorage
 * to Supabase database.
 *
 * IMPORTANT: This is a SKELETON - do not run until:
 * 1. Supabase tables are created (run supabase/create-tables.sql)
 * 2. Seed data is loaded (run supabase/seed-data.sql)
 * 3. Auth is configured (users exist in Supabase)
 *
 * Usage:
 *   npx ts-node scripts/migrate-to-supabase.ts [export-path]
 *
 * The script expects a JSON file exported from the browser console
 * containing the localStorage data to migrate.
 *
 * How to export localStorage from browser:
 *   1. Open DevTools Console
 *   2. Run: copy(JSON.stringify(localStorage))
 *   3. Paste into a file: migration-data.json
 *   4. Run: npx ts-node scripts/migrate-to-supabase.ts migration-data.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ===========================================
// TYPES - Match localStorage structures
// ===========================================

// Scouting trips (from src/types/scouting.ts)
interface ScoutingTrip {
  id: string;
  cityId: string;
  createdBy: string;
  authorName: string;
  tripType: 'form' | 'upload';
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  name: string;
  property: { type: string; id: string; name: string; address?: string } | null;
  relatedPlaces: { type: string; id: string; name: string }[];
  checklist: { id: string; question: string; isChecked: boolean; notes: string }[];
  attachments: { id: string; name: string; type: string; size: number; data: string }[];
  address?: string;
  areaSqm?: number;
  monthlyRent?: number;
  // ... more fields from scouting.ts
  createdAt: string;
  updatedAt: string;
}

interface ScoutingTripsState {
  version: number;
  trips: ScoutingTrip[];
}

// Lists (from src/types/lists.ts)
interface ListItem {
  id: string;
  placeId: string;
  placeType: string;
  placeName: string;
  placeAddress: string;
  lat: number;
  lon: number;
  addedAt: string;
}

interface LocationList {
  id: string;
  name: string;
  createdAt: string;
  items: ListItem[];
  drawnAreas: { id: string; areaId: string; areaType: string; name: string; addedAt: string }[];
}

interface ListsState {
  version: number;
  lists: LocationList[];
}

// Comments (from src/types/comments.ts)
interface PoiComment {
  id: string;
  entityType: 'place';
  entityId: string;
  content: string;
  createdBy: string;
  authorName: string;
  createdAt: string;
}

interface PoiCommentsState {
  version: number;
  comments: Record<string, PoiComment[]>;
}

// Hidden POIs
interface HiddenPoisState {
  version: number;
  hiddenIds: string[];
}

// Drawn shapes (from src/types/draw.ts)
interface ShapeMetadata {
  name?: string;
  color?: string;
  tags?: string[];
  link?: string;
  categoryId?: string;
  address?: string;
  createdBy?: string;
}

interface DrawnShapesState {
  features: GeoJSON.FeatureCollection;
  metadata: Record<string, ShapeMetadata>;
}

// ===========================================
// STORAGE KEYS
// ===========================================

const STORAGE_KEYS = {
  scoutingTrips: 'miners-scouting-trips',
  lists: 'miners-lists',
  comments: 'miners-poi-comments',
  hiddenPois: 'miners-hidden-pois',
  drawnShapes: 'miners-drawn-shapes',
  shapeMetadata: 'miners-shape-metadata',
  pointCategories: 'miners-point-categories',
  browserSession: 'miners-browser-session-id',
};

// ===========================================
// MIGRATION FUNCTIONS
// ===========================================

/**
 * Migrate scouting trips to pitches table
 */
async function migrateScoutingTrips(
  data: ScoutingTripsState,
  userIdMapping: Map<string, string> // browserSessionId → supabaseUserId
): Promise<{ success: number; failed: number }> {
  console.log(`\nMigrating ${data.trips.length} scouting trips...`);

  let success = 0;
  let failed = 0;

  for (const trip of data.trips) {
    try {
      // Map browser session to Supabase user
      const supabaseUserId = userIdMapping.get(trip.createdBy);
      if (!supabaseUserId) {
        console.log(`  ⚠ Skipping trip ${trip.id}: unknown user ${trip.createdBy}`);
        failed++;
        continue;
      }

      // TODO: Insert into pitches table
      // const { error } = await supabase.from('pitches').insert({
      //   id: trip.id,
      //   city_id: trip.cityId,
      //   created_by: supabaseUserId,
      //   status: trip.status,
      //   address: trip.address,
      //   area_sqm: trip.areaSqm,
      //   monthly_rent: trip.monthlyRent,
      //   // ... map all fields
      //   created_at: trip.createdAt,
      //   updated_at: trip.updatedAt,
      // });

      console.log(`  ✓ Trip: ${trip.name || trip.id}`);
      success++;
    } catch (error) {
      console.log(`  ✗ Trip ${trip.id}: ${error}`);
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Migrate user lists to lists + list_items tables
 */
async function migrateLists(
  data: ListsState,
  userIdMapping: Map<string, string>
): Promise<{ success: number; failed: number }> {
  console.log(`\nMigrating ${data.lists.length} lists...`);

  let success = 0;
  let failed = 0;

  for (const list of data.lists) {
    try {
      // TODO: Insert into lists table
      // const { data: insertedList, error } = await supabase.from('lists').insert({
      //   id: list.id,
      //   name: list.name,
      //   created_by: userIdMapping.get('guest') || null,
      //   created_at: list.createdAt,
      // }).select().single();

      // TODO: Insert list items
      // for (const item of list.items) {
      //   await supabase.from('list_items').insert({
      //     list_id: list.id,
      //     place_id: item.placeId, // Need to map to UUID
      //     added_at: item.addedAt,
      //   });
      // }

      console.log(`  ✓ List: ${list.name} (${list.items.length} items)`);
      success++;
    } catch (error) {
      console.log(`  ✗ List ${list.id}: ${error}`);
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Migrate POI comments to comments table
 */
async function migrateComments(
  data: PoiCommentsState,
  userIdMapping: Map<string, string>
): Promise<{ success: number; failed: number }> {
  const allComments = Object.values(data.comments).flat();
  console.log(`\nMigrating ${allComments.length} comments...`);

  let success = 0;
  let failed = 0;

  for (const comment of allComments) {
    try {
      // TODO: Insert into comments table
      // const { error } = await supabase.from('comments').insert({
      //   entity_type: comment.entityType,
      //   entity_id: comment.entityId, // Need to map to UUID
      //   content: comment.content,
      //   created_by: userIdMapping.get(comment.createdBy) || null,
      //   created_at: comment.createdAt,
      // });

      console.log(`  ✓ Comment on ${comment.entityId}`);
      success++;
    } catch (error) {
      console.log(`  ✗ Comment ${comment.id}: ${error}`);
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Migrate hidden POIs to hidden_pois table
 */
async function migrateHiddenPois(
  data: HiddenPoisState,
  userId: string
): Promise<{ success: number; failed: number }> {
  console.log(`\nMigrating ${data.hiddenIds.length} hidden POIs...`);

  let success = 0;
  let failed = 0;

  for (const placeId of data.hiddenIds) {
    try {
      // TODO: Insert into hidden_pois table
      // const { error } = await supabase.from('hidden_pois').insert({
      //   user_id: userId,
      //   place_id: placeId,
      // });

      console.log(`  ✓ Hidden: ${placeId}`);
      success++;
    } catch (error) {
      console.log(`  ✗ Hidden POI ${placeId}: ${error}`);
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Migrate drawn shapes to areas table
 */
async function migrateDrawnShapes(
  features: GeoJSON.FeatureCollection,
  metadata: Record<string, ShapeMetadata>,
  userIdMapping: Map<string, string>
): Promise<{ success: number; failed: number }> {
  console.log(`\nMigrating ${features.features.length} drawn shapes...`);

  let success = 0;
  let failed = 0;

  for (const feature of features.features) {
    const id = feature.id as string;
    const meta = metadata[id] || {};

    try {
      // Only migrate polygons (lines become connections or separate table)
      if (feature.geometry.type !== 'Polygon') {
        console.log(`  ⚠ Skipping non-polygon: ${id}`);
        continue;
      }

      // TODO: Insert into areas table
      // const { error } = await supabase.from('areas').insert({
      //   name: meta.name || `Area ${id.slice(0, 8)}`,
      //   link: meta.link,
      //   geometry: feature.geometry, // PostGIS will handle GeoJSON
      //   tags: meta.tags,
      //   color: meta.color,
      //   created_by: userIdMapping.get(meta.createdBy || '') || null,
      // });

      console.log(`  ✓ Area: ${meta.name || id}`);
      success++;
    } catch (error) {
      console.log(`  ✗ Shape ${id}: ${error}`);
      failed++;
    }
  }

  return { success, failed };
}

// ===========================================
// MAIN
// ===========================================

async function main() {
  console.log('='.repeat(50));
  console.log('  localStorage → Supabase Migration');
  console.log('='.repeat(50));

  // Get input file path
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.log('\nUsage: npx ts-node scripts/migrate-to-supabase.ts <exported-localStorage.json>');
    console.log('\nTo export localStorage from browser:');
    console.log('  1. Open DevTools Console');
    console.log('  2. Run: copy(JSON.stringify(localStorage))');
    console.log('  3. Paste into a file');
    process.exit(1);
  }

  // Read input file
  const fullPath = path.resolve(inputPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`\nFile not found: ${fullPath}`);
    process.exit(1);
  }

  console.log(`\nReading: ${fullPath}`);
  const rawData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

  // Parse each storage key
  const parseKey = <T>(key: string): T | null => {
    const value = rawData[key];
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  // Summary of what we found
  console.log('\nData found:');
  const scoutingTrips = parseKey<ScoutingTripsState>(STORAGE_KEYS.scoutingTrips);
  const lists = parseKey<ListsState>(STORAGE_KEYS.lists);
  const comments = parseKey<PoiCommentsState>(STORAGE_KEYS.comments);
  const hiddenPois = parseKey<HiddenPoisState>(STORAGE_KEYS.hiddenPois);
  const drawnShapes = parseKey<{ features: GeoJSON.FeatureCollection }>(STORAGE_KEYS.drawnShapes);
  const shapeMetadata = parseKey<Record<string, ShapeMetadata>>(STORAGE_KEYS.shapeMetadata);
  const browserSession = rawData[STORAGE_KEYS.browserSession];

  console.log(`  Scouting trips: ${scoutingTrips?.trips?.length ?? 0}`);
  console.log(`  Lists: ${lists?.lists?.length ?? 0}`);
  console.log(`  Comments: ${comments ? Object.values(comments.comments).flat().length : 0}`);
  console.log(`  Hidden POIs: ${hiddenPois?.hiddenIds?.length ?? 0}`);
  console.log(`  Drawn shapes: ${drawnShapes?.features?.features?.length ?? 0}`);
  console.log(`  Browser session: ${browserSession || 'none'}`);

  // User ID mapping (browser session → Supabase user)
  // TODO: Build this from actual user data
  const userIdMapping = new Map<string, string>();
  userIdMapping.set('guest', '00000000-0000-0000-0000-000000000000'); // Placeholder

  console.log('\n' + '='.repeat(50));
  console.log('  DRY RUN - No data will be written');
  console.log('='.repeat(50));
  console.log('\nTo perform actual migration:');
  console.log('  1. Run supabase/create-tables.sql');
  console.log('  2. Run supabase/seed-data.sql');
  console.log('  3. Set up user authentication');
  console.log('  4. Uncomment the supabase.insert() calls in this script');
  console.log('  5. Run this script again');

  // Run migrations (dry run - nothing actually inserted)
  if (scoutingTrips) {
    await migrateScoutingTrips(scoutingTrips, userIdMapping);
  }
  if (lists) {
    await migrateLists(lists, userIdMapping);
  }
  if (comments) {
    await migrateComments(comments, userIdMapping);
  }
  if (hiddenPois && browserSession) {
    await migrateHiddenPois(hiddenPois, browserSession);
  }
  if (drawnShapes && shapeMetadata) {
    await migrateDrawnShapes(drawnShapes.features, shapeMetadata, userIdMapping);
  }

  console.log('\n' + '='.repeat(50));
  console.log('  Dry run complete');
  console.log('='.repeat(50));
}

main().catch((error) => {
  console.error('\nError:', error.message);
  process.exit(1);
});

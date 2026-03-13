/**
 * Migration Script: localStorage → Supabase
 *
 * Reads exported localStorage data and uploads to Supabase.
 * Now properly looks up UUIDs from the places table.
 *
 * Run with: npx ts-node scripts/migrate-localstorage-to-supabase.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_PROD_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PROD_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MIGRATION_USER_ID = '00000000-0000-0000-0000-000000000001';

// Cache for place lookups: "cafe-40.43513--3.70732" → UUID
const placeUuidCache: Map<string, string> = new Map();

/**
 * Parse a coordinate-based placeId and look up the UUID from places table
 * Format: "{type}-{lat}-{lon}" e.g. "cafe-40.4383509--3.6948472"
 *
 * Note: localStorage may have more decimal places than what's stored in places table.
 * We normalize to 5 decimal places to match the generateSourceId format.
 */
async function lookupPlaceUuid(placeId: string): Promise<string | null> {
  // Check cache first
  if (placeUuidCache.has(placeId)) {
    return placeUuidCache.get(placeId)!;
  }

  // Parse the placeId: "cafe-40.4383509--3.6948472"
  // Handle negative longitudes which create extra dashes
  const firstDash = placeId.indexOf('-');
  if (firstDash === -1) return null;

  const source = placeId.substring(0, firstDash); // "cafe"
  const coordsPart = placeId.substring(firstDash + 1); // "40.4383509--3.6948472"

  // Split coords - handle negative numbers (double dash)
  const coordMatch = coordsPart.match(/^(-?\d+\.?\d*)-(-?\d+\.?\d*)$/);
  if (!coordMatch) return null;

  const lat = parseFloat(coordMatch[1]);
  const lon = parseFloat(coordMatch[2]);

  if (isNaN(lat) || isNaN(lon)) return null;

  // Normalize to 5 decimal places to match places table
  const sourceId = `${lat.toFixed(5)}-${lon.toFixed(5)}`;

  // Look up in places table
  const { data, error } = await supabase
    .from('places')
    .select('id')
    .eq('source', source)
    .eq('source_id', sourceId)
    .single();

  if (error || !data) {
    return null;
  }

  // Cache it
  placeUuidCache.set(placeId, data.id);
  return data.id;
}

async function main() {
  console.log('Starting localStorage → Supabase migration...\n');
  console.log('(With proper UUID lookups from places table)\n');

  const dataPath = path.join(__dirname, '../unused_data/data.txt');
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const localStorage = JSON.parse(rawData);

  const results: Record<string, { success: number; failed: number }> = {};

  // 1. Hidden POIs (place_id is TEXT, no UUID lookup needed)
  console.log('1. Migrating hidden POIs...');
  results.hidden_pois = await migrateHiddenPois(localStorage['miners-hidden-pois']);

  // 2. Lists + Items (need UUID lookup for place_id)
  console.log('2. Migrating lists + items...');
  results.lists = await migrateLists(localStorage['miners-location-lists']);

  // 3. Comments (need UUID lookup for entity_id)
  console.log('3. Migrating comments...');
  results.comments = await migrateComments(localStorage['miners-poi-comments']);

  // 4. Scouting trips (pitches) - generate new UUIDs for trip IDs
  console.log('4. Migrating scouting trips...');
  results.pitches = await migrateScoutingTrips(localStorage['miners-scouting-trips']);

  // 5. Drawn shapes (areas) - generate new UUIDs
  console.log('5. Migrating drawn shapes...');
  results.areas = await migrateDrawnShapes(
    localStorage['miners-drawn-features'],
    localStorage['miners-shape-metadata']
  );

  console.log('\n=== Migration Summary ===');
  for (const [table, counts] of Object.entries(results)) {
    console.log(`${table}: ${counts.success} success, ${counts.failed} failed`);
  }
}

// ===========================================
// Migration Functions
// ===========================================

async function migrateHiddenPois(data: string | undefined) {
  if (!data) return { success: 0, failed: 0 };

  const parsed = JSON.parse(data);
  const hiddenIds: string[] = parsed.hiddenIds || [];

  let success = 0;
  let failed = 0;

  for (const placeId of hiddenIds) {
    const { error } = await supabase.from('hidden_pois').upsert({
      user_id: MIGRATION_USER_ID,
      place_id: placeId,
    }, { onConflict: 'user_id,place_id' });

    if (error) {
      console.error(`  Failed: ${placeId}:`, error.message);
      failed++;
    } else {
      success++;
    }
  }

  console.log(`  Migrated ${success}/${hiddenIds.length} hidden POIs`);
  return { success, failed };
}

async function migrateLists(data: string | undefined) {
  if (!data) return { success: 0, failed: 0 };

  const parsed = JSON.parse(data);
  const lists: any[] = parsed.lists || [];

  let success = 0;
  let failed = 0;
  let itemsSuccess = 0;
  let itemsFailed = 0;
  let itemsSkipped = 0;

  for (const list of lists) {
    const { error: listError } = await supabase.from('lists').upsert({
      id: list.id,
      name: list.name,
      created_by: MIGRATION_USER_ID,
      created_at: list.createdAt,
    }, { onConflict: 'id' });

    if (listError) {
      console.error(`  Failed list ${list.name}:`, listError.message);
      failed++;
      continue;
    }

    // Insert list items with UUID lookup
    for (const item of list.items || []) {
      const placeUuid = await lookupPlaceUuid(item.placeId);

      if (!placeUuid) {
        // Place not found in places table - skip this item
        itemsSkipped++;
        continue;
      }

      const { error: itemError } = await supabase.from('list_items').upsert({
        id: item.id,
        list_id: list.id,
        place_id: placeUuid, // Use the looked-up UUID
        added_at: item.addedAt,
        comments: item.placeName,
      }, { onConflict: 'id' });

      if (itemError) {
        console.error(`  Failed list_item:`, itemError.message);
        itemsFailed++;
      } else {
        itemsSuccess++;
      }
    }

    success++;
  }

  console.log(`  Migrated ${success}/${lists.length} lists`);
  console.log(`  Items: ${itemsSuccess} success, ${itemsFailed} failed, ${itemsSkipped} skipped (place not found)`);
  return { success, failed };
}

async function migrateComments(data: string | undefined) {
  if (!data) return { success: 0, failed: 0 };

  const parsed = JSON.parse(data);
  const commentsMap: Record<string, any[]> = parsed.comments || {};

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const [entityId, comments] of Object.entries(commentsMap)) {
    for (const comment of comments) {
      if (!comment.content) continue;

      // Look up UUID for the entity
      const placeId = comment.entityId || entityId;
      const entityUuid = await lookupPlaceUuid(placeId);

      if (!entityUuid) {
        skipped++;
        continue;
      }

      const { error } = await supabase.from('comments').upsert({
        id: comment.id,
        entity_type: comment.entityType || 'place',
        entity_id: entityUuid, // Use the looked-up UUID
        content: comment.content,
        created_by: MIGRATION_USER_ID,
        created_at: comment.createdAt,
      }, { onConflict: 'id' });

      if (error) {
        console.error(`  Failed comment:`, error.message);
        failed++;
      } else {
        success++;
      }
    }
  }

  console.log(`  Migrated ${success} comments (${skipped} skipped - place not found)`);
  return { success, failed };
}

async function migrateScoutingTrips(data: string | undefined) {
  if (!data) return { success: 0, failed: 0 };

  const parsed = JSON.parse(data);
  const trips: any[] = parsed.trips || [];

  let success = 0;
  let failed = 0;

  for (const trip of trips) {
    // Generate a proper UUID for the trip
    const tripUuid = crypto.randomUUID();

    const { error } = await supabase.from('pitches').upsert({
      id: tripUuid,
      city_id: trip.cityId || 'madrid',
      created_by: MIGRATION_USER_ID,
      status: trip.status || 'draft',
      address: trip.property?.address || trip.name,
      condition_notes: trip.notes,
      monthly_rent: trip.property?.data?.price,
      area_sqm: trip.property?.data?.size,
      created_at: trip.createdAt || new Date().toISOString(),
    }, { onConflict: 'id' });

    if (error) {
      console.error(`  Failed pitch:`, error.message);
      failed++;
    } else {
      success++;
    }
  }

  console.log(`  Migrated ${success}/${trips.length} scouting trips`);
  return { success, failed };
}

async function migrateDrawnShapes(
  featuresData: string | undefined,
  metadataData: string | undefined
) {
  if (!featuresData) return { success: 0, failed: 0 };

  const features = JSON.parse(featuresData);
  const metadata = metadataData ? JSON.parse(metadataData) : {};

  let success = 0;
  let failed = 0;

  const featureList = features.features || [];

  for (const feature of featureList) {
    if (feature.geometry.type !== 'Polygon') continue;

    const meta = metadata[feature.id] || {};

    // Generate a proper UUID for the area
    const areaUuid = crypto.randomUUID();

    // Convert GeoJSON coordinates to WKT for PostGIS
    const coords = feature.geometry.coordinates[0];
    const wktCoords = coords.map((c: number[]) => `${c[0]} ${c[1]}`).join(', ');
    const wkt = `POLYGON((${wktCoords}))`;

    const { error } = await supabase.from('areas').upsert({
      id: areaUuid,
      city_id: 'madrid',
      name: meta.name || `Shape ${feature.id.slice(0, 8)}`,
      geometry: wkt,
      tags: meta.tags || [],
      color: meta.color,
      comments: meta.comments,
      created_by: MIGRATION_USER_ID,
    }, { onConflict: 'id' });

    if (error) {
      console.error(`  Failed area:`, error.message);
      failed++;
    } else {
      success++;
    }
  }

  console.log(`  Migrated ${success}/${featureList.length} drawn shapes`);
  return { success, failed };
}

main().catch(console.error);

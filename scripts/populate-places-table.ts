/**
 * Populate Places Table from CSV Files
 *
 * This script reads all POI CSVs and inserts them into the `places` table.
 * Each place gets a UUID. The source + source_id combo allows lookups.
 *
 * Run with: npx ts-node scripts/populate-places-table.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_PROD_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PROD_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Type for CSV rows
type CsvRow = Record<string, string>;

// Generate source_id from coordinates (matches app's generatePlaceId format)
function generateSourceId(lat: number, lon: number): string {
  return `${lat.toFixed(5)}-${lon.toFixed(5)}`;
}

async function main() {
  console.log('Populating places table from CSVs...\n');

  const results: Record<string, { success: number; failed: number }> = {};

  // 1. Cafes (cafe_info.csv)
  console.log('1. Loading cafes...');
  results.cafes = await loadCafes();

  // 2. Barcelona cafes
  console.log('2. Loading Barcelona cafes...');
  results.barcelona_cafes = await loadBarcelonaCafes();

  // 3. Properties (idealista.csv)
  console.log('3. Loading properties...');
  results.properties = await loadProperties();

  // 4. Gyms
  console.log('4. Loading gyms...');
  results.gyms = await loadGyms();

  // Print summary
  console.log('\n=== Population Summary ===');
  for (const [source, counts] of Object.entries(results)) {
    console.log(`${source}: ${counts.success} success, ${counts.failed} failed`);
  }
}

async function loadCafes() {
  const csvPath = path.join(__dirname, '../public/data/cafe_info.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('  cafe_info.csv not found, skipping');
    return { success: 0, failed: 0 };
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true }) as CsvRow[];

  let success = 0;
  let failed = 0;

  for (const row of records) {
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);
    if (isNaN(lat) || isNaN(lon)) continue;

    const sourceId = generateSourceId(lat, lon);

    const { error } = await supabase.from('places').upsert({
      source: 'cafe',
      source_id: sourceId,
      city_id: row.city_name || 'madrid',
      name: row.name,
      address: row.address,
      location: `POINT(${lon} ${lat})`,
      metadata: {
        link: row.link,
        premium: row.premium === 'True',
        website: row.website,
        instagram: row.instagram,
        facebook: row.facebook,
        featured_photo: row.featured_photo,
      },
      photos: row.featured_photo ? [row.featured_photo] : [],
    }, { onConflict: 'source,source_id' });

    if (error) {
      console.error(`  Failed: ${row.name}:`, error.message);
      failed++;
    } else {
      success++;
    }
  }

  console.log(`  Loaded ${success}/${records.length} cafes`);
  return { success, failed };
}

async function loadBarcelonaCafes() {
  const csvPath = path.join(__dirname, '../public/data/barcelona_cafe_info.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('  barcelona_cafe_info.csv not found, skipping');
    return { success: 0, failed: 0 };
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true }) as CsvRow[];

  let success = 0;
  let failed = 0;

  for (const row of records) {
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);
    if (isNaN(lat) || isNaN(lon)) continue;

    const sourceId = generateSourceId(lat, lon);

    const { error } = await supabase.from('places').upsert({
      source: 'cafe',
      source_id: sourceId,
      city_id: 'barcelona',
      name: row.name,
      address: row.address,
      location: `POINT(${lon} ${lat})`,
      metadata: {
        link: row.link,
        premium: row.premium === 'True',
        website: row.website,
        instagram: row.instagram,
        facebook: row.facebook,
        featured_photo: row.featured_photo,
      },
      photos: row.featured_photo ? [row.featured_photo] : [],
    }, { onConflict: 'source,source_id' });

    if (error) {
      console.error(`  Failed: ${row.name}:`, error.message);
      failed++;
    } else {
      success++;
    }
  }

  console.log(`  Loaded ${success}/${records.length} Barcelona cafes`);
  return { success, failed };
}

async function loadProperties() {
  const csvPath = path.join(__dirname, '../public/data/idealista.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('  idealista.csv not found, skipping');
    return { success: 0, failed: 0 };
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true }) as CsvRow[];

  let success = 0;
  let failed = 0;

  for (const row of records) {
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);
    if (isNaN(lat) || isNaN(lon)) continue;

    const sourceId = generateSourceId(lat, lon);

    const { error } = await supabase.from('places').upsert({
      source: 'property',
      source_id: sourceId,
      city_id: 'madrid',
      name: row.title,
      address: row.address,
      location: `POINT(${lon} ${lat})`,
      metadata: {
        url: row.url,
        price: parseFloat(row.price) || null,
        size: parseFloat(row.size) || null,
        district: row.district,
        bathrooms: parseFloat(row.bathrooms) || null,
        hasAirConditioning: row['features/hasAirConditioning'] === 'TRUE',
        hasStorefront: row['features/hasStorefront'] === 'TRUE',
      },
      photos: row.image_url ? [row.image_url] : [],
    }, { onConflict: 'source,source_id' });

    if (error) {
      console.error(`  Failed: ${row.title}:`, error.message);
      failed++;
    } else {
      success++;
    }
  }

  console.log(`  Loaded ${success}/${records.length} properties`);
  return { success, failed };
}

async function loadGyms() {
  const csvPath = path.join(__dirname, '../public/data/gyms_madrid.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('  gyms_madrid.csv not found, skipping');
    return { success: 0, failed: 0 };
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true }) as CsvRow[];

  let success = 0;
  let failed = 0;

  for (const row of records) {
    const lat = parseFloat(row.lat);
    const lon = parseFloat(row.lon);
    if (isNaN(lat) || isNaN(lon)) continue;

    const sourceId = generateSourceId(lat, lon);

    const { error } = await supabase.from('places').upsert({
      source: 'gym',
      source_id: sourceId,
      city_id: 'madrid',
      name: row.name,
      address: row.address,
      location: `POINT(${lon} ${lat})`,
      metadata: {
        rating: parseFloat(row.rating) || null,
        reviewCount: parseInt(row.reviewCount) || null,
        website: row.website,
        openingHours: row.openingHours,
        googleMapsUrl: row.googleMapsUrl,
        googlePlaceId: row.source_id,
      },
    }, { onConflict: 'source,source_id' });

    if (error) {
      console.error(`  Failed: ${row.name}:`, error.message);
      failed++;
    } else {
      success++;
    }
  }

  console.log(`  Loaded ${success}/${records.length} gyms`);
  return { success, failed };
}

main().catch(console.error);

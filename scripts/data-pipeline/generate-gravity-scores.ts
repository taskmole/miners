#!/usr/bin/env npx ts-node

/**
 * Gravity Score Pre-Calculation Script
 *
 * Calculates location attractiveness scores for the entire city
 * and saves as a GeoJSON file for instant display in the app.
 *
 * Usage:
 *   npm run generate-gravity              # Generate for Madrid (default)
 *   npm run generate-gravity -- barcelona # Generate for Barcelona
 *
 * Output: public/data/gravity_{city}.geojson
 */

import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { getCity, getCityIds, CityBounds } from "./config/cities";
import {
  getGravityParams,
  GravityParams,
  logParams,
} from "./config/gravity-params";

// ============================================================
// LOAD CONFIGURATION
// ============================================================
// Parameters are loaded from config/gravity-params.ts
// To change weights, edit that file (or fetch from DB when ready)

const params: GravityParams = getGravityParams();
const WEIGHTS = params.weights;
const BETA = params.beta;
const RESOLUTION = params.resolution;
const INFLUENCE = params.influence;
const POI_TYPE_WEIGHTS = params.poiTypeWeights;

// ============================================================
// TYPES
// ============================================================

interface GridPoint {
  lat: number;
  lon: number;
}

interface GeoJSONFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "Point" | "Polygon" | "MultiPolygon";
    coordinates: number[] | number[][] | number[][][] | number[][][][];
  };
}

// CSV record types for type-safe parsing
interface CafeRecord {
  latitude: string;
  longitude: string;
}

interface GymRecord {
  lat: string;
  lon: string;
}

interface TrafficRecord {
  latitude?: string;
  longitude?: string;
  avg_count?: string;
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
  metadata?: {
    paramsVersion: string;
    cityId: string;
    resolution: number;
    pointCount: number;
    minScore: number;
    maxScore: number;
    calculatedAt: string;
  };
}

interface POI {
  lat: number;
  lon: number;
  type: string;
}

interface TrafficSensor {
  lat: number;
  lon: number;
  count: number;
}

// ============================================================
// DISTANCE CALCULATIONS
// ============================================================

/**
 * Fast flat-earth distance in meters (accurate for short distances)
 */
function fastDistance(lat1: number, lon1: number, lat2: number, lon2: number, cosLat: number): number {
  const dy = (lat2 - lat1) * 111320;
  const dx = (lon2 - lon1) * 111320 * cosLat;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Distance decay function - returns 0-1 based on distance
 */
function distanceDecay(distance: number, maxRadius: number): number {
  if (distance >= maxRadius) return 0;
  if (distance <= 0) return 1;
  const normalized = distance / maxRadius;
  return 1 / (1 + Math.pow(normalized * 2, BETA));
}

// ============================================================
// GRID GENERATION
// ============================================================

function generateGrid(bounds: CityBounds, resolution: number): GridPoint[] {
  const points: GridPoint[] = [];

  // Convert resolution to degrees
  const metersPerDegreeLat = 111320;
  const avgLat = (bounds.north + bounds.south) / 2;
  const cosLat = Math.cos(avgLat * Math.PI / 180);
  const metersPerDegreeLon = 111320 * cosLat;

  const latStep = resolution / metersPerDegreeLat;
  const lonStep = resolution / metersPerDegreeLon;

  for (let lat = bounds.south; lat <= bounds.north; lat += latStep) {
    for (let lon = bounds.west; lon <= bounds.east; lon += lonStep) {
      points.push({ lat, lon });
    }
  }

  console.log(`  Grid: ${points.length} points at ${resolution}m resolution`);
  return points;
}

// ============================================================
// SCORE CALCULATIONS
// ============================================================

function calculatePopulationScore(
  point: GridPoint,
  populationData: GeoJSONCollection | null,
  cosLat: number
): number {
  if (!populationData?.features?.length) return 0;

  let totalScore = 0;

  for (const feature of populationData.features) {
    const density = (feature.properties?.density as number) || 0;
    if (density <= 0) continue;

    // Get centroid of polygon
    const centroid = getPolygonCentroid(feature);
    if (!centroid) continue;

    const distance = fastDistance(point.lat, point.lon, centroid.lat, centroid.lon, cosLat);
    if (distance >= INFLUENCE.population) continue;

    const decay = distanceDecay(distance, INFLUENCE.population);
    const normalizedDensity = Math.min(density / 30000, 1);
    totalScore += decay * normalizedDensity;
  }

  return Math.min(totalScore, 1);
}

function calculateIncomeScore(
  point: GridPoint,
  incomeData: GeoJSONCollection | null,
  cosLat: number
): number {
  if (!incomeData?.features?.length) return 0;

  let totalScore = 0;
  let totalWeight = 0;

  for (const feature of incomeData.features) {
    const wealthyPct = (feature.properties?.wealthyPct as number) || 0;
    const avgIncome = (feature.properties?.avgIncome as number) || 0;
    if (wealthyPct <= 0 && avgIncome <= 0) continue;

    const centroid = getPolygonCentroid(feature);
    if (!centroid) continue;

    const distance = fastDistance(point.lat, point.lon, centroid.lat, centroid.lon, cosLat);
    if (distance >= INFLUENCE.income) continue;

    const decay = distanceDecay(distance, INFLUENCE.income);
    const normalizedScore = wealthyPct > 0
      ? Math.min(wealthyPct / 40, 1)
      : Math.min(avgIncome / 50000, 1);

    totalScore += decay * normalizedScore;
    totalWeight += decay;
  }

  return totalWeight > 0 ? Math.min(totalScore / totalWeight, 1) : 0;
}

function calculateMetroScore(
  point: GridPoint,
  metroStations: GridPoint[],
  cosLat: number
): number {
  if (!metroStations?.length) return 0;

  let maxScore = 0;

  for (const station of metroStations) {
    const distance = fastDistance(point.lat, point.lon, station.lat, station.lon, cosLat);
    if (distance >= INFLUENCE.metro) continue;

    const decay = distanceDecay(distance, INFLUENCE.metro);
    maxScore = Math.max(maxScore, decay);
  }

  return maxScore;
}

function calculateTrafficScore(
  point: GridPoint,
  trafficData: TrafficSensor[],
  cosLat: number
): number {
  if (!trafficData?.length) return 0;

  let totalScore = 0;

  for (const sensor of trafficData) {
    const distance = fastDistance(point.lat, point.lon, sensor.lat, sensor.lon, cosLat);
    if (distance >= INFLUENCE.traffic) continue;

    const decay = distanceDecay(distance, INFLUENCE.traffic);
    const normalizedCount = Math.min(sensor.count / 3000, 1);
    totalScore += decay * normalizedCount;
  }

  return Math.min(totalScore, 1);
}

function calculatePoiScore(
  point: GridPoint,
  pois: POI[],
  cosLat: number
): number {
  if (!pois?.length) return 0;

  let totalScore = 0;

  for (const poi of pois) {
    const distance = fastDistance(point.lat, point.lon, poi.lat, poi.lon, cosLat);
    if (distance >= INFLUENCE.poi) continue;

    const decay = distanceDecay(distance, INFLUENCE.poi);

    // Weight by POI type (from config)
    const typeWeight = poi.type === "cafe" ? POI_TYPE_WEIGHTS.cafe :
                       poi.type === "metro" ? POI_TYPE_WEIGHTS.metro :
                       poi.type === "gym" ? POI_TYPE_WEIGHTS.gym : POI_TYPE_WEIGHTS.other;

    totalScore += decay * typeWeight;
  }

  return Math.min(totalScore, 1);
}

function calculateGravityScore(
  point: GridPoint,
  data: {
    populationData: GeoJSONCollection | null;
    incomeData: GeoJSONCollection | null;
    metroStations: GridPoint[];
    trafficData: TrafficSensor[];
    pois: POI[];
  },
  cosLat: number
): number {
  const popScore = calculatePopulationScore(point, data.populationData, cosLat);
  const incomeScore = calculateIncomeScore(point, data.incomeData, cosLat);
  const metroScore = calculateMetroScore(point, data.metroStations, cosLat);
  const trafficScore = calculateTrafficScore(point, data.trafficData, cosLat);
  const poiScore = calculatePoiScore(point, data.pois, cosLat);

  const totalWeight = WEIGHTS.population + WEIGHTS.income + WEIGHTS.metro +
                      WEIGHTS.traffic + WEIGHTS.poi;

  const weightedSum =
    (popScore * WEIGHTS.population) +
    (incomeScore * WEIGHTS.income) +
    (metroScore * WEIGHTS.metro) +
    (trafficScore * WEIGHTS.traffic) +
    (poiScore * WEIGHTS.poi);

  return weightedSum / totalWeight;
}

// ============================================================
// HELPERS
// ============================================================

function getPolygonCentroid(feature: GeoJSONFeature): GridPoint | null {
  try {
    if (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon") {
      return null;
    }

    const coords = feature.geometry.type === "Polygon"
      ? (feature.geometry.coordinates as number[][][])[0]
      : (feature.geometry.coordinates as number[][][][])[0][0];

    if (!coords || coords.length < 3) return null;

    let sumLat = 0;
    let sumLon = 0;
    for (const [lon, lat] of coords) {
      sumLat += lat;
      sumLon += lon;
    }

    return {
      lat: sumLat / coords.length,
      lon: sumLon / coords.length,
    };
  } catch {
    return null;
  }
}

// ============================================================
// DATA LOADING
// ============================================================

function loadGeoJSON(filePath: string): GeoJSONCollection | null {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`  Warning: ${path.basename(filePath)} not found`);
      return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.log(`  Warning: Could not load ${path.basename(filePath)}`);
    return null;
  }
}

function loadMetroStations(filePath: string): GridPoint[] {
  const data = loadGeoJSON(filePath);
  if (!data) return [];

  const stations: GridPoint[] = [];
  for (const feature of data.features) {
    if (feature.geometry.type === "Point") {
      const [lon, lat] = feature.geometry.coordinates as number[];
      stations.push({ lat, lon });
    }
  }

  console.log(`  Metro: ${stations.length} stations`);
  return stations;
}

function loadCafes(filePath: string): POI[] {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`  Warning: ${path.basename(filePath)} not found`);
      return [];
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const records = parse(content, { columns: true, skip_empty_lines: true }) as CafeRecord[];

    const pois: POI[] = [];
    for (const record of records) {
      const lat = parseFloat(record.latitude);
      const lon = parseFloat(record.longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        pois.push({ lat, lon, type: "cafe" });
      }
    }

    console.log(`  Cafes: ${pois.length}`);
    return pois;
  } catch {
    console.log(`  Warning: Could not load cafes`);
    return [];
  }
}

function loadGyms(filePath: string): POI[] {
  try {
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, "utf-8");
    const records = parse(content, { columns: true, skip_empty_lines: true }) as GymRecord[];

    const pois: POI[] = [];
    for (const record of records) {
      const lat = parseFloat(record.lat);
      const lon = parseFloat(record.lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        pois.push({ lat, lon, type: "gym" });
      }
    }

    console.log(`  Gyms: ${pois.length}`);
    return pois;
  } catch {
    return [];
  }
}

function loadTrafficData(filePath: string): TrafficSensor[] {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`  Warning: ${path.basename(filePath)} not found`);
      return [];
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const records = parse(content, { columns: true, skip_empty_lines: true }) as TrafficRecord[];

    // Aggregate by location (find peak hour)
    const locationMap = new Map<string, { lat: number; lon: number; maxCount: number }>();

    for (const record of records) {
      // Parse lat/lon (handle weird formatting like "40.430.469")
      const latStr = record.latitude?.replace(/\./g, (m: string, i: number, s: string) =>
        i === s.indexOf('.') ? '.' : '') ?? '';
      const lonStr = record.longitude?.replace(/\./g, (m: string, i: number, s: string) =>
        i === s.indexOf('.') ? '.' : '') ?? '';

      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);

      // Parse count (handle comma-formatted numbers)
      const countStr = record.avg_count?.replace(/,/g, '') ?? '0';
      const count = parseFloat(countStr) || 0;

      if (isNaN(lat) || isNaN(lon)) continue;

      const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
      const existing = locationMap.get(key);

      if (!existing || count > existing.maxCount) {
        locationMap.set(key, { lat, lon, maxCount: count });
      }
    }

    const sensors: TrafficSensor[] = Array.from(locationMap.values()).map(l => ({
      lat: l.lat,
      lon: l.lon,
      count: l.maxCount,
    }));

    console.log(`  Traffic: ${sensors.length} sensors`);
    return sensors;
  } catch {
    console.log(`  Warning: Could not load traffic data`);
    return [];
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("=".repeat(50));
  console.log("  Gravity Score Pre-Calculation");
  console.log("=".repeat(50));

  // Get city from command line
  const cityId = process.argv[2] || "madrid";
  const city = getCity(cityId);

  if (!city) {
    console.error(`\nUnknown city: ${cityId}`);
    console.error(`Available: ${getCityIds().join(", ")}`);
    process.exit(1);
  }

  console.log(`\nCity: ${city.name}`);
  logParams(); // Log weights, beta, resolution from config

  // Load data
  console.log("\nLoading data...");
  const dataDir = path.join(__dirname, "../../public/data");

  const populationData = loadGeoJSON(path.join(dataDir, "barrios_with_density.geojson"));
  const incomeData = loadGeoJSON(path.join(dataDir, "madrid_income_2023.geojson"));
  const metroStations = loadMetroStations(path.join(dataDir, "metro.geojson"));
  const cafes = loadCafes(path.join(dataDir, "cafe_info.csv"));
  const gyms = loadGyms(path.join(dataDir, `gyms_${cityId}.csv`));
  const trafficData = loadTrafficData(path.join(dataDir, "footfall_data.csv"));

  const pois = [...cafes, ...gyms];

  // Add metro as POIs too
  for (const station of metroStations) {
    pois.push({ ...station, type: "metro" });
  }

  console.log(`  Total POIs: ${pois.length}`);

  if (populationData) {
    console.log(`  Population zones: ${populationData.features.length}`);
  }
  if (incomeData) {
    console.log(`  Income zones: ${incomeData.features.length}`);
  }

  // Generate grid
  console.log("\nGenerating grid...");
  const grid = generateGrid(city.bounds, RESOLUTION);

  // Pre-compute cosLat for fast distance calculations
  const avgLat = (city.bounds.north + city.bounds.south) / 2;
  const cosLat = Math.cos(avgLat * Math.PI / 180);

  // Calculate scores
  console.log("\nCalculating scores...");
  const startTime = Date.now();

  const features: GeoJSONFeature[] = [];
  let minScore = 1;
  let maxScore = 0;

  for (let i = 0; i < grid.length; i++) {
    const point = grid[i];
    const score = calculateGravityScore(point, {
      populationData,
      incomeData,
      metroStations,
      trafficData,
      pois,
    }, cosLat);

    minScore = Math.min(minScore, score);
    maxScore = Math.max(maxScore, score);

    features.push({
      type: "Feature",
      properties: { score },
      geometry: {
        type: "Point",
        coordinates: [point.lon, point.lat],
      },
    });

    // Progress indicator
    if ((i + 1) % 10000 === 0 || i === grid.length - 1) {
      process.stdout.write(`\r  ${i + 1}/${grid.length} points (${Math.round((i + 1) / grid.length * 100)}%)`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  Done in ${elapsed}s`);
  console.log(`  Score range: ${minScore.toFixed(3)} - ${maxScore.toFixed(3)}`);

  // Normalize scores to 0-1 range
  console.log("\nNormalizing scores...");
  const range = maxScore - minScore;
  if (range > 0) {
    for (const feature of features) {
      const originalScore = feature.properties.score as number;
      feature.properties.normalizedScore = (originalScore - minScore) / range;
    }
  }

  // Create output with metadata for tracking
  const output: GeoJSONCollection = {
    type: "FeatureCollection",
    features,
    metadata: {
      paramsVersion: params.version,
      cityId,
      resolution: RESOLUTION,
      pointCount: features.length,
      minScore,
      maxScore,
      calculatedAt: new Date().toISOString(),
    },
  };

  // Write file
  const outputPath = path.join(dataDir, `gravity_${cityId}.geojson`);
  console.log(`\nWriting to ${path.basename(outputPath)}...`);
  fs.writeFileSync(outputPath, JSON.stringify(output));

  const fileSizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
  console.log(`  ${features.length} points, ${fileSizeMB}MB`);

  console.log("\nDone!");
}

main().catch((error) => {
  console.error("\nError:", error.message);
  process.exit(1);
});

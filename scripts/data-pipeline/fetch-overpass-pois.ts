#!/usr/bin/env npx ts-node

// Fetches Prague POI data from OpenStreetMap's free Overpass API.
// No API key needed.
//
// Outputs:
//   public/data/osm_pois_prague.csv   - train stations, universities, shopping centers, dorms
//   public/data/metro_prague.geojson  - metro stations (separate, same shape as madrid metro.geojson)
//
// Usage: npm run fetch:osm-pois

import * as fs from "fs";
import * as path from "path";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Prague greater area bounding box (south, west, north, east)
const BBOX = "49.94,14.22,50.18,14.71";

const QUERY = `
[out:json][timeout:60];
(
  node["railway"="station"]["station"="subway"](${BBOX});
  node["railway"="station"]["train"="yes"](${BBOX});
  way["railway"="station"]["train"="yes"](${BBOX});
  node["amenity"="university"](${BBOX});
  way["amenity"="university"](${BBOX});
  relation["amenity"="university"](${BBOX});
  node["shop"="mall"](${BBOX});
  way["shop"="mall"](${BBOX});
  node["building"="dormitory"](${BBOX});
  way["building"="dormitory"](${BBOX});
);
out center;
`;

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface CsvRow {
  category: string;
  name: string;
  lat: number;
  lon: number;
  address: string;
  mapsUrl: string;
}

interface GeoJsonFeature {
  type: "Feature";
  properties: Record<string, string>;
  geometry: { type: "Point"; coordinates: [number, number] };
  id: string;
}

function getCoords(el: OverpassElement): { lat: number; lon: number } | null {
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lon: el.lon };
  if (el.center) return el.center;
  return null;
}

function getName(tags: Record<string, string> | undefined): string {
  if (!tags) return "";
  return tags["name:en"] || tags.name || "";
}

function getAddress(tags: Record<string, string> | undefined): string {
  if (!tags) return "";
  const parts = [tags["addr:street"], tags["addr:housenumber"], tags["addr:city"]].filter(Boolean);
  return parts.join(", ");
}

function googleMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/${lat},${lon}`;
}

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

async function main() {
  console.log("Fetching Prague POIs from Overpass API...");

  const body = `data=${encodeURIComponent(QUERY)}`;
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "MinerScout/1.0 (data pipeline)",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Overpass API returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const elements: OverpassElement[] = data.elements || [];
  console.log(`Got ${elements.length} raw elements from Overpass`);

  const csvRows: CsvRow[] = [];
  const metroFeatures: GeoJsonFeature[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    const coords = getCoords(el);
    if (!coords) continue;
    const tags = el.tags || {};
    const name = getName(tags);

    // Metro stations go to GeoJSON only
    if (tags.station === "subway") {
      const key = `metro:${name || `${coords.lat},${coords.lon}`}`;
      if (!seen.has(key)) {
        seen.add(key);
        metroFeatures.push({
          type: "Feature",
          properties: {
            "@id": `${el.type}/${el.id}`,
            name: name || "Metro Station",
            public_transport: "station",
            railway: "station",
            station: "subway",
            ...(tags.website ? { website: tags.website } : {}),
          },
          geometry: {
            type: "Point",
            coordinates: [coords.lon, coords.lat],
          },
          id: `${el.type}/${el.id}`,
        });
      }
    }

    // Train stations (a station can be both metro and train, that's fine)
    if (tags.railway === "station" && tags.train === "yes" && name) {
      const key = `train:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        csvRows.push({
          category: "Train Station",
          name,
          lat: coords.lat,
          lon: coords.lon,
          address: getAddress(tags),
          mapsUrl: googleMapsUrl(coords.lat, coords.lon),
        });
      }
    }

    // Universities
    if (tags.amenity === "university" && name) {
      const key = `uni:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        csvRows.push({
          category: "University",
          name,
          lat: coords.lat,
          lon: coords.lon,
          address: getAddress(tags),
          mapsUrl: googleMapsUrl(coords.lat, coords.lon),
        });
      }
    }

    // Shopping centers and department stores
    if (tags.shop === "mall" && name) {
      const key = `shop:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        csvRows.push({
          category: "Shopping Center",
          name,
          lat: coords.lat,
          lon: coords.lon,
          address: getAddress(tags),
          mapsUrl: googleMapsUrl(coords.lat, coords.lon),
        });
      }
    }

    // Student dormitories
    if (tags.building === "dormitory" && name) {
      const key = `dorm:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        csvRows.push({
          category: "Student Dormitory",
          name,
          lat: coords.lat,
          lon: coords.lon,
          address: getAddress(tags),
          mapsUrl: googleMapsUrl(coords.lat, coords.lon),
        });
      }
    }
  }

  // Write CSV (same format as Madrid's other.csv)
  const outDir = path.join(__dirname, "../../public/data");
  const csvHeader = "Category,Name,Lat,Lon,Address,MapsURL,Status";
  const csvLines = csvRows.map(r =>
    [r.category, escapeCsv(r.name), r.lat, r.lon, escapeCsv(r.address), escapeCsv(r.mapsUrl), ""].join(",")
  );
  const csvPath = path.join(outDir, "osm_pois_prague.csv");
  fs.writeFileSync(csvPath, [csvHeader, ...csvLines].join("\n") + "\n");
  console.log(`Wrote ${csvRows.length} POIs to osm_pois_prague.csv`);

  // Write GeoJSON (same shape as Madrid's metro.geojson)
  const geojson = {
    type: "FeatureCollection",
    generator: "fetch-overpass-pois.ts",
    copyright: "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
    timestamp: new Date().toISOString(),
    features: metroFeatures,
  };
  const geojsonPath = path.join(outDir, "metro_prague.geojson");
  fs.writeFileSync(geojsonPath, JSON.stringify(geojson, null, 2) + "\n");
  console.log(`Wrote ${metroFeatures.length} metro stations to metro_prague.geojson`);

  // Print summary
  const counts = new Map<string, number>();
  for (const r of csvRows) {
    counts.set(r.category, (counts.get(r.category) || 0) + 1);
  }
  console.log("\nSummary:");
  console.log(`  Metro stations: ${metroFeatures.length} (GeoJSON)`);
  for (const [cat, count] of counts) {
    console.log(`  ${cat}: ${count} (CSV)`);
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";

// Convert 12-hour format ("1:00:00 PM") to 24-hour number (13)
function to24Hour(horaString: string): number {
  const hour = parseInt(horaString.split(":")[0]);
  const isPM = horaString.toUpperCase().includes("PM");
  const isAM = horaString.toUpperCase().includes("AM");

  if (isPM && hour !== 12) return hour + 12;  // 1 PM = 13, 11 PM = 23
  if (isAM && hour === 12) return 0;          // 12 AM = 0 (midnight)
  return hour;                                 // 12 PM = 12, 1-11 AM = 1-11
}

// Fix coordinate formatting: keep only first dot, remove subsequent ones
function fixCoordinate(coord: string): number {
  if (!coord) return NaN;
  let dotCount = 0;
  const fixed = coord.replace(/\./g, () => {
    dotCount++;
    return dotCount === 1 ? "." : "";
  });
  return parseFloat(fixed);
}

// Clean number strings with commas (e.g., "1,021.26" -> 1021.26)
function parseCount(value: string | undefined): number {
  const clean = value?.toString().replace(/,/g, "") || "0";
  return parseFloat(clean) || 0;
}

// Helper to get the base URL for fetching public files
function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hour = searchParams.get("hour");
    const grouped = searchParams.get("grouped") === "true";

    // Fetch from public folder instead of filesystem
    const baseUrl = getBaseUrl(request);
    const response = await fetch(`${baseUrl}/data/footfall_data.csv`);

    if (!response.ok) {
      return NextResponse.json(
        { type: "FeatureCollection", features: [] },
        { status: 200 }
      );
    }

    const fileContent = await response.text();
    const { data } = Papa.parse(fileContent, { header: true });

    // Filter out invalid rows
    const validRows = (data as any[]).filter((row) => row.hora);

    // GROUPED MODE: Return locations with all 24 hours of data
    if (grouped) {
      const locationMap = new Map<string, {
        distrito: string;
        direccion: string;
        lat: number;
        lon: number;
        hourly: number[]; // Array of 24 values (index = hour)
      }>();

      for (const row of validRows) {
        const lat = fixCoordinate(row.latitude);
        const lon = fixCoordinate(row.longitude);
        if (isNaN(lat) || isNaN(lon)) continue;

        const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
        const rowHour = to24Hour(row.hora);
        const count = parseCount(row.avg_count);

        if (!locationMap.has(key)) {
          locationMap.set(key, {
            distrito: row.distrito,
            direccion: row.direccion,
            lat,
            lon,
            hourly: new Array(24).fill(0),
          });
        }

        const loc = locationMap.get(key)!;
        loc.hourly[rowHour] = count;
      }

      const locations = Array.from(locationMap.values());

      return NextResponse.json(
        { locations },
        {
          headers: {
            "Cache-Control": "public, max-age=3600",
            "Content-Type": "application/json",
          },
        }
      );
    }

    // STANDARD MODE: Return GeoJSON filtered by hour
    const features = validRows
      .filter((row: any) => {
        if (!hour) return true;
        const rowHour = to24Hour(row.hora);
        const targetHour = parseInt(hour);
        return rowHour === targetHour;
      })
      .map((row: any) => ({
        type: "Feature",
        properties: {
          hora: row.hora,
          distrito: row.distrito,
          direccion: row.direccion,
          avg_count: parseCount(row.avg_count),
        },
        geometry: {
          type: "Point",
          coordinates: [fixCoordinate(row.longitude), fixCoordinate(row.latitude)],
        },
      }))
      .filter(
        (f: any) =>
          !isNaN(f.geometry.coordinates[0]) && !isNaN(f.geometry.coordinates[1])
      );

    return NextResponse.json(
      { type: "FeatureCollection", features },
      {
        headers: {
          // No cache to ensure fresh data after fixes
          "Cache-Control": "no-store, must-revalidate",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error loading traffic data:", error);
    return NextResponse.json(
      { type: "FeatureCollection", features: [] },
      { status: 200 }
    );
  }
}

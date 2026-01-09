import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Papa from "papaparse";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hour = searchParams.get("hour");

    const filePath = path.join(process.cwd(), "footfall_data.csv");
    const fileContent = fs.readFileSync(filePath, "utf-8");

    const { data } = Papa.parse(fileContent, { header: true });

    // Fix malformed coordinates (e.g., "40.430.469" -> "40.430469") and filter by hour if specified
    const features = data
      .filter((row: any) => {
        if (!row.hora) return false;
        if (!hour) return true;
        // Match hour from "12:00:00 PM" format
        const rowHour = parseInt(row.hora.split(":")[0]);
        const targetHour = parseInt(hour);
        return rowHour === targetHour || (rowHour === 12 && targetHour === 0 && row.hora.includes("AM"));
      })
      .map((row: any) => {
        // Fix coordinate formatting: keep only first dot, remove subsequent ones
        const fixCoordinate = (coord: string) => {
          if (!coord) return NaN;
          let dotCount = 0;
          const fixed = coord.replace(/\./g, (match) => {
            dotCount++;
            return dotCount === 1 ? "." : "";
          });
          return parseFloat(fixed);
        };

        return {
          type: "Feature",
          properties: {
            hora: row.hora,
            distrito: row.distrito,
            direccion: row.direccion,
            avg_count: parseFloat(row.avg_count) || 0,
          },
          geometry: {
            type: "Point",
            coordinates: [
              fixCoordinate(row.longitude),
              fixCoordinate(row.latitude),
            ],
          },
        };
      })
      .filter(
        (f: any) =>
          !isNaN(f.geometry.coordinates[0]) && !isNaN(f.geometry.coordinates[1])
      );

    return NextResponse.json(
      {
        type: "FeatureCollection",
        features,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600", // 1 hour cache
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

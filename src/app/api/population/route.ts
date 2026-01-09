import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "barrios_with_density.geojson");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const geojson = JSON.parse(fileContent);

    return NextResponse.json(geojson, {
      headers: {
        "Cache-Control": "public, max-age=86400", // 24 hour cache (static data)
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error loading population data:", error);
    return NextResponse.json(
      { type: "FeatureCollection", features: [] },
      { status: 200 }
    );
  }
}

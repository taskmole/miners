import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Prevent static generation - this route needs to run at request time
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Read directly from filesystem (secure — no Host header dependency)
    const filePath = path.join(process.cwd(), "public", "data", "madrid_income_2023.geojson");

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { type: "FeatureCollection", features: [] },
        { status: 200 }
      );
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const geojson = JSON.parse(fileContent);

    return NextResponse.json(geojson, {
      headers: {
        "Cache-Control": "public, max-age=86400", // 24 hour cache (static data)
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error loading income data:", error);
    return NextResponse.json(
      { type: "FeatureCollection", features: [] },
      { status: 200 }
    );
  }
}

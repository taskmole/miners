import { NextRequest, NextResponse } from "next/server";

// Helper to get the base URL for fetching public files
function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function GET(request: NextRequest) {
  try {
    // Fetch from public folder instead of filesystem
    const baseUrl = getBaseUrl(request);
    const response = await fetch(`${baseUrl}/data/madrid_income_2023.geojson`);

    if (!response.ok) {
      return NextResponse.json(
        { type: "FeatureCollection", features: [] },
        { status: 200 }
      );
    }

    const geojson = await response.json();

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

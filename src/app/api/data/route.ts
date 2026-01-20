import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "cafes";

    try {
        let fileName = "";
        let delimiter = ",";

        if (type === "cafes") fileName = "cafe_info.csv";
        else if (type === "properties") fileName = "idealista.csv";
        else if (type === "data") {
            fileName = "data.csv";
            delimiter = ";"; // data.csv uses semicolon delimiter
        }
        else if (type === "other") fileName = "other.csv";
        else if (type === "barcelona_cafes") fileName = "barcelona_cafe_info.csv";
        else if (type === "metro") {
            // Handle GeoJSON file for metro stations
            const baseUrl = getBaseUrl(request);
            const response = await fetch(`${baseUrl}/data/metro.geojson`);
            if (!response.ok) {
                return NextResponse.json({ error: "Metro data not found" }, { status: 404 });
            }
            const geojson = await response.json();
            return NextResponse.json(geojson);
        }

        if (!fileName) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

        // Fetch from public folder instead of filesystem
        const baseUrl = getBaseUrl(request);
        const response = await fetch(`${baseUrl}/data/${fileName}`);

        if (!response.ok) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const fileContent = await response.text();
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            delimiter,
            relax_column_count: true,
        });

        return NextResponse.json(records);
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// Helper to get the base URL for fetching public files
function getBaseUrl(request: NextRequest): string {
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    return `${protocol}://${host}`;
}

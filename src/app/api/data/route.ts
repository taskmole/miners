import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";

// Prevent static generation - this route needs to run at request time
export const dynamic = "force-dynamic";

// Allowed file types (whitelist for security)
const FILE_MAP: Record<string, { fileName: string; delimiter?: string }> = {
    cafes: { fileName: "cafe_info.csv" },
    properties: { fileName: "idealista.csv" },
    data: { fileName: "data.csv", delimiter: ";" },
    other: { fileName: "other.csv" },
    barcelona_cafes: { fileName: "barcelona_cafe_info.csv" },
    google_cafes: { fileName: "google_places_cafes.csv" },
    google_madrid: { fileName: "google_places_madrid.csv" },
    google_barcelona: { fileName: "google_places_barcelona.csv" },
    google_prague: { fileName: "google_places_prague.csv" },
    google_enrichment: { fileName: "google_places_enrichment.csv" },
    gyms_madrid: { fileName: "gyms_madrid.csv" },
    gyms_barcelona: { fileName: "gyms_barcelona.csv" },
    gyms_prague: { fileName: "gyms_prague.csv" },
};

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "cafes";

    try {
        // Handle GeoJSON file for metro stations
        if (type === "metro") {
            const filePath = path.join(process.cwd(), "public", "data", "metro.geojson");
            if (!fs.existsSync(filePath)) {
                return NextResponse.json({ error: "Metro data not found" }, { status: 404 });
            }
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const geojson = JSON.parse(fileContent);
            return NextResponse.json(geojson);
        }

        // Check if type is in our whitelist
        const fileConfig = FILE_MAP[type];
        if (!fileConfig) {
            return NextResponse.json({ error: "Invalid type" }, { status: 400 });
        }

        // Read file directly from filesystem (more secure than self-fetch)
        const filePath = path.join(process.cwd(), "public", "data", fileConfig.fileName);

        if (!fs.existsSync(filePath)) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const fileContent = fs.readFileSync(filePath, "utf-8");
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            delimiter: fileConfig.delimiter || ",",
            relax_column_count: true,
        });

        return NextResponse.json(records);
    } catch (error) {
        // Log detailed error server-side
        console.error("API Error:", error);
        // Return sanitized error to client (no stack traces)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

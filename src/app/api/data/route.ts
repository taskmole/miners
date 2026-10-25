import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import { authenticateAlongside, mayViewCity } from "@/lib/supabase-server";

// Prevent static generation - this route needs to run at request time
export const dynamic = "force-dynamic";

/**
 * Flat map data: cafes, gyms, POIs, metro, read straight off disk.
 *
 * This route had no authentication of any kind. It served 15 CSV files of
 * cafe, gym and POI data per city to anyone who knew the URL, and those files
 * are the bulk of what the map draws. Restricting the `places` table without
 * touching this would have been cosmetic.
 *
 * A CSV file has no rows a policy can filter, so the check has to happen here,
 * at the route: the caller must be signed in AND hold at least View in the
 * city the file belongs to.
 */

/**
 * Allowed file types, each tagged with the city it belongs to.
 *
 * The city is not decoration. It is the thing being checked, so a file whose
 * city is guessed wrong is either a leak or a blank map. The ones that read
 * oddly are the Madrid originals, which were named before the product had
 * more than one city: `cafes`, `data`, `other`, `google_cafes` and
 * `google_enrichment` are all Madrid.
 */
const FILE_MAP: Record<string, { fileName: string; delimiter?: string; city: string }> = {
    cafes: { fileName: "cafe_info.csv", city: "madrid" },
    data: { fileName: "data.csv", delimiter: ";", city: "madrid" },
    other: { fileName: "other.csv", city: "madrid" },
    barcelona_cafes: { fileName: "barcelona_cafe_info.csv", city: "barcelona" },
    google_cafes: { fileName: "google_places_cafes.csv", city: "madrid" },
    google_madrid: { fileName: "google_places_madrid.csv", city: "madrid" },
    google_barcelona: { fileName: "google_places_barcelona.csv", city: "barcelona" },
    google_prague: { fileName: "google_places_prague.csv", city: "prague" },
    google_enrichment: { fileName: "google_places_enrichment.csv", city: "madrid" },
    gyms_madrid: { fileName: "gyms_madrid.csv", city: "madrid" },
    gyms_barcelona: { fileName: "gyms_barcelona.csv", city: "barcelona" },
    gyms_prague: { fileName: "gyms_prague.csv", city: "prague" },
    prague_cafes: { fileName: "prague_cafe_info.csv", city: "prague" },
    google_enrichment_prague: { fileName: "google_places_enrichment_prague.csv", city: "prague" },
    osm_pois_prague: { fileName: "osm_pois_prague.csv", city: "prague" },
};


export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "cafes";

    // The city whose grant this file needs, or null for a request that is
    // malformed (unknown type, gravity without a city). Worked out up front so
    // the grant check can run alongside the sign-in check; the 400 for a
    // malformed request is still only given to someone who is signed in.
    const city = type === "gravity"
        ? searchParams.get("city")
        : type === "metro"
            ? (searchParams.get("city") === "prague" ? "prague" : "madrid")
            : FILE_MAP[type]?.city ?? null;

    try {
        const auth = await authenticateAlongside(request, async (supabase) =>
            city ? mayViewCity(supabase, city) : null);
        if (auth.error) return auth.error;
        const mayView = auth.result;

        // The gravity score layer. It used to be fetched straight from
        // /data/gravity_<city>.geojson, which meant it stayed world-readable
        // after everything around it was locked down: location scores for a
        // whole city, to anyone with the URL.
        if (type === "gravity") {
            if (!city) {
                return NextResponse.json({ error: "city required" }, { status: 400 });
            }
            if (!mayView) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            // The city is checked against the grants above, but it also lands
            // in a file path, so it is constrained to the known ids as well.
            if (!/^[a-z_]+$/.test(city)) {
                return NextResponse.json({ error: "Invalid city" }, { status: 400 });
            }
            const filePath = path.join(process.cwd(), "public", "data", `gravity_${city}.geojson`);
            if (!fs.existsSync(filePath)) {
                return NextResponse.json({ error: "No scores for this city" }, { status: 404 });
            }
            return NextResponse.json(JSON.parse(fs.readFileSync(filePath, "utf-8")), {
                headers: { "Cache-Control": "private, max-age=300" },
            });
        }

        // Metro is a GeoJSON file rather than a CSV, and its city comes from a
        // separate parameter. Same rule applies.
        if (type === "metro") {
            if (!mayView) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            const fileName = city === "prague" ? "metro_prague.geojson" : "metro.geojson";
            const filePath = path.join(process.cwd(), "public", "data", fileName);
            if (!fs.existsSync(filePath)) {
                return NextResponse.json({ error: "Metro data not found" }, { status: 404 });
            }
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const geojson = JSON.parse(fileContent);
            return NextResponse.json(geojson, {
                headers: { "Cache-Control": "private, max-age=300" },
            });
        }

        // Check if type is in our whitelist
        const fileConfig = FILE_MAP[type];
        if (!fileConfig) {
            return NextResponse.json({ error: "Invalid type" }, { status: 400 });
        }

        if (!mayView) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

        // Private, never public: the answer depends on who is asking.
        return NextResponse.json(records, {
            headers: { "Cache-Control": "private, max-age=300" },
        });
    } catch (error) {
        // Log detailed error server-side
        console.error("API Error:", error);
        // Return sanitized error to client (no stack traces)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

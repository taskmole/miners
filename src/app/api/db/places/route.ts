import { NextRequest, NextResponse } from "next/server";
import { createPublicServerSupabase } from "@/lib/supabase-server";
import { parseWkbPoint } from "@/lib/wkb";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const cityId = request.nextUrl.searchParams.get("city_id");
    if (!cityId) {
        return NextResponse.json({ error: "city_id required" }, { status: 400 });
    }

    try {
        const supabase = createPublicServerSupabase();
        const { data, error } = await supabase
            .from("places")
            .select("name, address, location, source, metadata, photos, updated_at, created_at")
            .eq("city_id", cityId)
            .in("source", ["idealista", "idealista_transfer", "sreality"])
            .eq("status", "active");

        if (error) {
            console.error("[api/db/places] query error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const properties = (data || [])
            .map((p: any) => {
                const coords = parseWkbPoint(p.location);
                if (!coords) return null;
                const meta = (p.metadata || {}) as Record<string, any>;
                return {
                    name: p.name || "Property",
                    address: p.address || "",
                    latitude: coords.lat,
                    longitude: coords.lon,
                    source: p.source === "sreality" ? "sreality" : "idealista",
                    price: meta.price || 0,
                    size: meta.size || 0,
                    priceByArea: meta.priceByArea || meta.pricePerSqm || 0,
                    district: meta.district || "",
                    hasAirConditioning: meta.hasAirConditioning === true,
                    url: meta.url || "",
                    transfer: meta.transfer || undefined,
                    hasBathroom: meta.bathrooms != null && meta.bathrooms > 0,
                    hasStorefront: meta.hasStorefront === true,
                    image_url: p.photos?.[0] || undefined,
                    priceHistory: meta.price_history || undefined,
                    createdAt: p.created_at || undefined,
                    updatedAt: p.updated_at || undefined,
                    photos: p.photos?.length ? p.photos : undefined,
                };
            })
            .filter(Boolean);

        return NextResponse.json(properties, {
            headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
        });
    } catch (err) {
        console.error("[api/db/places] unexpected error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

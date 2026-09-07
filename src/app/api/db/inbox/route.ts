import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase-server";
import { parseWkbPoint } from "@/lib/wkb";
import { generatePropertyPlaceId } from "@/lib/place-id";

export const dynamic = "force-dynamic";

const PROPERTY_SOURCES = ["idealista", "idealista_transfer", "sreality"];

export async function GET(request: NextRequest) {
  const cityId = request.nextUrl.searchParams.get("city_id");
  if (!cityId) {
    return NextResponse.json({ error: "city_id required" }, { status: 400 });
  }

  const mode = request.nextUrl.searchParams.get("mode");

  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    // Find the latest scrape batch: anchor on most recent insert, look back 12h
    const { data: anchor } = await supabase
      .from("places")
      .select("created_at")
      .eq("city_id", cityId)
      .in("source", PROPERTY_SOURCES)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!anchor) {
      return NextResponse.json(mode === "count" ? { count: 0 } : []);
    }

    const cutoff = new Date(anchor.created_at);
    cutoff.setHours(cutoff.getHours() - 12);

    if (mode === "count") {
      // Get the latest batch. Select location so we count only places that
      // would actually render (the list drops rows with unparseable coords).
      const { data: batch, error: batchError } = await supabase
        .from("places")
        .select("id, location")
        .eq("city_id", cityId)
        .in("source", PROPERTY_SOURCES)
        .eq("status", "active")
        .gte("created_at", cutoff.toISOString());

      if (batchError) {
        return NextResponse.json({ error: batchError.message }, { status: 500 });
      }

      const batchIds = (batch || [])
        .filter((p: any) => parseWkbPoint(p.location) !== null)
        .map((p: any) => p.id);
      if (batchIds.length === 0) return NextResponse.json({ count: 0 });

      // Count how many of THOSE the user has already marked read
      const { count: readCount } = await supabase
        .from("inbox_reads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("place_id", batchIds);

      const unread = Math.max(0, batchIds.length - (readCount || 0));
      return NextResponse.json({ count: unread });
    }

    const { data: places, error: placesError } = await supabase
      .from("places")
      .select("id, name, address, location, source, metadata, photos, score, image_analysis, created_at")
      .eq("city_id", cityId)
      .in("source", PROPERTY_SOURCES)
      .eq("status", "active")
      .gte("created_at", cutoff.toISOString())
      .order("created_at", { ascending: false });

    if (placesError) {
      console.error("[api/db/inbox] places query error:", placesError);
      return NextResponse.json({ error: placesError.message }, { status: 500 });
    }

    if (!places || places.length === 0) {
      return NextResponse.json([]);
    }

    const placeIds = places.map((p: any) => p.id);
    const { data: reads } = await supabase
      .from("inbox_reads")
      .select("place_id")
      .eq("user_id", userId)
      .in("place_id", placeIds);

    const readSet = new Set((reads || []).map((r: any) => r.place_id));

    const unread = places
      .filter((p: any) => !readSet.has(p.id))
      .map((p: any) => {
        const coords = parseWkbPoint(p.location);
        if (!coords) return null;
        const meta = (p.metadata || {}) as Record<string, any>;
        const placeId = generatePropertyPlaceId({
          latitude: coords.lat,
          longitude: coords.lon,
          url: meta.url || "",
        });
        return {
          id: p.id,
          placeId,
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
          photos: p.photos?.length ? p.photos : undefined,
          score: p.score != null ? Number(p.score) : undefined,
          aiScore: (p.image_analysis as any)?.text?.qualitative_score ?? undefined,
          aiReason: (p.image_analysis as any)?.text?.reason ?? undefined,
          createdAt: p.created_at || undefined,
        };
      })
      .filter(Boolean);

    return NextResponse.json(unread);
  } catch (err) {
    console.error("[api/db/inbox] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();
    const { action, place_ids, city_id } = body;

    if (!action || !place_ids || !Array.isArray(place_ids) || place_ids.length === 0) {
      return NextResponse.json(
        { error: "action and place_ids[] required" },
        { status: 400 },
      );
    }

    if (action === "mark_read" || action === "mark_all_read") {
      const rows = place_ids.map((placeId: string) => ({
        user_id: userId,
        place_id: placeId,
        city_id: city_id || "unknown",
      }));

      const { error } = await supabase.from("inbox_reads").upsert(rows, {
        onConflict: "user_id,place_id",
        ignoreDuplicates: true,
      });

      if (error) {
        console.error("[api/db/inbox] mark_read error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, count: place_ids.length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/db/inbox] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";
import { parseWkbPoint } from "@/lib/wkb";

export const dynamic = "force-dynamic";


// GET: fetch all Miners places joined with their cafe_profiles
export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerSupabase(token);

    // Fetch user role for revenue filtering
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Whether somebody may see money is the per-city financials tick now, not
    // a role. Asked of the database so this route and the row policies cannot
    // drift into disagreeing, and so a failed check means no revenue rather
    // than all of it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: financeOk } = await (supabase.rpc as any)("is_finance_plus");
    const showRevenue = financeOk === true;

    // Fetch all Miners places with their cafe profiles
    const { data: places, error: placesError } = await supabase
      .from("places")
      .select("id, name, address, location, city_id, source_id, metadata")
      .eq("source", "miners")
      .eq("status", "active")
      .order("city_id")
      .order("name");

    if (placesError) {
      console.error("[api/db/cafe-profiles] places query error:", placesError);
      return NextResponse.json({ error: placesError.message }, { status: 500 });
    }

    const placeIds = (places || []).map((p: Record<string, unknown>) => p.id as string);

    // Fetch cafe profiles for these places
    let profiles: Record<string, Record<string, unknown>> = {};
    if (placeIds.length > 0) {
      const { data: profileData, error: profileError } = await supabase
        .from("cafe_profiles")
        .select("*")
        .in("place_id", placeIds);

      if (profileError) {
        console.error("[api/db/cafe-profiles] profiles query error:", profileError);
      } else {
        for (const p of (profileData || []) as Record<string, unknown>[]) {
          profiles[p.place_id as string] = p;
        }
      }
    }

    // Combine places with their profiles
    const result = (places || []).map((place: Record<string, unknown>) => {
      const coords = parseWkbPoint(place.location as string);
      const profile = profiles[place.id as string];

      const meta = (place.metadata || {}) as Record<string, unknown>;
      const entry: Record<string, unknown> = {
        placeId: place.id,
        name: place.name,
        address: place.address,
        cityId: place.city_id,
        sourceId: place.source_id,
        latitude: coords?.lat || 0,
        longitude: coords?.lon || 0,
        euctLink: meta.euct_link || undefined,
        website: meta.website || undefined,
        instagram: meta.instagram || undefined,
        googleRating: meta.google_rating != null ? Number(meta.google_rating) : undefined,
        googleReviewCount: meta.google_review_count != null ? Number(meta.google_review_count) : undefined,
        googleMapsUrl: meta.google_maps_url || undefined,
        openingHours: meta.opening_hours || undefined,
      };

      if (profile) {
        entry.profileId = profile.id;
        entry.category = profile.category;
        entry.interiorSeats = profile.interior_seats;
        entry.exteriorSeats = profile.exterior_seats;
        entry.areaSqm = profile.area_sqm;
        entry.hasKitchen = profile.has_kitchen;
        entry.notes = profile.notes;
        entry.updatedAt = profile.updated_at;
        // Server-side revenue filtering
        if (showRevenue) {
          entry.monthlyRevenue = profile.monthly_revenue;
        }
      }

      return entry;
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/db/cafe-profiles] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: create or upsert a cafe profile
export async function POST(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = createServerSupabase(token);

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const row = {
      place_id: body.placeId,
      category: body.category,
      interior_seats: body.interiorSeats ?? 0,
      exterior_seats: body.exteriorSeats ?? 0,
      area_sqm: body.areaSqm ?? null,
      monthly_revenue: body.monthlyRevenue ?? null,
      has_kitchen: body.hasKitchen ?? false,
      notes: body.notes ?? null,
      updated_by: user.id,
    };

    const { data, error } = await supabase
      .from("cafe_profiles")
      .upsert(row as any, { onConflict: "place_id" })
      .select()
      .single();

    if (error) {
      console.error("[api/db/cafe-profiles] upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/cafe-profiles] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH: update an existing cafe profile
export async function PATCH(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { profileId, ...fields } = body;

    if (!profileId) {
      return NextResponse.json({ error: "profileId is required" }, { status: 400 });
    }

    const supabase = createServerSupabase(token);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updates: Record<string, unknown> = { updated_by: user.id };
    if (fields.category !== undefined) updates.category = fields.category;
    if (fields.interiorSeats !== undefined) updates.interior_seats = fields.interiorSeats;
    if (fields.exteriorSeats !== undefined) updates.exterior_seats = fields.exteriorSeats;
    if (fields.areaSqm !== undefined) updates.area_sqm = fields.areaSqm;
    if (fields.monthlyRevenue !== undefined) updates.monthly_revenue = fields.monthlyRevenue;
    if (fields.hasKitchen !== undefined) updates.has_kitchen = fields.hasKitchen;
    if (fields.notes !== undefined) updates.notes = fields.notes;

    const { data, error } = await supabase
      .from("cafe_profiles")
      .update(updates as any)
      .eq("id", profileId)
      .select()
      .single();

    if (error) {
      console.error("[api/db/cafe-profiles] update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/cafe-profiles] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: add a new Miners cafe to the places table
export async function PUT(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, address, cityId, latitude, longitude } = body;

    if (!name || !cityId || !latitude || !longitude) {
      return NextResponse.json({ error: "name, cityId, latitude, longitude are required" }, { status: 400 });
    }

    const supabase = createServerSupabase(token);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("insert_miners_place" as any, {
      p_name: name,
      p_address: address || "",
      p_city_id: cityId,
      p_longitude: parseFloat(longitude),
      p_latitude: parseFloat(latitude),
    });

    if (error) {
      console.error("[api/db/cafe-profiles] insert place error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data });
  } catch (err) {
    console.error("[api/db/cafe-profiles] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE: remove a cafe profile
export async function DELETE(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileId = request.nextUrl.searchParams.get("id");
  if (!profileId) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabase(token);

    const { error } = await supabase
      .from("cafe_profiles")
      .delete()
      .eq("id", profileId);

    if (error) {
      console.error("[api/db/cafe-profiles] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/db/cafe-profiles] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

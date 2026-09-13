import { NextRequest, NextResponse } from "next/server";
import {
  accessFor,
  authenticateRequest,
  createServerSupabase,
  getTokenFromRequest,
  getUserTeamIds,
  untypedDb as db,
} from "@/lib/supabase-server";
import { cities } from "@/lib/cities";
import { canAccessDashboard, canReadCityScouting } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const ALL_CITY_IDS = cities.map((c) => c.id);

/**
 * One row of the "All in city" list. Deliberately thin: no financials, no
 * checklist, no review notes. Thinness is what makes it safe to hand a
 * reviewer somebody else's trip.
 */
export type CityScoutedTrip = {
  id: string;
  status: string;
  cityId: string;
  createdBy: string;
  authorName: string;
  submittedAt: string | null;
  placeId: string | null;
  placeName: string | null;
  /** Where to fly the map. Null when the trip has no linked place. */
  lat: number | null;
  lon: number | null;
};

/**
 * The columns the "All in city" query selects. `property` is a JSONB column
 * holding the linked place, the same shape status-map reads below.
 */
type CityPitchRow = {
  id: string;
  status: string | null;
  city_id: string | null;
  created_by: string | null;
  author_name: string | null;
  submitted_at: string | null;
  property: {
    type?: string;
    id?: string;
    name?: string;
    data?: { latitude?: number; longitude?: number };
  } | null;
};

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") || "user";

  // Status map mode: returns lightweight placeId-to-status mapping for map markers
  if (mode === "status-map") {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({}, { status: 200 });
    }

    try {
      const supabase = createServerSupabase(token);

      const { data, error } = await supabase
        .from("pitches")
        .select("property, status, submitted_at, final_reviewed_at, rejection_notes, return_notes")
        .in("status", ["submitted", "approved", "rejected", "returned"])
        .not("property", "is", null);

      if (error) {
        console.error("[api/db/pitches] status-map query error:", error);
        return NextResponse.json({}, { status: 200 });
      }

      // Build placeId -> { status, date } mapping (highest-priority status wins)
      const statusPriority: Record<string, number> = { draft: 0, returned: 1, submitted: 2, rejected: 3, approved: 4 };
      const statusMap: Record<string, { status: string; date: string | null; rejectionReason: string | null; returnReason: string | null }> = {};

      for (const row of data || []) {
        const prop = row.property as { type?: string; id?: string } | null;
        if (!prop?.id || prop.type !== "place") continue;

        const current = statusMap[prop.id];
        if (!current || (statusPriority[row.status] ?? 0) > (statusPriority[current.status] ?? 0)) {
          const date = row.final_reviewed_at || row.submitted_at || null;
          const rejectionReason = row.status === "rejected" ? (row.rejection_notes as string | null) : null;
          const returnReason = row.status === "returned" ? (row.return_notes as string | null) : null;
          statusMap[prop.id] = { status: row.status, date, rejectionReason, returnReason };
        }
      }

      return NextResponse.json(statusMap);
    } catch (err) {
      console.error("[api/db/pitches] status-map unexpected error:", err);
      return NextResponse.json({}, { status: 200 });
    }
  }

  // Every pitch in one city, for somebody who approves there. Used by the
  // Scouting panel's "All in city" switch. Refuses out loud rather than
  // returning an empty list, so "nothing here" and "not for you" stay
  // distinguishable on screen.
  if (mode === "city") {
    const cityId = request.nextUrl.searchParams.get("city_id");
    if (!cityId) {
      return NextResponse.json({ error: "city_id is required" }, { status: 400 });
    }

    const auth = await authenticateRequest(request);
    if (auth.error) return auth.error;
    const { supabase, userId } = auth;

    try {
      const access = await accessFor(supabase, userId);
      // A failed lookup is not a refusal, so it reports an error rather than
      // quietly looking like a permission problem.
      if (!access) {
        return NextResponse.json(
          { error: "Could not check permissions, please try again." },
          { status: 500 },
        );
      }

      if (!canReadCityScouting(access, cityId, ALL_CITY_IDS)) {
        return NextResponse.json({ canSee: false, trips: [] });
      }

      const { data, error } = await db(supabase)
        .from("pitches")
        .select("id, status, city_id, created_by, author_name, submitted_at, property")
        .eq("city_id", cityId)
        .order("submitted_at", { ascending: false, nullsFirst: false });

      if (error) {
        console.error("[api/db/pitches] city query error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const trips: CityScoutedTrip[] = (data || []).map((row: CityPitchRow) => {
        const prop = row.property;
        const isPlace = prop?.type === "place";
        return {
          id: row.id,
          status: row.status || "draft",
          cityId: row.city_id || cityId,
          createdBy: row.created_by || "",
          authorName: row.author_name || "Scout",
          submittedAt: row.submitted_at ?? null,
          placeId: isPlace ? prop?.id ?? null : null,
          placeName: prop?.name ?? null,
          // Coordinates only, so the map can fly there. Nothing else from the
          // linked property comes across.
          lat: isPlace ? prop?.data?.latitude ?? null : null,
          lon: isPlace ? prop?.data?.longitude ?? null : null,
        };
      });

      return NextResponse.json({ canSee: true, trips });
    } catch (err) {
      console.error("[api/db/pitches] city unexpected error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  // Admin mode: the dashboard's own pitch list. RLS alone is not enough here,
  // because the pitches SELECT policy also passes anyone holding View on a
  // city, so the dashboard check has to be made explicitly.
  if (mode === "admin") {
    const auth = await authenticateRequest(request);
    if (auth.error) return auth.error;
    const { supabase, userId: callerId } = auth;

    try {
      const access = await accessFor(supabase, callerId);
      if (!access) {
        return NextResponse.json(
          { error: "Could not check permissions, please try again." },
          { status: 500 },
        );
      }
      if (!canAccessDashboard(access)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const userId = request.nextUrl.searchParams.get("user_id");

      let query = supabase
        .from("pitches")
        .select("*");

      if (userId) {
        query = query.eq("created_by", userId);
      } else {
        query = query.in("status", ["submitted", "approved", "rejected", "returned"]);
      }

      const { data, error } = await query
        .order("submitted_at", { ascending: false, nullsLast: true });

      if (error) {
        console.error("[api/db/pitches] admin query error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data || []);
    } catch (err) {
      console.error("[api/db/pitches] unexpected error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  // User mode: fetch pitches created by the authenticated user + team pitches
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const teamIds = await getUserTeamIds(supabase, userId);

    let pitchQuery = supabase.from("pitches").select("*");

    if (teamIds.length > 0) {
      pitchQuery = pitchQuery.or(`created_by.eq.${userId},team_id.in.(${teamIds.join(",")})`);
    } else {
      pitchQuery = pitchQuery.eq("created_by", userId);
    }

    const { data, error } = await pitchQuery;

    if (error) {
      console.error("[api/db/pitches] user query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("[api/db/pitches] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const supabase = createServerSupabase(token);

    const { data, error } = await supabase
      .from("pitches")
      .upsert(body, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("[api/db/pitches] upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/pitches] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = createServerSupabase(token);

    const { data, error } = await supabase
      .from("pitches")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[api/db/pitches] update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/pitches] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pitchId = request.nextUrl.searchParams.get("id");
  if (!pitchId) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabase(token);

    const { error } = await supabase
      .from("pitches")
      .delete()
      .eq("id", pitchId);

    if (error) {
      console.error("[api/db/pitches] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/db/pitches] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

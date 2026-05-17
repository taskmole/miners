import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

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
        .select("property, status, submitted_at, final_reviewed_at, rejection_notes")
        .in("status", ["submitted", "approved", "rejected"])
        .not("property", "is", null);

      if (error) {
        console.error("[api/db/pitches] status-map query error:", error);
        return NextResponse.json({}, { status: 200 });
      }

      // Build placeId -> { status, date } mapping (highest-priority status wins)
      const statusPriority: Record<string, number> = { draft: 0, submitted: 1, rejected: 2, approved: 3 };
      const statusMap: Record<string, { status: string; date: string | null; rejectionReason: string | null }> = {};

      for (const row of data || []) {
        const prop = row.property as { type?: string; id?: string } | null;
        if (!prop?.id || prop.type !== "place") continue;

        const current = statusMap[prop.id];
        if (!current || (statusPriority[row.status] ?? 0) > (statusPriority[current.status] ?? 0)) {
          const date = row.final_reviewed_at || row.submitted_at || null;
          const rejectionReason = row.status === "rejected" ? (row.rejection_notes as string | null) : null;
          statusMap[prop.id] = { status: row.status, date, rejectionReason };
        }
      }

      return NextResponse.json(statusMap);
    } catch (err) {
      console.error("[api/db/pitches] status-map unexpected error:", err);
      return NextResponse.json({}, { status: 200 });
    }
  }

  // Admin mode only needs a valid token (RLS handles permission)
  if (mode === "admin") {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const supabase = createServerSupabase(token);
      const userId = request.nextUrl.searchParams.get("user_id");

      let query = supabase
        .from("pitches")
        .select("*");

      if (userId) {
        query = query.eq("created_by", userId);
      } else {
        query = query.in("status", ["submitted", "approved", "rejected"]);
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

  // User mode: fetch pitches created by the authenticated user
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const { data, error } = await supabase
      .from("pitches")
      .select("*")
      .eq("created_by", userId);

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

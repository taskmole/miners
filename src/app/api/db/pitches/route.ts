import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") || "user";

  // Admin mode only needs a valid token (RLS handles permission)
  if (mode === "admin") {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const supabase = createServerSupabase(token);

      const { data, error } = await supabase
        .from("pitches")
        .select("*")
        .in("status", ["submitted", "approved", "rejected"])
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

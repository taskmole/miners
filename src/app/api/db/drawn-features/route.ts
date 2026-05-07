import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id query param required" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabase(token);

    const { data, error } = await supabase
      .from("drawn_features")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("[api/db/drawn-features] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("[api/db/drawn-features] unexpected error:", err);
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
    const { action, ...data } = body;
    const supabase = createServerSupabase(token);

    if (action === "upsert_geometry") {
      if (!Array.isArray(data.rows)) {
        return NextResponse.json({ error: "rows array is required" }, { status: 400 });
      }

      const { error } = await supabase
        .from("drawn_features")
        .upsert(data.rows, { onConflict: "id" });

      if (error) {
        console.error("[api/db/drawn-features] upsert error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "update_metadata") {
      if (!data.params) {
        return NextResponse.json({ error: "params object is required" }, { status: 400 });
      }

      const { error } = await supabase.rpc("update_drawn_feature_metadata", data.params);

      if (error) {
        console.error("[api/db/drawn-features] RPC error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/db/drawn-features] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id query param required" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabase(token);
    const keepIdsParam = request.nextUrl.searchParams.get("keep_ids");
    const keepIds = keepIdsParam?.split(",").filter(Boolean).filter(id => /^[\w-]+$/.test(id)) ?? [];

    let query = supabase.from("drawn_features").delete().eq("user_id", userId);

    if (keepIds.length > 0) {
      query = query.not("id", "in", `(${keepIds.join(",")})`);
    }

    const { error } = await query;

    if (error) {
      console.error("[api/db/drawn-features] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/db/drawn-features] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

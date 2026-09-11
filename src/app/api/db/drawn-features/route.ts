import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, untypedDb as db } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Map shapes.
 *
 * All three methods used to take the owner's id from the web address or the
 * request body. The browser's copy of that id comes from getCurrentUserId(),
 * which falls back to a random value left in local storage, so it was both
 * unsafe and unreliable: unsafe because anyone could name somebody else's id,
 * unreliable because a stale local value quietly addressed the wrong person's
 * shapes. The id now comes from the verified session in every method and
 * whatever the browser sends is ignored.
 */

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const { data, error } = await supabase
      .from("drawn_features")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("[api/db/drawn-features] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // userId comes back with the shapes so the browser can decide which edit
    // buttons to show without consulting its own local storage, which may hold
    // a stale id from a previous session and would hide the edit button on a
    // person's own shapes.
    return NextResponse.json({ userId, features: data || [] });
  } catch (err) {
    console.error("[api/db/drawn-features] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();
    const { action, ...data } = body;

    if (action === "upsert_geometry") {
      if (!Array.isArray(data.rows)) {
        return NextResponse.json({ error: "rows array is required" }, { status: 400 });
      }

      // The owner is stamped here, not accepted from the browser. Anything the
      // browser sent under user_id is dropped.
      const rows = data.rows.map((row: Record<string, unknown>) => ({
        ...row,
        user_id: userId,
      }));

      const { error } = await db(supabase)
        .from("drawn_features")
        .upsert(rows, { onConflict: "id" });

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

      // Same rule for the author as for the owner. The function only records
      // it on the first save and ignores it afterwards, so this cannot
      // re-stamp somebody else's shape.
      const params = { ...data.params, feature_created_by: userId };

      const { error } = await db(supabase).rpc("update_drawn_feature_metadata", params);

      if (error) {
        console.error("[api/db/drawn-features] RPC error:", error);
        // The function refuses a shape the caller does not own. That is a
        // permission answer, not a server fault, and it has to be said out
        // loud: the function ignores row security by design, so a silent
        // no-op would show "saved" on a shape that was not saved.
        if (error.code === "42501") {
          return NextResponse.json(
            { error: "You can only change your own shapes." },
            { status: 403 },
          );
        }
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
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
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

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Settings a browser is allowed to ask for.
 *
 * A login gate alone is not enough here. app_settings is one table holding
 * unrelated things, and it already carries a slot for an OpenAI key. Requiring
 * a session stops strangers but would still let all 15 colleagues read a
 * secret through this endpoint the moment one was saved. The key slot is being
 * removed from the database in the same change, and this list makes sure the
 * next one added is not readable either.
 */
const READABLE_KEYS = new Set([
  "scouting_defaults",
  "default_city",
  "feature_flags",
  "gravity_model_version",
]);

export async function GET(request: NextRequest) {
  // This was the only endpoint in the app that answered a request with no
  // sign-in at all. Now there are none.
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing ?key parameter" }, { status: 400 });
  }

  if (!READABLE_KEYS.has(key)) {
    return NextResponse.json({ error: "Unknown setting" }, { status: 404 });
  }

  try {
    const supabase = createServerSupabase(token);
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .single();

    if (error || !data) {
      return NextResponse.json(null, { status: 200 });
    }

    return NextResponse.json(data.value, { status: 200 });
  } catch (err) {
    console.error("[api/db/settings] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch setting" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json({ error: "Missing key or value" }, { status: 400 });
    }

    const supabase = createServerSupabase(token);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value }, { onConflict: "key" });

    if (error) {
      console.error("[api/db/settings] PUT error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[api/db/settings] PUT error:", err);
    return NextResponse.json({ error: "Failed to update setting" }, { status: 500 });
  }
}

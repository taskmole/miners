import { NextRequest, NextResponse } from "next/server";
import { createPublicServerSupabase, createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing ?key parameter" }, { status: 400 });
  }

  try {
    const supabase = createPublicServerSupabase();
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

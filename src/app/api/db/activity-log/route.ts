import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { user_id, action_type, summary, created_at } = body;

    if (!user_id || !action_type) {
      return NextResponse.json(
        { error: "user_id and action_type are required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase(token);

    const { error } = await supabase.from("activity_log").insert({
      user_id,
      action_type,
      summary: summary || null,
      created_at: created_at || new Date().toISOString(),
    });

    if (error) {
      console.error("[api/db/activity-log] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[api/db/activity-log] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

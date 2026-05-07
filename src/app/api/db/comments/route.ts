import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entityType = request.nextUrl.searchParams.get("entity_type");
  const entityId = request.nextUrl.searchParams.get("entity_id");

  try {
    const supabase = createServerSupabase(token);

    let query = supabase
      .from("comments")
      .select("id, entity_type, entity_id, created_by, content, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (entityType) query = query.eq("entity_type", entityType);
    if (entityId) query = query.eq("entity_id", entityId);

    const { data, error } = await query;

    if (error) {
      console.error("[api/db/comments] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("[api/db/comments] unexpected error:", err);
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
    const { id, entity_type, entity_id, created_by, content, created_at, entity_name } = body;

    if (!entity_type || !entity_id || !content) {
      return NextResponse.json(
        { error: "entity_type, entity_id, and content are required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase(token);

    const row = {
      entity_type,
      entity_id,
      created_by: created_by || null,
      content,
      ...(id ? { id } : {}),
      ...(created_at ? { created_at } : {}),
      ...(entity_name ? { entity_name } : {}),
    };

    const { data, error } = await supabase
      .from("comments")
      .upsert(row as any, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("[api/db/comments] upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/comments] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const commentId = request.nextUrl.searchParams.get("id");
  if (!commentId) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  try {
    // Only the comment author can delete their own comment
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("created_by", userId);

    if (error) {
      console.error("[api/db/comments] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/db/comments] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

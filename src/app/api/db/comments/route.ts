import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";
import { sendTeamEmails } from "@/lib/team-notify-server";

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

    // If this comment is on a property assigned to a team, notify the team
    // (best effort; skips the commenter and never blocks the comment).
    if (entity_type === "place") {
      try {
        const { data: assignment } = await supabase
          .from("property_assignments")
          .select("assigned_to_team")
          .eq("property_place_id", entity_id)
          .maybeSingle();
        const teamId = assignment?.assigned_to_team as string | null | undefined;
        if (teamId) {
          let actorName: string | undefined;
          if (created_by) {
            const { data: prof } = await supabase
              .from("user_profiles")
              .select("display_name")
              .eq("id", created_by)
              .maybeSingle();
            actorName = prof?.display_name || undefined;
          }
          await sendTeamEmails(supabase, {
            teamId,
            kind: "comment",
            placeName: entity_name || undefined,
            actorName,
            commentSnippet: typeof content === "string" ? content.slice(0, 120) : undefined,
            excludeUserId: created_by || undefined,
          });
        }
      } catch (notifyErr) {
        console.warn("[api/db/comments] team notify failed:", notifyErr);
      }
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

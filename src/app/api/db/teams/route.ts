import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const mode = request.nextUrl.searchParams.get("mode") || "my";

  try {
    let query = supabase
      .from("teams")
      .select("*, team_members(id, user_id, role, added_at)")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (mode === "all") {
      // Admin mode returns all teams (RLS still restricts to dashboard roles)
    }
    // For "my" mode, RLS already filters to teams where user is a member

    const { data, error } = await query;

    if (error) {
      console.error("[api/db/teams] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("[api/db/teams] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();

    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        name: body.name,
        created_by: userId,
      })
      .select()
      .single();

    if (teamError) {
      console.error("[api/db/teams] insert error:", teamError);
      return NextResponse.json({ error: teamError.message }, { status: 500 });
    }

    // Add creator as owner
    const { error: ownerError } = await supabase
      .from("team_members")
      .insert({
        team_id: team.id,
        user_id: userId,
        role: "owner",
        added_by: userId,
      });

    if (ownerError) {
      console.error("[api/db/teams] add owner error:", ownerError);
    }

    // Add initial members if provided
    if (body.memberIds && Array.isArray(body.memberIds)) {
      const members = body.memberIds
        .filter((id: string) => id !== userId)
        .map((id: string) => ({
          team_id: team.id,
          user_id: id,
          role: "member" as const,
          added_by: userId,
        }));

      if (members.length > 0) {
        const { error: membersError } = await supabase
          .from("team_members")
          .insert(members);

        if (membersError) {
          console.error("[api/db/teams] add members error:", membersError);
        }
      }
    }

    return NextResponse.json(team, { status: 201 });
  } catch (err) {
    console.error("[api/db/teams] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const { data, error } = await supabase
      .from("teams")
      .update(updates)
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      console.error("[api/db/teams] update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/teams] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from("teams")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[api/db/teams] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/db/teams] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

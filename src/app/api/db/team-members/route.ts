import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const teamId = request.nextUrl.searchParams.get("team_id");
  if (!teamId) {
    return NextResponse.json({ error: "team_id query param required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", teamId)
      .order("added_at", { ascending: true });

    if (error) {
      console.error("[api/db/team-members] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("[api/db/team-members] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();

    if (!body.team_id || !body.user_id) {
      return NextResponse.json({ error: "team_id and user_id required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("team_members")
      .insert({
        team_id: body.team_id,
        user_id: body.user_id,
        role: body.role || "member",
        added_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error("[api/db/team-members] insert error:", error);
      if (error.code === "23505") {
        return NextResponse.json({ error: "User already in team" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[api/db/team-members] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  try {
    const body = await request.json();

    if (!body.team_id || !body.user_id || !body.role) {
      return NextResponse.json({ error: "team_id, user_id, and role required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("team_members")
      .update({ role: body.role })
      .eq("team_id", body.team_id)
      .eq("user_id", body.user_id)
      .select()
      .single();

    if (error) {
      console.error("[api/db/team-members] update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/team-members] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const teamId = request.nextUrl.searchParams.get("team_id");
  const userId = request.nextUrl.searchParams.get("user_id");

  if (!teamId || !userId) {
    return NextResponse.json({ error: "team_id and user_id query params required" }, { status: 400 });
  }

  try {
    // Prevent removing the last owner
    const { data: owners } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("role", "owner");

    if (owners && owners.length === 1 && owners[0].user_id === userId) {
      return NextResponse.json(
        { error: "Cannot remove the last owner. Promote another member first." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId);

    if (error) {
      console.error("[api/db/team-members] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/db/team-members] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

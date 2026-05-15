import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerSupabase(token);

    const { data, error } = await supabase
      .from("property_assignments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[api/db/property-assignments] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("[api/db/property-assignments] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();

    const row = {
      property_place_id: body.property_place_id,
      assigned_to: body.status === "pre_rejected" ? null : (body.assigned_to ?? null),
      assigned_by: userId,
      status: body.status || "assigned",
      rejection_reason: body.rejection_reason ?? null,
      notes: body.notes ?? null,
    };

    const { data, error } = await supabase
      .from("property_assignments")
      .upsert(row, { onConflict: "property_place_id" })
      .select()
      .single();

    if (error) {
      console.error("[api/db/property-assignments] upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/property-assignments] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const placeId = request.nextUrl.searchParams.get("property_place_id");
  if (!placeId) {
    return NextResponse.json({ error: "property_place_id query param required" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabase(token);

    const { error } = await supabase
      .from("property_assignments")
      .delete()
      .eq("property_place_id", placeId);

    if (error) {
      console.error("[api/db/property-assignments] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/db/property-assignments] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

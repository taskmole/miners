import { NextRequest, NextResponse, after } from "next/server";
import { authenticateRequest, createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";
import { recordAiSignal } from "@/lib/ai-signal";
import { sendAssigneeEmail, sendTeamEmails } from "@/lib/team-notify-server";

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

    const assignedToTeam = body.assigned_to_team ?? null;
    const assignedTo = assignedToTeam
      ? null
      : body.status === "pre_rejected"
        ? null
        : (body.assigned_to ?? null);

    const row = {
      property_place_id: body.property_place_id,
      assigned_to: assignedTo,
      assigned_to_team: assignedToTeam,
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

    // Saved. Teach the AI scout, best effort (see recordAiSignal).
    if (row.status === "assigned" || row.status === "pre_rejected") {
      recordAiSignal(supabase, userId, {
        placeUuid: body.place_uuid,
        propertyPlaceId: row.property_place_id,
        kind: row.status === "assigned" ? "assign" : "reject",
        note: row.status === "pre_rejected" ? row.rejection_reason : null,
      });
    }

    // Tell whoever was given it. Who to email, and that an assignment really
    // happened, come from the row the database just saved, never from the
    // browser: it used to post its own "assigned to you" email request to
    // /api/notify-team, which let anyone signed in email anyone. The name and
    // address are only display text for the email, trimmed, and React Email
    // escapes them. Sent after the response so the assign never waits on it.
    // The hand-written Database type does not describe this table, so the
    // typed builder gives `never`; name the columns used here instead.
    const saved = data as unknown as {
      property_place_id: string;
      status: string;
      assigned_to: string | null;
      assigned_to_team: string | null;
    } | null;
    if (saved?.status === "assigned" && (saved.assigned_to || saved.assigned_to_team)) {
      const { assigned_to: person, assigned_to_team: team } = saved;
      const display = {
        kind: "assigned" as const,
        placeId: saved.property_place_id,
        placeName: displayText(body.place_name),
        placeAddress: displayText(body.place_address),
        excludeUserId: userId,
      };
      after(async () => {
        try {
          if (team) {
            await sendTeamEmails(supabase, { ...display, teamId: team, isTeam: true });
          } else if (person) {
            await sendAssigneeEmail(supabase, { ...display, userId: person });
          }
        } catch (err) {
          console.error("[api/db/property-assignments] assignment email failed:", err);
        }
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/property-assignments] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Browser-supplied text that only ever appears inside an email body. */
function displayText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, 200);
  return trimmed || undefined;
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const placeId = request.nextUrl.searchParams.get("property_place_id");
  if (!placeId) {
    return NextResponse.json({ error: "property_place_id query param required" }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from("property_assignments")
      .delete()
      .eq("property_place_id", placeId);

    if (error) {
      console.error("[api/db/property-assignments] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/db/property-assignments] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import React from "react";
import { TripStatusUpdate } from "@/emails/trip-status-update";
import { authenticateRequest } from "@/lib/supabase-server";
import { sendAppEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  // Verify caller has reviewer role. The role query must be filtered to the
  // caller: user_profiles is readable by every authenticated user under RLS,
  // so an unfiltered .single() sees every row, throws, and this route 500s
  // before sending anything. That is why status emails never arrived.
  try {
    // Deciding on a trip is what Approve means, in any city, which is what
    // is_admin() answers. Asked of the database rather than matched against a
    // list of role names that are being deleted.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: isAdmin } = await (supabase.rpc as any)("is_admin");
    if (isAdmin !== true) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email service not configured" }, { status: 503 });
  }

  let body: {
    pitchId: string;
    tripName: string;
    tripAddress: string;
    status: "approved" | "rejected" | "returned";
    reason: string;
    reviewerName: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.pitchId || !body.status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Resolve the recipient here rather than trusting the browser. The old
  // contract took recipientEmail from the client, which silently skipped the
  // email whenever the admin page had not finished loading its users list.
  const { data: pitchRow } = await supabase
    .from("pitches")
    .select("created_by")
    .eq("id", body.pitchId)
    .maybeSingle();

  const ownerId = (pitchRow as { created_by: string | null } | null)?.created_by;
  if (!ownerId) {
    return NextResponse.json({ ok: false, skipped: "no-owner" });
  }
  // The reviewer acting on their own pitch does not need an email about it.
  if (ownerId === userId) {
    return NextResponse.json({ ok: true, skipped: "self" });
  }

  const { data: owner } = await supabase
    .from("user_profiles")
    .select("email, display_name, is_active")
    .eq("id", ownerId)
    .maybeSingle();

  const ownerRow = owner as { email: string | null; display_name: string | null; is_active: boolean | null } | null;
  if (!ownerRow?.email || ownerRow.is_active === false) {
    return NextResponse.json({ ok: false, skipped: "no-recipient" });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://theminers.vercel.app";

  try {
    const html = await render(
      React.createElement(TripStatusUpdate, {
        tripName: body.tripName,
        tripAddress: body.tripAddress,
        recipientName: ownerRow.display_name || ownerRow.email,
        status: body.status,
        reason: body.reason || undefined,
        reviewerName: body.reviewerName,
        appUrl,
      })
    );

    const subjectMap = {
      approved: "Your trip was approved",
      rejected: "Your trip was rejected",
      returned: "Your trip needs changes",
    };

    const result = await sendAppEmail({
      to: ownerRow.email,
      subject: subjectMap[body.status],
      html,
    });

    return NextResponse.json({ ok: !result.error, ...result });
  } catch (err) {
    console.error("[send-trip-status] Error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}

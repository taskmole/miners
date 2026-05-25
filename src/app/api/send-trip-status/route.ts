import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { render } from "@react-email/render";
import React from "react";
import { TripStatusUpdate } from "@/emails/trip-status-update";
import { getTokenFromRequest, createServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller has reviewer role
  try {
    const supabase = createServerSupabase(token);
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .single();

    const reviewerRoles = ["super_admin", "head_office_exec"];
    if (!profile || !reviewerRoles.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email service not configured" }, { status: 503 });
  }

  let body: {
    tripName: string;
    tripAddress: string;
    recipientEmail: string;
    recipientName: string;
    status: "approved" | "rejected" | "returned";
    reason: string;
    reviewerName: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.recipientEmail || !body.status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://theminers.vercel.app";

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const html = await render(
      React.createElement(TripStatusUpdate, {
        tripName: body.tripName,
        tripAddress: body.tripAddress,
        recipientName: body.recipientName,
        status: body.status,
        reason: body.reason || undefined,
        reviewerName: body.reviewerName,
        appUrl,
      })
    );

    const subjectMap = {
      approved: `Your trip "${body.tripName}" has been approved`,
      rejected: `Your trip "${body.tripName}" was not accepted`,
      returned: `Your trip "${body.tripName}" needs changes`,
    };

    await resend.emails.send({
      from: "Miners Scout <onboarding@resend.dev>",
      to: body.recipientEmail,
      subject: subjectMap[body.status],
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[send-trip-status] Error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}

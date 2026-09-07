import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import React from "react";
import { NewSubmissionNotification } from "@/emails/new-submission-notification";
import { authenticateRequest } from "@/lib/supabase-server";
import { sendTeamEmails } from "@/lib/team-notify-server";
import { sendAppEmails } from "@/lib/email";

export const dynamic = "force-dynamic";

// Reviewers who get notified when a scout submits a trip.
// Hardcoded for now, mirroring the digest recipient list.
const NOTIFY_RECIPIENTS = [
  "matus.husar@theminers.eu",
  "founders@taskmole.co",
];

// Turn a city id ("madrid") into a display label ("Madrid").
// There is no central city-label map; the digest emails also use the raw
// string, so a simple capitalize keeps things consistent with no new deps.
function toCityLabel(cityId: string): string {
  if (!cityId) return "";
  return cityId.charAt(0).toUpperCase() + cityId.slice(1);
}

export async function POST(request: NextRequest) {
  // Require a real logged-in user (blocks anonymous spam). Any authenticated
  // scout may trigger this; no reviewer role needed since the submitter sends it.
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  let body: {
    tripName?: string;
    address?: string;
    cityId?: string;
    authorName?: string;
    submittedAt?: string;
    teamId?: string | null;
    ownerId?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Email service not configured (e.g. local dev). Return 200 so the queued
  // job clears instead of retrying forever.
  if (!process.env.RESEND_API_KEY) {
    console.warn("[notify-submission] RESEND_API_KEY missing, skipping email");
    return NextResponse.json({ ok: true, skipped: "no-resend-key" });
  }

  // Card title + subject use the place address; fall back to the trip name.
  const title = body.address || body.tripName || "Untitled trip";
  const cityLabel = toCityLabel(body.cityId || "");
  const authorName = body.authorName || "Scout";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://theminers.vercel.app";

  try {
    const html = await render(
      React.createElement(NewSubmissionNotification, {
        title,
        cityLabel,
        authorName,
        submittedAt: body.submittedAt,
        appUrl,
      })
    );

    const subject = `New trip submitted: ${title}${cityLabel ? ` (${cityLabel})` : ""}`;

    // One send per recipient. sendAppEmails handles the sandbox redirect and
    // tags each subject with the address it was really meant for.
    const sends = await sendAppEmails(NOTIFY_RECIPIENTS, { subject, html });
    const results = NOTIFY_RECIPIENTS.map((email, i) => ({
      email,
      status: sends[i].error ? `Failed: ${sends[i].error}` : "Sent",
    }));

    // Retry only on transient errors (rate limit / Resend outage). Permanent
    // failures (validation, unverified sender) must NOT retry, or the queued
    // job loops forever until the sending domain is verified.
    const transientFailure = sends.some(
      r => typeof r.statusCode === "number" && (r.statusCode === 429 || r.statusCode >= 500),
    );

    // Also notify the trip's team (if any), skipping the submitter. Exclude the
    // pitch owner (passed in the payload), not the request's auth user, since
    // this job can drain from a different session on a shared field device.
    // Wrapped in its own try/catch so a team-email error can never turn this
    // into a 5xx that makes the sync queue retry (and resend reviewer emails).
    if (body.teamId) {
      try {
        await sendTeamEmails(supabase, {
          teamId: body.teamId,
          kind: "submitted",
          tripName: body.tripName,
          placeName: title,
          actorName: authorName,
          excludeUserId: body.ownerId || userId,
        });
      } catch (teamErr) {
        console.warn("[notify-submission] team email failed:", teamErr);
      }
    }

    // 502 lets the sync queue retry (it treats 5xx as transient); 200 clears the
    // job on success or on a permanent failure we should not retry.
    if (transientFailure) {
      return NextResponse.json({ ok: false, results }, { status: 502 });
    }
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("[notify-submission] Error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}

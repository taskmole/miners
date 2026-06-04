import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { render } from "@react-email/render";
import React from "react";
import { NewSubmissionNotification } from "@/emails/new-submission-notification";
import { authenticateRequest } from "@/lib/supabase-server";

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

  let body: {
    tripName?: string;
    address?: string;
    cityId?: string;
    authorName?: string;
    submittedAt?: string;
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
    const resend = new Resend(process.env.RESEND_API_KEY);

    const html = await render(
      React.createElement(NewSubmissionNotification, {
        title,
        cityLabel,
        authorName,
        submittedAt: body.submittedAt,
        appUrl,
      })
    );

    // Strip control chars and cap length so client-supplied text can't garble
    // or bloat the subject line.
    const subject = `New trip submitted: ${title}${cityLabel ? ` (${cityLabel})` : ""}`
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 200);

    // Send per-recipient (not one `to:` array). With the Resend sandbox sender,
    // a single send to a non-allowed address fails the whole batch; sending one
    // at a time lets the verified owner address through and isolates failures.
    const results: { email: string; status: string }[] = [];
    let transientFailure = false;
    for (const email of NOTIFY_RECIPIENTS) {
      const { error } = await resend.emails.send({
        from: "Miners Scout <onboarding@resend.dev>",
        to: email,
        subject,
        html,
      });
      if (error) {
        console.warn(`[notify-submission] send to ${email} failed:`, error.message);
        // Retry only on transient errors (rate limit / Resend outage). Permanent
        // failures (sandbox sender restriction, validation) must NOT retry, or the
        // queued job loops forever until the sending domain is verified.
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (typeof statusCode === "number" && (statusCode === 429 || statusCode >= 500)) {
          transientFailure = true;
        }
      }
      results.push({ email, status: error ? `Failed: ${error.message}` : "Sent" });
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

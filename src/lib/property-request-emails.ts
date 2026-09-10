/**
 * Emails for the property request flow.
 *
 * Three moments, no new templates:
 *   - submitted  -> reviewers, using NewSubmissionNotification
 *   - approved   -> the requester, using TripStatusUpdate
 *   - rejected   -> the requester, using TripStatusUpdate (reason required)
 *
 * Every send is best effort. A mail failure must never undo a decision that
 * has already been written to the database.
 */

import React from "react";
import { render } from "@react-email/render";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NewSubmissionNotification } from "@/emails/new-submission-notification";
import { TripStatusUpdate } from "@/emails/trip-status-update";
import { sendAppEmail, sendAppEmails } from "@/lib/email";
import { parseCoordinatesFromPlaceId } from "@/lib/place-id";
import { countryForCoordinates, withCountryReviewers } from "@/lib/notify-routing";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://theminers.vercel.app";
}

/** What a request looks like to the email code. */
export interface RequestEmailContext {
  propertyName: string | null;
  propertyAddress: string | null;
  requesterName: string;
  requesterEmail: string | null;
  /** Lets the email's CTA deep-link to the property itself. */
  propertyPlaceId?: string | null;
}

/**
 * Which country's rules apply to this request, read from the coordinates
 * baked into the place id. Best effort: an unknown country simply means no
 * extra recipients, never a failed send.
 */
function requestCountry(ctx: RequestEmailContext): string | null {
  const coords = ctx.propertyPlaceId
    ? parseCoordinatesFromPlaceId(ctx.propertyPlaceId)
    : null;
  return coords ? countryForCoordinates(coords.lat, coords.lon) : null;
}

/** Best label for the property across both templates. */
function propertyTitle(ctx: Pick<RequestEmailContext, "propertyName" | "propertyAddress">): string {
  return ctx.propertyAddress || ctx.propertyName || "a property";
}

/**
 * Tell the reviewers a franchisee has asked for a property.
 *
 * Reviewer emails come from the request_reviewer_emails() SECURITY DEFINER
 * function: a franchisee cannot read other people's profiles under RLS, so it
 * cannot look the recipients up directly. On top of that list, a country can
 * have its own watcher (Spain does), added by notify-routing.
 */
export async function notifyReviewersOfRequest(
  supabase: SupabaseClient,
  ctx: RequestEmailContext,
): Promise<{ sent: number; skipped?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("request_reviewer_emails");
  if (error) {
    console.warn("[property-request-emails] reviewer lookup failed:", error.message);
  }

  const reviewers = ((data as { email: string | null }[]) || [])
    .map(r => r.email)
    .filter((e): e is string => Boolean(e));

  // The country's own watcher is added even when the reviewer lookup came back
  // empty or failed, so a Spanish request still reaches someone.
  const emails = withCountryReviewers(reviewers, requestCountry(ctx));

  if (emails.length === 0) {
    console.warn("[property-request-emails] no active super admins to notify");
    return { sent: 0, skipped: error ? "lookup-failed" : "no-reviewers" };
  }

  const title = propertyTitle(ctx);
  const html = await render(
    React.createElement(NewSubmissionNotification, {
      title,
      cityLabel: "",
      authorName: ctx.requesterName,
      submittedAt: new Date().toISOString(),
      appUrl: appUrl(),
      // A request is not a submission: this picks the request wording and
      // points the button at the Requests tab rather than Submissions.
      kind: "request",
    }),
  );

  const results = await sendAppEmails(emails, {
    subject: "New property request",
    html,
  });

  return { sent: results.filter(r => !r.error).length };
}

/**
 * Tell the requester their request was approved or rejected. A rejection
 * always carries the reviewer's reason.
 */
export async function notifyRequesterOfDecision(
  ctx: RequestEmailContext & {
    decision: "approved" | "rejected";
    reason?: string | null;
    reviewerName: string;
  },
): Promise<{ sent: number; skipped?: string }> {
  if (!ctx.requesterEmail) {
    return { sent: 0, skipped: "no-requester-email" };
  }

  const title = propertyTitle(ctx);
  const html = await render(
    React.createElement(TripStatusUpdate, {
      tripName: title,
      tripAddress: ctx.propertyAddress || "",
      recipientName: ctx.requesterName,
      status: ctx.decision,
      reason: ctx.reason || undefined,
      reviewerName: ctx.reviewerName,
      appUrl: appUrl(),
      placeId: ctx.propertyPlaceId ?? null,
      // Picks the request wording. Without this an approved request arrived
      // headed "Your scouting trip has been approved", which it is not.
      isRequest: true,
    }),
  );

  const subject =
    ctx.decision === "approved"
      ? "Your request was approved"
      : "Your request was rejected";

  const result = await sendAppEmail({ to: ctx.requesterEmail, subject, html });
  return { sent: result.error ? 0 : 1 };
}

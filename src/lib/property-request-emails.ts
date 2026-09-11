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
import { cityForCoordinates } from "@/lib/notify-routing";
import { createServiceSupabase } from "@/lib/supabase-server";

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
  /** The request's city. Decides who is told. Derived when absent. */
  cityId?: string | null;
}

/**
 * Which city this request belongs to, and therefore who decides it.
 *
 * The city is taken from the row when it has one - property_requests gained a
 * city_id column in step 5 of the permissions migration - and otherwise
 * worked out from the coordinates baked into the place id. The coordinates
 * are used rather than whichever city the person happened to have selected,
 * because the two can disagree (a saved list, a deep link, a stale picker)
 * and the property is the thing the email is actually about.
 */
function requestCity(ctx: RequestEmailContext): string | null {
  if (ctx.cityId) return ctx.cityId;
  const coords = ctx.propertyPlaceId
    ? parseCoordinatesFromPlaceId(ctx.propertyPlaceId)
    : null;
  return coords ? cityForCoordinates(coords.lat, coords.lon) : null;
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
 * cannot look the recipients up directly.
 *
 * That function now takes the request's city and returns everyone who
 * approves there, plus super admins. This is what the whole permissions
 * migration unblocked. There used to be a hardcoded rule bolting Kirill onto
 * anything in Spain, because there was no way to express "the person who
 * approves Madrid"; there is now, so the rule is gone and he is picked up by
 * his Madrid grant like anybody else.
 */
export async function notifyReviewersOfRequest(
  supabase: SupabaseClient,
  ctx: RequestEmailContext,
): Promise<{ sent: number; skipped?: string }> {
  const cityId = requestCity(ctx);

  // Through the service role, not the caller's session. request_reviewer_emails
  // used to be open to every signed-in person, which meant anyone could ask it
  // for the addresses of the two super admins and the eight approvers directly
  // - a second door to exactly what hiding emails from the directory closes.
  // The grant is gone now, so this lookup has to be elevated, and elevating it
  // also means the notification can never fail for a permissions reason.
  const lookupClient = createServiceSupabase() ?? supabase;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (lookupClient.rpc as any)("request_reviewer_emails", {
    p_city_id: cityId,
  });
  if (error) {
    console.warn("[property-request-emails] reviewer lookup failed:", error.message);
  }

  const emails = ((data as { email: string | null }[]) || [])
    .map(r => r.email)
    .filter((e): e is string => Boolean(e));

  if (emails.length === 0) {
    // Super admins come back for any city, so an empty list here means the
    // lookup failed or the city could not be worked out - not that nobody
    // approves this city.
    console.warn(
      `[property-request-emails] nobody to notify for city ${cityId ?? "(unknown)"}`,
    );
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

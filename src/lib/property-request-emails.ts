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
 */
export async function notifyReviewersOfRequest(
  supabase: SupabaseClient,
  ctx: RequestEmailContext,
): Promise<{ sent: number; skipped?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("request_reviewer_emails");
  if (error) {
    console.warn("[property-request-emails] reviewer lookup failed:", error.message);
    return { sent: 0, skipped: "lookup-failed" };
  }

  const emails = ((data as { email: string | null }[]) || [])
    .map(r => r.email)
    .filter((e): e is string => Boolean(e));

  if (emails.length === 0) {
    console.warn("[property-request-emails] no active super admins to notify");
    return { sent: 0, skipped: "no-reviewers" };
  }

  const title = propertyTitle(ctx);
  const html = await render(
    React.createElement(NewSubmissionNotification, {
      title,
      cityLabel: "",
      authorName: ctx.requesterName,
      submittedAt: new Date().toISOString(),
      appUrl: appUrl(),
    }),
  );

  const results = await sendAppEmails(emails, {
    subject: `New property request from ${ctx.requesterName}: ${title}`,
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
    }),
  );

  const subject =
    ctx.decision === "approved"
      ? `Your request for ${title} was approved`
      : `Your request for ${title} was not approved`;

  const result = await sendAppEmail({ to: ctx.requesterEmail, subject, html });
  return { sent: result.error ? 0 : 1 };
}

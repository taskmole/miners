/**
 * Server-side helper: email every member of a team about something that
 * happened to the team's property or pitch.
 *
 * Recipient emails are resolved through the `team_member_emails` SECURITY
 * DEFINER function (regular users cannot read each other's emails under RLS).
 * The caller is always excluded, and email failures are swallowed so a flaky
 * mail provider never blocks the underlying action.
 *
 * NOTE: while no sending domain is configured, sendAppEmail redirects every
 * message to the sandbox inbox with the real recipient in the subject line.
 * In-app notifications cover everyone in the meantime.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabase } from "@/lib/supabase-server";
import { sendAppEmail } from "./email";
import React from "react";
import { render } from "@react-email/render";
import { PropertyAssigned } from "@/emails/property-assigned";
import { TeamNotification, STATUS_LABEL } from "@/emails/team-notification";

export type TeamEmailKind =
  | "assigned"
  | "submitted"
  | "status"
  | "comment"
  | "added"
  | "removed";

export interface TeamEmailOptions {
  teamId: string;
  kind: TeamEmailKind;
  placeName?: string;
  placeAddress?: string;
  tripName?: string;
  status?: "approved" | "rejected" | "returned";
  reason?: string;
  actorName?: string;
  commentSnippet?: string;
  teamName?: string;
  /** Only email this single member (used for added/removed-from-team). */
  targetUserId?: string;
  /** Deep-links the assignment email straight to the property. */
  placeId?: string;
  /** False when the property went to one person rather than a whole team. */
  isTeam?: boolean;
  /** Never email this user (the person who triggered the action). */
  excludeUserId?: string;
  /** Extra user ids to skip (e.g. the pitch owner already emailed personally). */
  excludeUserIds?: string[];
}

interface TeamMemberRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://theminers.vercel.app";
}

/**
 * Build the subject + HTML for a given team event.
 *
 * Every kind now renders a React Email template, so they all share one logo,
 * card, button and footer. React escapes interpolated text itself, which is
 * why the old manual escapeHtml/wrapHtml pair is gone.
 */
async function buildTeamEmail(opts: TeamEmailOptions): Promise<{ subject: string; html: string }> {
  const place = opts.placeName || "a property";
  const trip = opts.tripName || place;
  const url = appUrl();

  switch (opts.kind) {
    case "assigned": {
      // isTeam defaults to true only when a teamId is present, so an
      // individual assignment can never be described as a team one.
      const toTeam = opts.isTeam ?? Boolean(opts.teamId);
      const name = opts.placeName || "a property";
      return {
        // Subjects stay short and carry no address: the inbox list truncates
        // anything longer, and the property is named in the body anyway.
        subject: toTeam
          ? "New property for your team"
          : "New property assigned to you",
        html: await render(
          React.createElement(PropertyAssigned, {
            propertyName: name,
            propertyAddress: opts.placeAddress || "",
            isTeam: toTeam,
            teamName: opts.teamName || "",
            placeId: opts.placeId ?? null,
            appUrl: url,
          }),
        ),
      };
    }
    case "submitted":
      return {
        subject: "New team pitch",
        html: await render(React.createElement(TeamNotification, {
          kind: "submitted", subject: trip, actorName: opts.actorName,
          teamName: opts.teamName, placeId: opts.placeId ?? null, appUrl: url,
        })),
      };
    case "status": {
      const st = opts.status || "approved";
      return {
        // Same phrasing table the email body uses, so they cannot drift.
        subject: `Team pitch ${STATUS_LABEL[st].word}`,
        html: await render(React.createElement(TeamNotification, {
          kind: "status", subject: trip, status: st, reason: opts.reason ?? null,
          teamName: opts.teamName, placeId: opts.placeId ?? null, appUrl: url,
        })),
      };
    }
    case "comment":
      return {
        subject: "New comment on a property",
        html: await render(React.createElement(TeamNotification, {
          kind: "comment", subject: place, actorName: opts.actorName,
          commentText: opts.commentSnippet ?? null, teamName: opts.teamName,
          placeId: opts.placeId ?? null, appUrl: url,
        })),
      };
    case "added":
      return {
        subject: `You joined ${opts.teamName || "a team"}`,
        html: await render(React.createElement(TeamNotification, {
          kind: "added", teamName: opts.teamName, appUrl: url,
        })),
      };
    case "removed":
      return {
        subject: `You left ${opts.teamName || "a team"}`,
        html: await render(React.createElement(TeamNotification, {
          kind: "removed", teamName: opts.teamName, appUrl: url,
        })),
      };
    default:
      // Unknown kind (a malformed request body): say only what we know.
      return {
        subject: "Update from your team",
        html: await render(React.createElement(TeamNotification, {
          kind: "generic", teamName: opts.teamName, appUrl: url,
        })),
      };
  }
}

/**
 * Resolve the team's member emails and send the notification to each
 * (one send per recipient, matching the Resend sandbox constraint). Best
 * effort: returns the per-recipient result list and never throws.
 */
export async function sendTeamEmails(
  supabase: SupabaseClient,
  opts: TeamEmailOptions,
): Promise<{ sent: number; skipped?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { sent: 0, skipped: "no-resend-key" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("team_member_emails", { team_uuid: opts.teamId });
  if (error) {
    console.warn("[team-notify] team_member_emails error:", error.message);
    return { sent: 0, skipped: "lookup-failed" };
  }

  const exclude = new Set(opts.excludeUserIds ?? []);
  if (opts.excludeUserId) exclude.add(opts.excludeUserId);
  const recipients = ((data as TeamMemberRow[]) || []).filter(
    r => r.email && (!opts.targetUserId || r.user_id === opts.targetUserId) && !exclude.has(r.user_id),
  );
  if (recipients.length === 0) return { sent: 0, skipped: "no-recipients" };

  const { subject, html } = await buildTeamEmail(opts);

  let sent = 0;
  for (const r of recipients) {
    const result = await sendAppEmail({ to: r.email as string, subject, html });
    if (!result.error) sent++;
  }
  return { sent };
}

/**
 * Email one person that a property has been assigned to them.
 *
 * Assigning to a *team* has always sent mail; assigning to an *individual*
 * sent nothing at all, so the most common case, head office giving a property
 * to one franchisee, was silent. Reuses the same template as the team email.
 */
export async function sendAssigneeEmail(
  supabase: SupabaseClient,
  opts: Omit<TeamEmailOptions, "teamId"> & { userId: string },
): Promise<{ sent: number; skipped?: string }> {
  if (!process.env.RESEND_API_KEY) return { sent: 0, skipped: "no-resend-key" };
  // Assigning a property to yourself should not email you about it.
  if (opts.userId === opts.excludeUserId) return { sent: 0, skipped: "self" };

  // Through the service role, not the caller's session. Assigning is
  // admin-only today and admins keep their full read, so this is not fixing a
  // break. It is removing a way to fail quietly: with the loose profile policy
  // gone, a lookup made on someone else's behalf would come back empty and the
  // log would say "no recipient", which reads exactly like "this person has no
  // address". A notification must never silently not send for a permissions
  // reason.
  const lookupClient = createServiceSupabase() ?? supabase;
  const { data, error } = await lookupClient
    .from("user_profiles")
    .select("email, is_active")
    .eq("id", opts.userId)
    .maybeSingle();

  const row = data as { email: string | null; is_active: boolean | null } | null;
  if (error) {
    console.warn("[team-notify] assignee lookup failed:", error.message);
    return { sent: 0, skipped: "lookup-failed" };
  }
  if (!row?.email || row.is_active === false) return { sent: 0, skipped: "no-recipient" };

  const { subject, html } = await buildTeamEmail({ ...opts, teamId: "", isTeam: false });
  const result = await sendAppEmail({ to: row.email, subject, html });
  return { sent: result.error ? 0 : 1 };
}

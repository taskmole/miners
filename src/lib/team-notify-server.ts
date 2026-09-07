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
import { sendAppEmail } from "./email";

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapHtml(heading: string, body: string, ctaUrl: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f4f5;padding:24px">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden">
      <div style="padding:20px 24px;border-bottom:1px solid #f4f4f5">
        <span style="font-weight:700;color:#18181b;font-size:16px">Miners</span>
      </div>
      <div style="padding:24px">
        <h1 style="margin:0 0 12px;font-size:18px;color:#18181b">${heading}</h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3f3f46">${body}</p>
        <a href="${ctaUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">Open Miners</a>
      </div>
    </div>
  </div>`;
}

/** Build the subject + HTML for a given team event. */
function buildTeamEmail(opts: TeamEmailOptions): { subject: string; html: string } {
  const place = opts.placeName ? escapeHtml(opts.placeName) : "a property";
  const trip = opts.tripName ? escapeHtml(opts.tripName) : place;
  const team = opts.teamName ? escapeHtml(opts.teamName) : "your team";
  const actor = opts.actorName ? escapeHtml(opts.actorName) : "Someone";
  const url = appUrl();

  switch (opts.kind) {
    case "assigned":
      return {
        subject: `New property assigned to your team: ${opts.placeName || "a property"}`,
        html: wrapHtml(
          "New property assigned to your team",
          `<strong>${place}</strong>${opts.placeAddress ? ` (${escapeHtml(opts.placeAddress)})` : ""} was assigned to your team to scout.`,
          url,
        ),
      };
    case "submitted":
      return {
        subject: `New team pitch submitted: ${opts.tripName || opts.placeName || "a pitch"}`,
        html: wrapHtml(
          "New team pitch submitted",
          `${actor} submitted a pitch for <strong>${trip}</strong> on behalf of your team.`,
          url,
        ),
      };
    case "status": {
      const map = {
        approved: { h: "A team pitch was approved", s: "approved" },
        rejected: { h: "A team pitch was not accepted", s: "not accepted" },
        returned: { h: "A team pitch needs changes", s: "returned for changes" },
      } as const;
      const m = map[opts.status || "approved"];
      return {
        subject: `Team pitch ${m.s}: ${opts.tripName || "a pitch"}`,
        html: wrapHtml(
          m.h,
          `Your team's pitch <strong>${trip}</strong> was ${m.s}.${opts.reason ? ` Note: ${escapeHtml(opts.reason)}` : ""}`,
          url,
        ),
      };
    }
    case "comment":
      return {
        subject: `New comment on your team's property: ${opts.placeName || "a property"}`,
        html: wrapHtml(
          "New comment on your team's property",
          `${actor} commented on <strong>${place}</strong>${opts.commentSnippet ? `: "${escapeHtml(opts.commentSnippet)}"` : "."}`,
          url,
        ),
      };
    case "added":
      return {
        subject: `You were added to team ${opts.teamName || ""}`.trim(),
        html: wrapHtml("You were added to a team", `You are now a member of <strong>${team}</strong>.`, url),
      };
    case "removed":
      return {
        subject: `You were removed from team ${opts.teamName || ""}`.trim(),
        html: wrapHtml("You were removed from a team", `You are no longer a member of <strong>${team}</strong>.`, url),
      };
    default:
      // Unknown kind (e.g. a malformed request body): fall back to a generic
      // message rather than returning undefined and throwing on destructure.
      return {
        subject: "Update from your team",
        html: wrapHtml("Team update", "Something in your team's workspace changed.", url),
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

  const { subject, html } = buildTeamEmail(opts);

  let sent = 0;
  for (const r of recipients) {
    const result = await sendAppEmail({ to: r.email as string, subject, html });
    if (!result.error) sent++;
  }
  return { sent };
}

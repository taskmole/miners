/**
 * Server-side: the "new trip submitted" emails.
 *
 * Sent by the pitch save route (POST /api/db/pitches) at the moment a pitch
 * becomes "submitted", and built only from the row the database just saved.
 * The browser used to ask /api/notify-submission to send these with its own
 * title, author and team, so any signed-in person could email the reviewers
 * (or any team they were on) with their own text, as often as they liked.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import React from "react";
import { render } from "@react-email/render";
import { NewSubmissionNotification } from "@/emails/new-submission-notification";
import { sendAppEmails } from "@/lib/email";
import { sendTeamEmails } from "@/lib/team-notify-server";
import { toCityLabel } from "@/lib/utils";

// Reviewers who get notified when a scout submits a trip.
//
// Deliberately a fixed pair rather than resolved by role. A role-based
// lookup (submission_reviewer_emails) was built and then withdrawn: it would
// have added every head office exec, and for now only these two want the
// traffic. Widening this means either adding an address here or reinstating
// that function, see 20260907000005 in the git history.
export const SUBMISSION_REVIEWERS = [
  "matus.husar@theminers.eu",
  "founders@taskmole.co",
];

/** The columns of a saved pitch that the emails read. */
export type SubmittedPitch = {
  city_id: string | null;
  created_by: string | null;
  team_id: string | null;
  trip_name: string | null;
  address: string | null;
  author_name: string | null;
  submitted_at: string | null;
};

/**
 * Email the reviewers, then the pitch's team (if it has one). Best effort:
 * each part catches its own errors, so a mail problem never reaches the save.
 *
 * `callerId` is the signed-in person who saved the pitch. They and the pitch
 * owner are left out of the team email.
 */
export async function sendSubmissionEmails(
  supabase: SupabaseClient,
  pitch: SubmittedPitch,
  callerId: string,
): Promise<void> {
  // Email service not configured (e.g. local dev).
  if (!process.env.RESEND_API_KEY) {
    console.warn("[submission-email] RESEND_API_KEY missing, skipping email");
    return;
  }

  // Card title + subject use the place address; fall back to the trip name.
  const title = pitch.address || pitch.trip_name || "Untitled trip";
  const authorName = pitch.author_name || "Scout";

  try {
    const html = await render(
      React.createElement(NewSubmissionNotification, {
        title,
        cityLabel: toCityLabel(pitch.city_id || ""),
        authorName,
        submittedAt: pitch.submitted_at || undefined,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://theminers.vercel.app",
      }),
    );
    // One send per recipient. sendAppEmails handles the sandbox redirect and
    // tags each subject with the address it was really meant for.
    const sends = await sendAppEmails(SUBMISSION_REVIEWERS, { subject: "New trip submitted", html });
    sends.forEach((s, i) => {
      if (s.error) console.warn(`[submission-email] reviewer ${i + 1} failed:`, s.error);
    });
  } catch (err) {
    console.error("[submission-email] reviewer email failed:", err);
  }

  if (pitch.team_id) {
    try {
      await sendTeamEmails(supabase, {
        teamId: pitch.team_id,
        kind: "submitted",
        tripName: pitch.trip_name || undefined,
        placeName: title,
        actorName: authorName,
        excludeUserId: callerId,
        excludeUserIds: pitch.created_by ? [pitch.created_by] : undefined,
      });
    } catch (err) {
      console.error("[submission-email] team email failed:", err);
    }
  }
}

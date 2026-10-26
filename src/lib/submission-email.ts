/**
 * Server-side: the "new trip submitted" emails.
 *
 * Sent by the pitch save route (POST /api/db/pitches) at the moment a pitch
 * becomes "submitted". The pitch is the scout's own text, so only its place
 * and trip name are shown (cut to length); the author comes from their
 * profile and the time from the server.
 *
 * The browser used to ask /api/notify-submission to send these with its own
 * title, author and team, so any signed-in person could email the reviewers
 * (or any team they were on) with their own text, as often as they liked.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import React from "react";
import { render } from "@react-email/render";
import { NewSubmissionNotification } from "@/emails/new-submission-notification";
import { sendAppEmails } from "@/lib/email";
import { createServiceSupabase } from "@/lib/supabase-server";
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

// Longest place or trip name the email shows. The text is the scout's own,
// so it is cut to a card-sized line rather than trusted to be one.
const MAX_TITLE = 120;

// Submission emails one person may set off per hour (owner's decision,
// 2026-10-26). Past this the pitch still saves; only the email is skipped.
const MAX_PER_HOUR = 10;

/** The columns of a saved pitch that the emails read. */
export type SubmittedPitch = {
  id: string;
  city_id: string | null;
  created_by: string | null;
  team_id: string | null;
  trip_name: string | null;
  address: string | null;
};

/**
 * The pitch owner's name as their profile has it. The pitch's own
 * author_name is text the browser saved, so the email never shows it: a
 * scout could otherwise submit under somebody else's name.
 */
async function ownerName(supabase: SupabaseClient, ownerId: string | null): Promise<string> {
  if (!ownerId) return "Scout";
  try {
    const { data, error } = await supabase.rpc("people_directory");
    if (error) throw error;
    const owner = ((data || []) as Array<{ id: string; display_name: string | null }>)
      .find((p) => p.id === ownerId);
    return owner?.display_name || "Scout";
  } catch (err) {
    console.warn("[submission-email] owner name lookup failed:", err);
    return "Scout";
  }
}

/**
 * Claim one of this person's submission emails for the hour, or say no when
 * they have used them all. Kept in submission_email_log, which only the
 * service role can touch. A failed lookup lets the email through: losing a
 * real submission email is worse than a rare unlimited one.
 */
async function claimEmailSlot(callerId: string, pitchId: string): Promise<boolean> {
  const service = createServiceSupabase();
  if (!service) {
    console.warn("[submission-email] no service role, sending without the limit");
    return true;
  }
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await service
      .from("submission_email_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", callerId)
      .gte("sent_at", since);
    if (error) throw error;
    if ((count ?? 0) >= MAX_PER_HOUR) {
      console.warn(`[submission-email] ${callerId} is over the hourly limit, skipping email for ${pitchId}`);
      return false;
    }
    const { error: logError } = await service
      .from("submission_email_log")
      .insert({ user_id: callerId, pitch_id: pitchId });
    if (logError) throw logError;
  } catch (err) {
    console.error("[submission-email] limit check failed, sending anyway:", err);
  }
  return true;
}

/**
 * Email the reviewers, then the pitch's team (if it has one), at most
 * MAX_PER_HOUR times per person. Best effort: each part catches its own
 * errors, so a mail problem never reaches the save.
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

  if (!(await claimEmailSlot(callerId, pitch.id))) return;

  // Card title uses the place address; fall back to the trip name.
  const title = (pitch.address || pitch.trip_name || "Untitled trip").slice(0, MAX_TITLE);
  const authorName = await ownerName(supabase, pitch.created_by);

  try {
    const html = await render(
      React.createElement(NewSubmissionNotification, {
        title,
        cityLabel: toCityLabel(pitch.city_id || ""),
        authorName,
        // The save that triggers this is the submission, so its time is now.
        // The row's submitted_at is the browser's clock.
        submittedAt: new Date().toISOString(),
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
        tripName: pitch.trip_name?.slice(0, MAX_TITLE) || undefined,
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

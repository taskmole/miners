import React from "react";
import { Link, Text } from "@react-email/components";
import {
  EmailShell,
  DetailCard,
  headingStyle,
  textStyle,
  buttonStyle,
} from "./_shell";

/**
 * Tells reviewers there is something waiting for them.
 *
 * Two things land here, and they are not the same:
 *   "trip"    a completed scouting trip awaiting approval
 *   "request" a franchisee asking to be given a property, before any
 *             scouting has happened
 *
 * They shared one set of words until a property request arrived headed
 * "New scouting trip submitted" with a "Review submission" button that
 * opened the wrong tab.
 */
interface NewSubmissionNotificationProps {
  /** The place address; falls back to the trip name upstream. */
  title: string;
  cityLabel: string;
  authorName: string;
  submittedAt?: string;
  appUrl?: string;
  kind?: "trip" | "request";
}

// e.g. "4 Jun 2026, 14:32". Empty when missing or unparseable, so the card
// never shows a stray separator with nothing after it.
function formatSubmittedAt(submittedAt?: string): string {
  if (!submittedAt) return "";
  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NewSubmissionNotification({
  title = "Spálená, Praha 1",
  cityLabel = "",
  authorName = "A franchisee",
  submittedAt,
  appUrl = "https://theminers.vercel.app",
  kind = "trip",
}: NewSubmissionNotificationProps) {
  const isRequest = kind === "request";

  const heading = isRequest ? "New property request" : "New scouting trip submitted";
  const lead = isRequest ? "would like to scout this property." : "submitted a new trip.";
  const cta = isRequest ? "Review request" : "Review submission";
  const reviewUrl = `${appUrl}/admin?tab=${isRequest ? "requests" : "submissions"}`;

  // Requests carry no city, so join only what exists rather than printing
  // "· 7 Sept 2026" with a dangling separator.
  const meta = [cityLabel, formatSubmittedAt(submittedAt)].filter(Boolean).join(" · ");

  return (
    <EmailShell preview={isRequest ? `${authorName} asked for a property` : `New scouting trip from ${authorName}`}>
      <Text style={headingStyle}>{heading}</Text>

      <Text style={textStyle}>
        <strong style={{ color: "#18181b" }}>{authorName}</strong> {lead}
      </Text>

      <DetailCard title={title} subtitle={meta} />

      <Link href={reviewUrl} style={buttonStyle}>
        {cta}
      </Link>
    </EmailShell>
  );
}

export default NewSubmissionNotification;

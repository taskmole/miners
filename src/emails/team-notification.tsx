import React from "react";
import { Link, Section, Text } from "@react-email/components";
import {
  EmailShell,
  DetailCard,
  propertyUrl,
  headingStyle,
  textStyle,
  buttonStyle,
  notedBlockStyle,
  notedLabelStyle,
  notedTextStyle,
} from "./_shell";

/**
 * Team notifications: a teammate submitted a pitch, a team pitch was decided,
 * someone commented, you joined or left a team.
 *
 * These five were the last emails still built as a hand-rolled HTML string
 * with a text "Miners" wordmark and an "Open Miners" button, so they looked
 * like a different product from every other email we send.
 */
export type TeamNotificationKind =
  | "submitted"
  | "status"
  | "comment"
  | "added"
  | "removed"
  /** Fallback for an unrecognised event: says only that something changed. */
  | "generic";

interface TeamNotificationProps {
  kind: TeamNotificationKind;
  /** Property or trip the event is about. Required for every kind except added/removed. */
  subject?: string;
  /** Who did it. */
  actorName?: string;
  teamName?: string;
  status?: "approved" | "rejected" | "returned";
  reason?: string | null;
  commentText?: string | null;
  /** Deep-links to the property when we know which one it is. */
  placeId?: string | null;
  appUrl?: string;
}

/** One table for badge, color, and phrasing, shared with the subject line. */
export const STATUS_LABEL = {
  approved: { label: "Approved", color: "#16a34a", word: "approved" },
  rejected: { label: "Rejected", color: "#dc2626", word: "not accepted" },
  returned: { label: "Returned for edits", color: "#d97706", word: "returned for changes" },
} as const;

export function TeamNotification({
  kind = "submitted",
  subject = "",
  actorName = "",
  teamName = "",
  status = "approved",
  reason = null,
  commentText = null,
  placeId = null,
  appUrl = "https://theminers.vercel.app",
}: TeamNotificationProps) {
  const team = teamName || "your team";
  const actor = actorName || "A teammate";

  const target = propertyUrl(appUrl, placeId);
  // Membership kinds carry no placeId, so this reads "Open app" for them.
  const cta = placeId ? "View property" : "Open app";

  let heading: string;
  let intro: string;
  let badge: string | null = null;
  let badgeColor: string | undefined;

  switch (kind) {
    case "submitted":
      heading = "A teammate submitted a pitch";
      intro = `${actor} submitted a pitch on behalf of ${team}.`;
      break;
    case "status":
      heading = `Your team's pitch was ${STATUS_LABEL[status].word}`;
      intro = `The pitch ${team} submitted was ${STATUS_LABEL[status].word}.`;
      badge = STATUS_LABEL[status].label;
      badgeColor = STATUS_LABEL[status].color;
      break;
    case "comment":
      heading = "New comment on your team's property";
      intro = `${actor} left a comment.`;
      break;
    case "added":
      heading = "You joined a team";
      intro = `You are now a member of ${team}. Properties assigned to this team will show up for you.`;
      break;
    case "removed":
      heading = "You left a team";
      intro = `You are no longer a member of ${team}. Its properties will no longer show up for you.`;
      break;
    default:
      // Unknown kind: say only what we know is true.
      heading = "Update from your team";
      intro = `Something changed in ${team}'s workspace.`;
      break;
  }

  return (
    <EmailShell preview={heading}>
      <Text style={headingStyle}>{heading}</Text>
      <Text style={textStyle}>{intro}</Text>

      {/* Membership kinds carry no subject, so they show no card. */}
      {subject && (
        <DetailCard title={subject} badge={badge} badgeColor={badgeColor}>
          {commentText && (
            <Section style={notedBlockStyle}>
              <Text style={notedLabelStyle}>{actor} wrote</Text>
              <Text style={notedTextStyle}>{commentText}</Text>
            </Section>
          )}
          {reason && (
            <Section style={notedBlockStyle}>
              <Text style={notedLabelStyle}>Reviewer feedback</Text>
              <Text style={notedTextStyle}>{reason}</Text>
            </Section>
          )}
        </DetailCard>
      )}

      <Link href={target} style={buttonStyle}>
        {cta}
      </Link>
    </EmailShell>
  );
}

export default TeamNotification;

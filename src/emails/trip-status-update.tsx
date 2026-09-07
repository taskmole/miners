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
 * A reviewer decided something: a scouting trip, or a property request.
 * Both land here because the shape is identical - one thing, one verdict,
 * optional feedback.
 */
interface TripStatusUpdateProps {
  tripName: string;
  tripAddress: string;
  recipientName: string;
  status: "approved" | "rejected" | "returned";
  reason?: string;
  reviewerName: string;
  appUrl?: string;
  /** Deep-links the CTA to the property via ?focus=. */
  placeId?: string | null;
  /** A property request rather than a completed scouting trip. */
  isRequest?: boolean;
}

const STATUS_CONFIG = {
  approved: {
    color: "#16a34a",
    label: "Approved",
    trip: {
      heading: "Your scouting trip has been approved",
      message: "Great work. Your submission passed review and has been accepted.",
    },
    request: {
      heading: "Your property request was approved",
      message: "This property is now yours to scout. You can start a trip on it whenever you are ready.",
    },
  },
  rejected: {
    color: "#dc2626",
    label: "Rejected",
    trip: {
      heading: "Your scouting trip was not accepted",
      message: "The reviewer's feedback is below. You can submit a new trip for another property.",
    },
    request: {
      heading: "Your property request was not approved",
      message: "The reviewer's reason is below. This property will not be available to request again.",
    },
  },
  returned: {
    color: "#d97706",
    label: "Returned for edits",
    trip: {
      heading: "Your scouting trip needs some changes",
      message: "The reviewer sent your trip back for revisions. Please make the changes below and resubmit.",
    },
    request: {
      heading: "Your property request needs some changes",
      message: "The reviewer sent your request back. Please see the note below.",
    },
  },
} as const;

export function TripStatusUpdate({
  tripName = "Sample Trip",
  tripAddress = "",
  recipientName = "Scout",
  status = "approved",
  reason,
  reviewerName = "",
  appUrl = "https://theminers.vercel.app",
  placeId = null,
  isRequest = false,
}: TripStatusUpdateProps) {
  const config = STATUS_CONFIG[status];
  const copy = isRequest ? config.request : config.trip;

  const target = propertyUrl(appUrl, placeId);

  const cta = status === "returned"
    ? (placeId ? "Open property to edit" : "Open app to edit")
    : (placeId ? "View property" : "Open app");

  return (
    <EmailShell preview={copy.heading}>
      <Text style={headingStyle}>{copy.heading}</Text>
      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>{copy.message}</Text>

      {/* One callout: the property, its verdict, and the reviewer's words. */}
      <DetailCard
        title={tripName}
        subtitle={tripAddress}
        badge={config.label}
        badgeColor={config.color}
      >
        {reason && (
          <Section style={notedBlockStyle}>
            <Text style={notedLabelStyle}>
              {reviewerName ? `Feedback from ${reviewerName}` : "Reviewer feedback"}
            </Text>
            <Text style={notedTextStyle}>{reason}</Text>
          </Section>
        )}
      </DetailCard>

      <Link href={target} style={buttonStyle}>
        {cta}
      </Link>
    </EmailShell>
  );
}

export default TripStatusUpdate;

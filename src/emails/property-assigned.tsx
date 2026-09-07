import React from "react";
import { Link, Text } from "@react-email/components";
import {
  EmailShell,
  DetailCard,
  propertyUrl,
  headingStyle,
  textStyle,
  buttonStyle,
} from "./_shell";

/**
 * "A property was assigned to you (or to your team)."
 *
 * Assignment mail used to be a hand-rolled HTML string, so the most common
 * email we send looked unlike every other one. It also always said "your
 * team", which read as a bug when the property had gone to one person.
 */
interface PropertyAssignedProps {
  propertyName: string;
  propertyAddress?: string;
  /** True when the whole team was assigned, false for a single person. */
  isTeam?: boolean;
  teamName?: string;
  /** Deep-links the CTA to the property via ?focus=. */
  placeId?: string | null;
  appUrl?: string;
}

export function PropertyAssigned({
  propertyName = "A property",
  propertyAddress = "",
  isTeam = false,
  teamName = "",
  placeId = null,
  appUrl = "https://theminers.vercel.app",
}: PropertyAssignedProps) {
  const heading = isTeam
    ? "A new property for your team"
    : "A new property is yours to scout";

  const message = isTeam
    ? `This property has been assigned to ${teamName || "your team"} to scout.`
    : "This property has been assigned to you. You can start a scouting trip on it whenever you are ready.";

  const target = propertyUrl(appUrl, placeId);

  return (
    <EmailShell preview={heading}>
      <Text style={headingStyle}>{heading}</Text>
      <Text style={textStyle}>{message}</Text>

      <DetailCard title={propertyName} subtitle={propertyAddress} badge="Assigned" />

      <Link href={target} style={buttonStyle}>
        {placeId ? "View property" : "Open app"}
      </Link>
    </EmailShell>
  );
}

export default PropertyAssigned;

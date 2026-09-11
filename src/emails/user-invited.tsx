import React from "react";
import { Link, Section, Text } from "@react-email/components";
import {
  EmailShell,
  DetailCard,
  headingStyle,
  textStyle,
  buttonStyle,
  notedBlockStyle,
  notedLabelStyle,
  notedTextStyle,
} from "./_shell";
import { LEVEL_LABELS, type CityLevel } from "@/lib/permissions";
import { cityNames } from "@/lib/cities";

/**
 * "You have been added to Miners Scout."
 *
 * The app has never sent this. Adding a user only ever wrote a row, and the
 * admin had to tell the person by hand that they could sign in.
 *
 * It goes out on one path only: somebody created *with* a city, who is
 * therefore active and can sign in right now. A profile created with no city
 * is switched off on purpose and gets nothing, because telling that person to
 * sign in would walk them straight into the Account Pending wall.
 *
 * The sign-in instruction is the load-bearing part of the copy. The database
 * matches an invited person by email address, so signing in with a different
 * Google address silently creates a blank account with no access.
 */

/** Badge colour per level. Matches the app: grey, blue, green, weak to strong. */
const LEVEL_COLOR: Record<CityLevel, string> = {
  view: "#71717a",
  contribute: "#2563eb",
  approve: "#16a34a",
};

const SUPER_ADMIN_COLOR = "#d97706";

function cityLabel(cityId: string): string {
  return cityNames[cityId] ?? cityId.charAt(0).toUpperCase() + cityId.slice(1);
}

/**
 * "Madrid", "Madrid and Prague", "Madrid, Prague and Seville".
 * Written out rather than comma-joined so a two-city line does not read as a
 * truncated list.
 */
export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The one-line "what you can do" sentence, shared by the invite and the
 * change alert so both always say access the same way.
 *
 * Roles no longer exist. A person is a super admin switch plus a level per
 * city, and this is that, in words.
 */
export function accessSummary({
  isSuperAdmin = false,
  level = null,
  cityIds = [],
}: {
  isSuperAdmin?: boolean;
  level?: CityLevel | null;
  cityIds?: string[];
}): string {
  if (isSuperAdmin) return "Super admin, every city";
  if (!level || cityIds.length === 0) return "No cities yet";
  return `${LEVEL_LABELS[level]} in ${joinNames(cityIds.map(cityLabel).sort())}`;
}

interface UserInvitedProps {
  /** Who added them. Falls back through name, email, then the team. */
  inviterName?: string;
  recipientName?: string;
  recipientEmail?: string;
  isSuperAdmin?: boolean;
  level?: CityLevel | null;
  cityIds?: string[];
  teamName?: string | null;
  appUrl?: string;
}

export function UserInvited({
  inviterName = "The Miners team",
  recipientName = "Ana Gomez",
  recipientEmail = "ana.gomez@example.com",
  isSuperAdmin = false,
  level = "contribute",
  cityIds = ["madrid"],
  teamName = null,
  appUrl = "https://theminers.vercel.app",
}: UserInvitedProps) {
  const heading = "You have been added to Miners Scout";
  const access = accessSummary({ isSuperAdmin, level, cityIds });

  const badge = isSuperAdmin
    ? "Super admin"
    : level
      ? LEVEL_LABELS[level]
      : "No access yet";

  const badgeColor = isSuperAdmin
    ? SUPER_ADMIN_COLOR
    : level
      ? LEVEL_COLOR[level]
      : "#71717a";

  return (
    <EmailShell preview={heading}>
      <Text style={headingStyle}>{heading}</Text>
      <Text style={textStyle}>
        {inviterName} set up an account for you. It is ready now, there is
        nothing to accept and no password to create.
      </Text>

      <DetailCard
        title={recipientName || recipientEmail}
        subtitle={recipientEmail}
        badge={badge}
        badgeColor={badgeColor}
      >
        <Section style={notedBlockStyle}>
          <Text style={notedLabelStyle}>Your access</Text>
          <Text style={notedTextStyle}>{access}</Text>
          {/* Only rendered when there is a team, so no empty label ever shows. */}
          {teamName && (
            <Text style={{ ...notedTextStyle, marginTop: "4px" }}>
              Team: {teamName}
            </Text>
          )}
        </Section>

        <Section style={notedBlockStyle}>
          <Text style={notedLabelStyle}>How to sign in</Text>
          <Text style={notedTextStyle}>
            Use the Sign in with Google button and pick {recipientEmail}. That
            exact address is how the app finds your account. Signing in with a
            different address creates a blank account with no access.
          </Text>
        </Section>
      </DetailCard>

      <Link href={appUrl} style={buttonStyle}>
        Sign in to Miners Scout
      </Link>

      <Text style={textStyle}>
        If Google offers you a choice of accounts, choose {recipientEmail}.
      </Text>
    </EmailShell>
  );
}

export default UserInvited;

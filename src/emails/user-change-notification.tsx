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

/**
 * "Somebody's access changed." Sent to every active super admin.
 *
 * One template, five events, the same way team-notification.tsx handles its
 * six kinds. Nobody is told today when a user is added, switched off or
 * promoted, which is the gap this closes.
 *
 * The admin who made the change is a recipient too. That is deliberate: it
 * doubles as a receipt.
 */
export type UserChangeKind =
  | "added"
  | "deactivated"
  | "reactivated"
  /** The super admin switch was flipped, either way. */
  | "super-admin"
  /** A level in a particular city was changed, added or taken away. */
  | "access";

interface UserChangeNotificationProps {
  kind: UserChangeKind;
  personName?: string;
  personEmail?: string;
  /** Where they stand now, in words: "Contribute in Madrid". */
  personAccess?: string;
  /** Who made the change. */
  changedByName?: string;
  /** Only for "access": what it was, and what it is now. */
  accessBefore?: string | null;
  accessAfter?: string | null;
  /** True when super admin was granted, false when it was taken away. */
  granted?: boolean;
  /** Deep-links the CTA to that person's admin page. */
  userId?: string | null;
  appUrl?: string;
}

/** Badge, colour and subject in one table, so the mail and its subject agree. */
const KIND_META: Record<
  UserChangeKind,
  { badge: string; color: string; heading: string }
> = {
  added: { badge: "Added", color: "#16a34a", heading: "New user added" },
  deactivated: { badge: "Deactivated", color: "#dc2626", heading: "User switched off" },
  reactivated: { badge: "Reactivated", color: "#16a34a", heading: "User switched back on" },
  "super-admin": { badge: "Super admin", color: "#d97706", heading: "Super admin changed" },
  access: { badge: "Access", color: "#d97706", heading: "Access changed" },
};

/**
 * The subject line. Exported so the sender and the tests use this one
 * definition rather than each writing their own copy of the wording.
 */
export function userChangeSubject(
  kind: UserChangeKind,
  personName: string,
  granted = true,
): string {
  switch (kind) {
    case "added":
      return `New user added: ${personName}`;
    case "deactivated":
      return `User switched off: ${personName}`;
    case "reactivated":
      return `User switched back on: ${personName}`;
    case "super-admin":
      return granted
        ? `${personName} is now a super admin`
        : `${personName} is no longer a super admin`;
    case "access":
      return `Access changed: ${personName}`;
  }
}

export function UserChangeNotification({
  kind = "added",
  personName = "Ana Gomez",
  personEmail = "ana.gomez@example.com",
  personAccess = "Contribute in Madrid",
  changedByName = "Jaro Zapletal",
  accessBefore = null,
  accessAfter = null,
  granted = true,
  userId = null,
  appUrl = "https://theminers.vercel.app",
}: UserChangeNotificationProps) {
  const meta = KIND_META[kind];
  const name = personName || personEmail || "Someone";
  const subject = userChangeSubject(kind, name, granted);

  // The heading restates the event; the subject carries the name, so the
  // inbox list is readable without opening anything.
  const heading =
    kind === "super-admin"
      ? granted
        ? "Super admin granted"
        : "Super admin removed"
      : meta.heading;

  let intro: string;
  switch (kind) {
    case "added":
      intro = `${changedByName} added ${name} to Miners Scout.`;
      break;
    case "deactivated":
      intro = `${changedByName} switched ${name} off. They can no longer sign in or see anything.`;
      break;
    case "reactivated":
      intro = `${changedByName} switched ${name} back on.`;
      break;
    case "super-admin":
      intro = granted
        ? `${changedByName} made ${name} a super admin. That is every city, plus users, settings and scoring.`
        : `${changedByName} removed super admin from ${name}.`;
      break;
    case "access":
      intro = `${changedByName} changed what ${name} can do.`;
      break;
  }

  const showsBeforeAfter = kind === "access" && !!accessBefore && !!accessAfter;

  const target = userId ? `${appUrl}/admin/users/${userId}` : `${appUrl}/admin`;

  return (
    <EmailShell preview={subject}>
      <Text style={headingStyle}>{heading}</Text>
      <Text style={textStyle}>{intro}</Text>

      <DetailCard
        title={name}
        subtitle={personEmail}
        badge={meta.badge}
        badgeColor={meta.color}
      >
        {/* An access change prints the before and after below instead, so
            this would otherwise say the same thing twice. */}
        {!showsBeforeAfter && (
          <Section style={notedBlockStyle}>
            <Text style={notedLabelStyle}>Access now</Text>
            <Text style={notedTextStyle}>{personAccess}</Text>
          </Section>
        )}

        {showsBeforeAfter && (
          <Section style={notedBlockStyle}>
            <Text style={notedLabelStyle}>What changed</Text>
            <Text style={{ ...notedTextStyle, color: "#71717a" }}>
              Was: {accessBefore}
            </Text>
            <Text style={{ ...notedTextStyle, marginTop: "2px" }}>
              Now: {accessAfter}
            </Text>
          </Section>
        )}

        <Section style={notedBlockStyle}>
          <Text style={notedLabelStyle}>Changed by</Text>
          <Text style={notedTextStyle}>{changedByName}</Text>
        </Section>
      </DetailCard>

      <Link href={target} style={buttonStyle}>
        {userId ? "Open user" : "Open admin"}
      </Link>
    </EmailShell>
  );
}

export default UserChangeNotification;

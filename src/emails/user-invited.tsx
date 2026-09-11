import React from "react";
import { Link, Text } from "@react-email/components";
import { EmailShell, headingStyle, textStyle, buttonStyle } from "./_shell";

/**
 * "You have been added to Miners Scout."
 *
 * The app has never sent this. Adding a user only ever wrote a row, and the
 * admin had to tell the person by hand that they could sign in.
 *
 * Deliberately bare. An earlier draft showed their level, their cities and
 * their team in a card; none of that is anything they have to act on, and it
 * buried the one thing they do: sign in with the right Google account. So the
 * email says only that.
 *
 * It goes out on one path only: somebody created *with* a city, who is
 * therefore active and can sign in right now. A profile created with no city
 * is switched off on purpose and gets nothing, because telling that person to
 * sign in would walk them straight into the Account Pending wall.
 *
 * The address in the copy is load-bearing. The database matches an invited
 * person by email address, so signing in with a different Google account
 * silently creates a blank account with no access.
 */
interface UserInvitedProps {
  /** Who added them. Falls back to "The Miners team" when we have no name. */
  inviterName?: string;
  recipientEmail?: string;
  appUrl?: string;
}

export function UserInvited({
  inviterName = "The Miners team",
  recipientEmail = "ana.gomez@example.com",
  appUrl = "https://theminers.vercel.app",
}: UserInvitedProps) {
  const heading = "You have been added to Miners Scout";

  return (
    <EmailShell preview={heading}>
      <Text style={headingStyle}>{heading}</Text>
      <Text style={textStyle}>
        {inviterName} set up an account for you. There is nothing to accept and
        no password to create.
      </Text>
      <Text style={textStyle}>
        Sign in with your Miners Google account, {recipientEmail}.
      </Text>

      <Link href={appUrl} style={buttonStyle}>
        Sign in
      </Link>
    </EmailShell>
  );
}

export default UserInvited;

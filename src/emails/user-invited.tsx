import React from "react";
import { Link, Text } from "@react-email/components";
import { EmailShell, headingStyle, textStyle, buttonStyle } from "./_shell";

/**
 * "You have been added to Miners Scout."
 *
 * The app has never sent this. Adding a user only ever wrote a row, and the
 * admin had to tell the person by hand that they could sign in.
 *
 * Two lines, on purpose. Earlier drafts showed their level, their cities,
 * their team and the exact address to sign in with. None of it is anything
 * they have to act on, and all of it buried the only thing they do.
 *
 * It goes out on one path only: somebody created *with* a city, who is
 * therefore active and can sign in right now. A profile created with no city
 * is switched off on purpose and gets nothing, because telling that person to
 * sign in would walk them straight into the Account Pending wall.
 */
interface UserInvitedProps {
  appUrl?: string;
}

export function UserInvited({
  appUrl = "https://theminers.vercel.app",
}: UserInvitedProps) {
  const heading = "You have been added to Miners Scout";

  return (
    <EmailShell preview={heading}>
      <Text style={headingStyle}>{heading}</Text>
      <Text style={textStyle}>Sign in with your Miners Google account.</Text>

      <Link href={appUrl} style={buttonStyle}>
        Sign in
      </Link>
    </EmailShell>
  );
}

export default UserInvited;

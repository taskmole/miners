import React from "react";
import { Link, Text } from "@react-email/components";
import { EmailShell, headingStyle, textStyle, buttonStyle } from "./_shell";

/**
 * The daily nudge to super admins when property requests have sat in the
 * queue for more than a day without an approve or reject. Same look as the
 * "New property request" email, and the button opens the same tab.
 */
interface RequestReminderProps {
  /** How many requests are waiting. Always at least 1: nothing waiting, no email. */
  count: number;
  /** Whole days the oldest one has been waiting. */
  oldestDays: number;
  appUrl?: string;
}

/** "There are 3 unanswered property requests in the queue." */
function reminderLine(count: number): string {
  return count === 1
    ? "There is 1 unanswered property request in the queue."
    : `There are ${count} unanswered property requests in the queue.`;
}

export function RequestReminder({
  count = 3,
  oldestDays = 6,
  appUrl = "https://theminers.vercel.app",
}: RequestReminderProps) {
  const days = `${oldestDays} ${oldestDays === 1 ? "day" : "days"}`;
  const wait = count === 1 ? `It has been waiting ${days}.` : `The oldest has been waiting ${days}.`;

  return (
    <EmailShell preview={reminderLine(count)}>
      <Text style={headingStyle}>Request reminder</Text>

      <Text style={textStyle}>
        {reminderLine(count)} {wait}
      </Text>

      <Link href={`${appUrl}/admin?tab=requests`} style={buttonStyle}>
        Review requests
      </Link>
    </EmailShell>
  );
}

export default RequestReminder;

import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import React from "react";
import RequestReminder from "@/emails/request-reminder";
import { sendAppEmails } from "@/lib/email";
import { loadReminder } from "@/lib/request-reminder";

export const dynamic = "force-dynamic";

/**
 * The daily "Request reminder" to super admins.
 *
 * Vercel's timer calls this once a day at 07:00 UTC (see vercel.json), which
 * is 9am Prague in summer and 8am in winter. Once the oldest property
 * request has been pending for about a day it emails every active super
 * admin; until then, it sends nothing.
 */
export async function GET(request: NextRequest) {
  // Vercel sends `Bearer <CRON_SECRET>`. With the variable unset, refuse
  // outright rather than accept "Bearer undefined".
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { waiting, recipients } = await loadReminder(new Date());
    if (waiting.count === 0) {
      return NextResponse.json({ sent: 0, skipped: "nothing-waiting" });
    }
    if (recipients.length === 0) {
      return NextResponse.json({ sent: 0, skipped: "no-super-admins" });
    }

    const html = await render(
      React.createElement(RequestReminder, {
        ...waiting,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://theminers.vercel.app",
      }),
    );

    const results = await sendAppEmails(recipients, {
      subject: `Request reminder: ${waiting.count} waiting`,
      html,
    });
    const failed = results.filter((r) => r.error).length;

    // A failed send shows as a failed run in the Vercel logs, not a green one.
    return NextResponse.json(
      { sent: results.length - failed, failed, ...waiting },
      { status: failed ? 500 : 200 },
    );
  } catch (err) {
    console.error("[api/send-request-reminder] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send request reminder" },
      { status: 500 },
    );
  }
}

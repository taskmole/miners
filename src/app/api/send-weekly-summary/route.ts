import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import React from "react";
import WeeklySummary from "@/emails/weekly-summary";
import { sendAppEmails } from "@/lib/email";
import {
  getWeeklySummary,
  getSuperAdminEmails,
  isPragueHour,
} from "@/lib/weekly-summary-queries";

export const dynamic = "force-dynamic";

/** 4pm Prague, the hour the summary is meant to land. */
const SEND_HOUR = 16;

/**
 * The Friday activity summary.
 *
 * Called by a GitHub Actions timer, guarded by the same shared secret the
 * digest route already uses. Reusing that secret rather than inventing a new
 * one means nothing has to be set up by hand in GitHub.
 *
 * The timer fires twice, at 14:00 and 15:00 UTC, because GitHub only
 * understands UTC and Prague is one hour ahead in winter and two in summer.
 * Exactly one of the two firings is 4pm in Prague, and this route decides
 * which. `force` skips the check, which is what the manual "Run workflow"
 * button uses.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-digest-secret");
  if (secret !== process.env.DIGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let force = false;
  try {
    const body = (await request.json()) as { force?: unknown };
    force = body?.force === true || body?.force === "true";
  } catch {
    // An empty body is a normal timer call, not an error.
  }

  const now = new Date();
  if (!force && !isPragueHour(now, SEND_HOUR)) {
    return NextResponse.json({
      sent: 0,
      skipped: "not-4pm-in-prague",
      checkedAt: now.toISOString(),
    });
  }

  try {
    const [data, recipients] = await Promise.all([
      getWeeklySummary(now),
      getSuperAdminEmails(),
    ]);

    if (recipients.length === 0) {
      return NextResponse.json({ sent: 0, skipped: "no-super-admins" });
    }

    const html = await render(React.createElement(WeeklySummary, data));

    // A quiet week still goes out. Silence and a broken report must not look
    // the same, so the email says so itself rather than not arriving.
    const results = await sendAppEmails(recipients, {
      subject: `This week in Miners Scout: ${data.rangeLabel}`,
      html,
    });

    const sent = results.filter((r) => !r.error).length;
    return NextResponse.json({
      sent,
      failed: results.length - sent,
      range: data.rangeLabel,
      activePeople: data.headline.activePeople,
      totalActions: data.headline.totalActions,
    });
  } catch (err) {
    console.error("[api/send-weekly-summary] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send summary" },
      { status: 500 },
    );
  }
}

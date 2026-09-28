import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import React from "react";
import WeeklySummary from "@/emails/weekly-summary";
import { sendAppEmails } from "@/lib/email";
import {
  getWeeklySummary,
  getSuperAdminEmails,
  dueSummaryFriday,
  getLastSentFriday,
  markSummarySent,
} from "@/lib/weekly-summary-queries";

export const dynamic = "force-dynamic";

/**
 * The Friday activity summary.
 *
 * GET is the Vercel timer (see vercel.json). It fires at 14:00 and 15:00 UTC
 * on Fridays, which is 4pm Prague in summer and in winter respectively. They
 * are two jobs, not one "14,15" job, because the free Vercel plan refuses a
 * job that runs twice a day. The run inside the send window (Friday 4pm to
 * Saturday noon, Prague) sends; the other is outside it or already sent.
 *
 * POST is GitHub's manual "Run workflow" button, guarded by the digest
 * secret. It always forces: skips the window and never touches the marker,
 * so a test run cannot block the real Friday send.
 */
export async function GET(request: NextRequest) {
  // Vercel sends `Bearer <CRON_SECRET>`. With the variable unset, refuse
  // outright rather than accept "Bearer undefined".
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return sendSummary(false);
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-digest-secret");
  if (!process.env.DIGEST_SECRET || secret !== process.env.DIGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return sendSummary(true);
}

async function sendSummary(force: boolean) {
  const now = new Date();

  try {
    // Stays null for a forced run: no window, no marker.
    let friday: string | null = null;
    if (!force) {
      friday = dueSummaryFriday(now);
      if (!friday) {
        return NextResponse.json({
          sent: 0,
          skipped: "outside-send-window",
          checkedAt: now.toISOString(),
        });
      }
      if ((await getLastSentFriday()) === friday) {
        return NextResponse.json({ sent: 0, skipped: "already-sent", friday });
      }
    }

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

    // Only once everyone has it. After a partial failure a later timer run
    // inside the window retries: one person may get it twice, but nobody
    // misses it.
    if (friday && sent === results.length) await markSummarySent(friday);

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

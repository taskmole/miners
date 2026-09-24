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
 * Called by a GitHub Actions timer, guarded by the same shared secret the
 * digest route already uses. Reusing that secret rather than inventing a new
 * one means nothing has to be set up by hand in GitHub.
 *
 * The timer fires several times on Friday afternoon because GitHub often
 * starts it hours late. The first run inside the send window (Friday 4pm to
 * Saturday noon, Prague) sends; the rest see the "last sent" marker and skip.
 *
 * `force` is the manual "Run workflow" button. It skips the window and never
 * touches the marker, so a test run cannot block the real Friday send.
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

    // Only once everyone has it. After a partial failure the next timer run
    // retries: one person may get it twice, but nobody misses it.
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

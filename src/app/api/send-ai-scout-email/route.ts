import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import React from "react";
import AiScoutWeekly from "@/emails/ai-scout-weekly";
import { sendAppEmails } from "@/lib/email";
import {
  getAiScoutEmail,
  getAiTrainerEmails,
  dueAiScoutFriday,
  getLastSentAiScoutFriday,
  markAiScoutSent,
} from "@/lib/ai-scout-email-queries";

export const dynamic = "force-dynamic";

/**
 * The Friday "Your AI scout this week" email, to everyone who trains the AI.
 *
 * GET is the Vercel timer (see vercel.json). It fires at 06:00 and 07:00 UTC
 * on Fridays, which is 8am Prague in summer and in winter respectively. They
 * are two jobs, not one "6,7" job, because the free Vercel plan refuses a
 * job that runs twice a day. The run inside the send window (Friday 8am to
 * 2pm, Prague) sends; the other is outside it or already sent.
 *
 * POST is a manual run, guarded by the digest secret. It always forces:
 * skips the window and never touches the marker, so a test run cannot block
 * the real Friday send.
 */
export async function GET(request: NextRequest) {
  // Vercel sends `Bearer <CRON_SECRET>`. With the variable unset, refuse
  // outright rather than accept "Bearer undefined".
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return sendAiScoutEmail(false);
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-digest-secret");
  if (!process.env.DIGEST_SECRET || secret !== process.env.DIGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return sendAiScoutEmail(true);
}

async function sendAiScoutEmail(force: boolean) {
  const now = new Date();

  try {
    // Stays null for a forced run: no window, no marker.
    let friday: string | null = null;
    if (!force) {
      friday = dueAiScoutFriday(now);
      if (!friday) {
        return NextResponse.json({
          sent: 0,
          skipped: "outside-send-window",
          checkedAt: now.toISOString(),
        });
      }
      if ((await getLastSentAiScoutFriday()) === friday) {
        return NextResponse.json({ sent: 0, skipped: "already-sent", friday });
      }
    }

    const [data, recipients] = await Promise.all([getAiScoutEmail(now), getAiTrainerEmails()]);

    if (recipients.length === 0) {
      return NextResponse.json({ sent: 0, skipped: "no-trainers" });
    }

    const html = await render(React.createElement(AiScoutWeekly, data));

    // A quiet week still goes out, in its short form: it tells head office
    // what unlocks suggestions, and silence would look like a broken job.
    const results = await sendAppEmails(recipients, {
      subject: "Your AI scout this week",
      html,
    });

    const sent = results.filter((r) => !r.error).length;

    // Only once everyone has it. After a partial failure a later timer run
    // inside the window retries: one person may get it twice, but nobody
    // misses it.
    if (friday && sent === results.length) await markAiScoutSent(friday);

    return NextResponse.json({
      sent,
      failed: results.length - sent,
      range: data.rangeLabel,
      quiet: data.quiet,
      listingsRated: data.stats.listingsRated,
      suggestions: data.suggestions.length,
    });
  } catch (err) {
    console.error("[api/send-ai-scout-email] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send AI scout email" },
      { status: 500 },
    );
  }
}

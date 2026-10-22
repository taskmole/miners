import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import React from "react";
import CafeUpdate from "@/emails/cafe-update";
import { sendAppEmail } from "@/lib/email";
import {
  type CafeUpdateCity,
  buildCafeUpdateEmails,
  cafeUpdateSubject,
  citiesWithChanges,
  getAppUrl,
  getCafeUpdateMarker,
  getCafeUpdateRecipients,
  isReportDue,
  readCafeReport,
  saveCafeUpdateMarker,
} from "@/lib/cafe-update-email";

export const dynamic = "force-dynamic";

/** Render and send the email for one address. */
async function sendCafeUpdate(to: string, cities: CafeUpdateCity[], appUrl: string) {
  const html = await render(React.createElement(CafeUpdate, { cities, appUrl }));
  return sendAppEmail({ to, subject: cafeUpdateSubject(cities), html });
}

/**
 * "The cafe map was refreshed": new, gone and changed cafes, emailed once
 * after each monthly cafe refresh to everyone who can see a changed city.
 *
 * GET is the daily Vercel timer (see vercel.json). It sends when the deployed
 * report is recent and not sent yet, so it goes out the morning after the
 * refresh lands, and a re-run of the refresh later in the month still gets
 * its email.
 *
 * POST is a manual test, guarded by the digest secret. It sends the current
 * report to the one address in the body ({ "to": "..." }) and never touches
 * the marker, so a test cannot block or replace the real send.
 */
export async function GET(request: NextRequest) {
  // Vercel sends `Bearer <CRON_SECRET>`. With the variable unset, refuse
  // outright rather than accept "Bearer undefined".
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = readCafeReport();
    const marker = await getCafeUpdateMarker();
    if (!report || !isReportDue(report, marker, new Date())) {
      return NextResponse.json({ sent: 0, skipped: "nothing-due", stamp: report?.stamp ?? null });
    }

    // Recorded after every send, so a retry (tomorrow's timer) only reaches
    // the people a failure skipped, and one bad address never re-sends to
    // everyone else.
    const sentTo = marker?.stamp === report.stamp ? [...marker.sentTo] : [];
    const emails = buildCafeUpdateEmails(report, await getCafeUpdateRecipients());
    const pending = emails.filter((e) => !sentTo.includes(e.email));
    const appUrl = getAppUrl();

    let sent = 0;
    for (const { email, cities } of pending) {
      const result = await sendCafeUpdate(email, cities, appUrl);
      if (result.error) continue;
      sent++;
      sentTo.push(email);
      await saveCafeUpdateMarker({ stamp: report.stamp, sentTo, done: false });
    }

    const done = emails.every((e) => sentTo.includes(e.email));
    await saveCafeUpdateMarker({ stamp: report.stamp, sentTo, done });

    return NextResponse.json({ sent, failed: pending.length - sent, done, stamp: report.stamp });
  } catch (err) {
    console.error("[api/send-cafe-update-email] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send cafe update email" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-digest-secret");
  if (!process.env.DIGEST_SECRET || secret !== process.env.DIGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { to?: unknown };
  if (typeof body.to !== "string" || !body.to.includes("@")) {
    return NextResponse.json({ error: 'Body must be { "to": "<one address>" }' }, { status: 400 });
  }

  const report = readCafeReport();
  const cities = report ? citiesWithChanges(report) : [];
  if (cities.length === 0) return NextResponse.json({ sent: 0, skipped: "no-report" });

  const result = await sendCafeUpdate(body.to, cities, getAppUrl());
  return NextResponse.json({ sent: result.error ? 0 : 1, error: result.error ?? null, stamp: report!.stamp });
}

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase-server";
import { sendTeamEmails, type TeamEmailOptions } from "@/lib/team-notify-server";

export const dynamic = "force-dynamic";

/**
 * Client-triggered team notification (property assigned, pitch status change).
 * Server-triggered events (submission, comments, membership changes) call
 * sendTeamEmails directly from their own routes instead of hopping through here.
 *
 * Always excludes the caller. Best effort: never blocks the action that
 * triggered it, so a 200 is returned even when nothing is sent.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  let body: Partial<TeamEmailOptions>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.teamId || !body.kind) {
    return NextResponse.json({ error: "teamId and kind are required" }, { status: 400 });
  }

  try {
    const result = await sendTeamEmails(supabase, {
      ...(body as TeamEmailOptions),
      excludeUserId: userId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[notify-team] error:", err);
    // Best effort: report but do not surface as a hard failure to the client.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

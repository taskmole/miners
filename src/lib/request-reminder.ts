import { createServiceSupabase } from "@/lib/supabase-server";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * About a day, but not exactly. The free Vercel plan fires the timer at any
 * minute within the hour, so with a strict 24 hours a request made just after
 * yesterday's run could miss today's by minutes and first be chased at nearly
 * two days old.
 */
const REMIND_AFTER_MS = 20 * 60 * 60 * 1000;

export interface WaitingRequests {
  /** Every pending request, so it matches the Requests tab. 0 means no email. */
  count: number;
  /** Days the oldest request has been waiting, rounded. */
  oldestDays: number;
}

/**
 * Whether the queue needs a reminder: only once the oldest request has
 * waited about a day, because anything newer has just had its own "New
 * property request" email. Pure, so the rule is tested without a database or
 * a clock.
 */
export function summariseWaiting(createdAts: string[], now: Date): WaitingRequests {
  const oldestAge = Math.max(0, ...createdAts.map((c) => now.getTime() - new Date(c).getTime()));
  if (oldestAge < REMIND_AFTER_MS) return { count: 0, oldestDays: 0 };

  return { count: createdAts.length, oldestDays: Math.round(oldestAge / DAY_MS) };
}

/**
 * What the reminder needs from the database, through the service role (the
 * cron has no user): the waiting requests and every active super admin's
 * email. Throws on a failed query: skipping quietly would look exactly like
 * an empty queue, which is the problem this reminder exists to fix.
 */
export async function loadReminder(now: Date): Promise<{ waiting: WaitingRequests; recipients: string[] }> {
  const supabase = createServiceSupabase();
  if (!supabase) throw new Error("Supabase service role is not configured");

  const [requests, admins] = await Promise.all([
    supabase.from("property_requests").select("created_at").eq("status", "pending"),
    supabase.from("user_profiles").select("email").eq("is_super_admin", true).eq("is_active", true),
  ]);
  if (requests.error) throw new Error(`pending request lookup failed: ${requests.error.message}`);
  if (admins.error) throw new Error(`super admin lookup failed: ${admins.error.message}`);

  return {
    waiting: summariseWaiting(
      ((requests.data as { created_at: string }[]) || []).map((r) => r.created_at),
      now,
    ),
    recipients: ((admins.data as { email: string | null }[]) || [])
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e)),
  };
}

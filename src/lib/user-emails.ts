/**
 * Emails about people: the invite, and the super admin alerts.
 *
 * Built the same way as property-request-emails.ts, with one rule on top of
 * it that matters more here than anywhere else:
 *
 *   NOTHING IN THIS FILE MAY THROW.
 *
 * Every caller runs it after a user change has already been written to the
 * database. A mail failure must never undo, fail, or appear to fail a change
 * that actually happened. Both senders catch everything, give up after ten
 * seconds, and report what they did rather than raising.
 */

import React from "react";
import { render } from "@react-email/render";
import { createClient } from "@supabase/supabase-js";
import { UserInvited } from "@/emails/user-invited";
import {
  UserChangeNotification,
  userChangeSubject,
  type UserChangeKind,
} from "@/emails/user-change-notification";
import { sendAppEmail } from "@/lib/email";
import { accessSummary, type CityLevel } from "@/lib/permissions";
import { cityNames } from "@/lib/cities";

/** Nothing here waits longer than this, however slow Resend is being. */
const TIMEOUT_MS = 10_000;

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://theminers.vercel.app";
}

/**
 * Service-role client, the same one the digest uses. It bypasses RLS.
 *
 * Deliberate, and the reason is worth keeping: looking the super admins up
 * with the caller's own connection works only because every signed-in user
 * can currently read every profile, which is a known hole that is meant to be
 * closed. The day it is, those alerts would stop going out silently, with
 * nothing reporting an error. This keeps them independent of it.
 */
function serviceSupabase() {
  const url = process.env.SUPABASE_PROD_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Gives up rather than holding a request open on a slow mail service. */
async function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.warn("[user-emails] gave up after 10s");
          resolve(fallback);
        }, TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** One row of user_city_grants, as the routes read it. */
export interface GrantRowLike {
  city_id: string;
  level: CityLevel;
}

/** "Contribute in Madrid and Prague", from whatever the database returned. */
export function describeGrants(
  grants: GrantRowLike[] | null | undefined,
  isSuperAdmin = false,
): string {
  return accessSummary(
    {
      isSuperAdmin,
      grants: (grants || []).map((g) => ({
        cityId: g.city_id,
        level: g.level,
        canSeeFinancials: false,
        receivesAlerts: false,
      })),
    },
    cityNames,
  );
}

export interface InviteResult {
  sent: boolean;
  /** True when the sandbox sender rerouted it to the test inbox. */
  redirected: boolean;
  /** Why nothing was sent, when nothing was. */
  skipped?: string;
}

/**
 * Tell somebody they have been added.
 *
 * Only ever called for a person created WITH a city, who is therefore active
 * and can sign in right now. A profile created with no city is switched off
 * on purpose; telling that person to sign in would walk them into the
 * "Account Pending" wall with no explanation. The guard below is the second
 * line of that, in case a future caller forgets.
 */
export async function sendInviteEmail(ctx: {
  email: string | null | undefined;
  isActive: boolean;
}): Promise<InviteResult> {
  try {
    if (!ctx.email) return { sent: false, redirected: false, skipped: "no-email" };
    if (!ctx.isActive) return { sent: false, redirected: false, skipped: "inactive" };

    const html = await render(
      React.createElement(UserInvited, { appUrl: appUrl() }),
    );

    const result = await withTimeout(
      sendAppEmail({
        to: ctx.email,
        subject: "You have been added to Miners Scout",
        html,
      }),
      { deliveredTo: ctx.email, redirected: false, error: "timeout" },
    );

    return {
      sent: !result.error,
      redirected: result.redirected,
      skipped: result.error ?? undefined,
    };
  } catch (err) {
    // Never throws: the user has already been created at this point.
    console.warn("[user-emails] invite failed:", err instanceof Error ? err.message : err);
    return { sent: false, redirected: false, skipped: "error" };
  }
}

export interface UserChangeEvent {
  kind: UserChangeKind;
  personId?: string | null;
  personName?: string | null;
  personEmail?: string | null;
  /** Where they stand now, in words. */
  personAccess: string;
  changedByName?: string | null;
  /** Only for "access": what it was, and what it is now. */
  accessBefore?: string | null;
  accessAfter?: string | null;
  /** For "super-admin": granted, or taken away. */
  granted?: boolean;
}

/**
 * Tell every active super admin that somebody's access changed.
 *
 * The admin who made the change is included on purpose: it doubles as a
 * receipt, and with a handful of super admins the volume is nothing.
 */
export async function notifySuperAdminsOfUserChange(
  event: UserChangeEvent,
): Promise<{ sent: number; skipped?: string }> {
  try {
    const supabase = serviceSupabase();
    if (!supabase) {
      console.warn("[user-emails] no service role key, no alerts sent");
      return { sent: 0, skipped: "no-service-key" };
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("email")
      .eq("is_super_admin", true)
      .eq("is_active", true);

    if (error) {
      console.warn("[user-emails] super admin lookup failed:", error.message);
      return { sent: 0, skipped: "lookup-failed" };
    }

    const recipients = ((data as { email: string | null }[]) || [])
      .map((r) => r.email)
      .filter((e): e is string => Boolean(e));

    if (recipients.length === 0) return { sent: 0, skipped: "no-super-admins" };

    const name = event.personName?.trim() || event.personEmail || "Someone";
    const changedBy = event.changedByName?.trim() || "An admin";
    const granted = event.granted !== false;

    const html = await render(
      React.createElement(UserChangeNotification, {
        kind: event.kind,
        personName: name,
        personEmail: event.personEmail || "",
        personAccess: event.personAccess,
        changedByName: changedBy,
        accessBefore: event.accessBefore ?? null,
        accessAfter: event.accessAfter ?? null,
        granted,
        userId: event.personId ?? null,
        appUrl: appUrl(),
      }),
    );

    const subject = userChangeSubject(event.kind, name, granted);

    // One send per recipient, and the whole batch under one timeout: a slow
    // mail service must not hold the user's request open.
    const results = await withTimeout(
      Promise.all(
        recipients.map((to) => sendAppEmail({ to, subject, html })),
      ),
      [],
    );

    return { sent: results.filter((r) => !r.error).length };
  } catch (err) {
    // Never throws: the change has already been written.
    console.warn(
      "[user-emails] change alert failed:",
      err instanceof Error ? err.message : err,
    );
    return { sent: 0, skipped: "error" };
  }
}

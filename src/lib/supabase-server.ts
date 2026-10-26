import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "./supabase";
import { toGrants, type Access, type CityGrantRow } from "./permissions";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const SERVER_AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

// Authenticated server client (anon key + user JWT, so RLS applies)
export function createServerSupabase(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: SERVER_AUTH_OPTIONS,
  });
}

// Public server client for anonymous-read tables (places, cities, scoring_params)
export function createPublicServerSupabase(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: SERVER_AUTH_OPTIONS,
  });
}

/**
 * Service-role client. It bypasses row security entirely, so it is only for
 * server-side lookups that must not depend on what the caller may read.
 *
 * The case it exists for: notification emails. Looking a recipient's address
 * up with the caller's own connection works only while every signed-in person
 * can read every profile, which is the hole being closed. The day it closes,
 * those emails would stop going out silently, with nothing reporting an error.
 *
 * Returns null when the key is not configured, so callers degrade rather than
 * crash. Never hand this client a value that came from a browser.
 *
 * A SECURITY DEFINER function called through this client sees no user, so an
 * "auth.uid() IS NOT NULL" guard returns nothing (see migration
 * 20260924000001). Such guards must also accept the service role.
 */
export function createServiceSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_PROD_URL || SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: SERVER_AUTH_OPTIONS });
}

export function getTokenFromRequest(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

/**
 * Authenticate a request: extract the bearer token, create a Supabase client,
 * and verify the user via getUser. Returns the client + user on success,
 * or a NextResponse error to return directly.
 */
export async function authenticateRequest(
  req: Request
): Promise<
  | { supabase: SupabaseClient<Database>; userId: string; email: string | null; error?: never }
  | { error: NextResponse; supabase?: never; userId?: never; email?: never }
> {
  const token = getTokenFromRequest(req);
  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const supabase = createServerSupabase(token);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { supabase, userId: user.id, email: user.email ?? null };
}

/**
 * authenticateRequest, but the read starts at the same time as the sign-in
 * check instead of after it.
 *
 * Every map-data call used to wait for Supabase Auth to answer before it even
 * began its query. On a page open ~25 calls ask at once, and that wait alone
 * was 0.2-0.3 s per call. Running both together costs nothing in safety:
 * `work` gets the caller's own client, so the database checks their token and
 * applies their row rules, and its result is only handed back once getUser has
 * also said yes. A caller who fails the check gets the same 401 as before,
 * whatever `work` did.
 *
 * Only for reads. `work` runs before we know who is asking, so it must not
 * write anything or depend on the user id.
 */
export async function authenticateAlongside<T>(
  req: Request,
  work: (supabase: SupabaseClient<Database>) => Promise<T>
): Promise<
  | { supabase: SupabaseClient<Database>; userId: string; result: T; error?: never }
  | { error: NextResponse; supabase?: never; userId?: never; result?: never }
> {
  const unauthorized = () => ({ error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });

  const token = getTokenFromRequest(req);
  if (!token) return unauthorized();

  const supabase = createServerSupabase(token);
  const [auth, read] = await Promise.allSettled([supabase.auth.getUser(token), work(supabase)]);

  const user = auth.status === "fulfilled" && !auth.value.error ? auth.value.data.user : null;
  if (!user) return unauthorized();

  // Signed in, but the read itself blew up: let the route's own catch answer,
  // exactly as when the read ran after the check.
  if (read.status === "rejected") throw read.reason;

  return { supabase, userId: user.id, result: read.value };
}

/**
 * The repo's hand-written Database type does not describe every table, so the
 * typed query builder collapses to `never` on the ones it misses. Routes that
 * touch those tables drop the schema generic through this and lean on their
 * own row types instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function untypedDb(client: unknown): SupabaseClient<any> {
  return client as SupabaseClient;
}

/**
 * Does the caller hold at least View in this city? null when the check
 * itself failed, which callers must treat as "no" (fail closed).
 *
 * Asks the database (has_city_level) rather than re-deriving the rule, so
 * routes and the row policies can never drift into disagreeing about who
 * may see Prague. Pass the caller's own client: under the service role the
 * function sees no user.
 */
export async function mayViewCity(supabase: unknown, cityId: string): Promise<boolean | null> {
  const { data, error } = await untypedDb(supabase).rpc("has_city_level", {
    p_city_id: cityId,
    p_min_level: "view",
  });
  if (error) {
    console.error("[city-access] has_city_level failed:", error);
    return null;
  }
  return data === true;
}

export async function getUserTeamIds(supabase: SupabaseClient<Database>, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  return (data || []).map((r: any) => r.team_id);
}

/**
 * Read one person's access: the Super Admin switch, the active switch, the
 * money switch and their per-city grants.
 *
 * Lives here rather than inside a single route because more than one route now
 * has to answer "what may this other person do?": the user-history screen and
 * the lists route both need a full Access for somebody who is not the caller.
 *
 * Returns null when either read fails or the profile is missing. A null is a
 * failed lookup, not a refusal: callers must report an error rather than
 * quietly showing an empty screen.
 */
export async function accessFor(
  supabase: unknown,
  userId: string,
): Promise<Access | null> {
  const [{ data: profile, error: profileError }, { data: grants, error: grantsError }] =
    await Promise.all([
      untypedDb(supabase)
        .from("user_profiles")
        .select("is_super_admin, is_active, can_see_financials")
        .eq("id", userId)
        .maybeSingle(),
      untypedDb(supabase)
        .from("user_city_grants")
        .select("city_id, level, receives_alerts, can_train_ai")
        .eq("user_id", userId),
    ]);

  if (profileError || grantsError || !profile) return null;

  return {
    isSuperAdmin: profile.is_super_admin === true,
    // Only an explicit false counts as off, matching the SQL's
    // `IS DISTINCT FROM false`.
    isActive: profile.is_active !== false,
    canSeeFinancials: profile.can_see_financials === true,
    grants: toGrants(grants as CityGrantRow[]),
  };
}

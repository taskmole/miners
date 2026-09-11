import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "./supabase";

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
  | { supabase: SupabaseClient<Database>; userId: string; error?: never }
  | { error: NextResponse; supabase?: never; userId?: never }
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

  return { supabase, userId: user.id };
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

export async function getUserTeamIds(supabase: SupabaseClient<Database>, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  return (data || []).map((r: any) => r.team_id);
}

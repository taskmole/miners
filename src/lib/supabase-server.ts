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

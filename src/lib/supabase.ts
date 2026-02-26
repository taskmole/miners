/**
 * Supabase Browser Client
 *
 * Browser-side Supabase client for the Next.js app.
 * Currently uses anonymous access (public anon key).
 *
 * Migration notes:
 * - When auth is added, this client will automatically handle sessions
 * - The anon key is safe to expose client-side (RLS policies protect data)
 * - For server-side operations, use the data-pipeline client instead
 *
 * Usage:
 *   import { supabase, isSupabaseConfigured } from '@/lib/supabase';
 *
 *   if (isSupabaseConfigured()) {
 *     const { data } = await supabase.from('places').select('*');
 *   }
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables (set in .env.local)
// These are the PUBLIC keys - safe to expose in browser
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Cached client instance
let client: SupabaseClient | null = null;

/**
 * Check if Supabase is configured
 * Use this to gracefully fall back to localStorage when Supabase isn't set up
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Get the Supabase client
 * Throws if not configured - check isSupabaseConfigured() first
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'
    );
  }

  if (!client) {
    client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        // Persist sessions in localStorage
        persistSession: true,
        // Auto-refresh tokens
        autoRefreshToken: true,
        // Detect session from URL (for OAuth callbacks)
        detectSessionInUrl: true,
      },
    });
  }

  return client;
}

/**
 * Convenience export - the client instance
 * Will be null if Supabase isn't configured
 */
export const supabase = isSupabaseConfigured() ? getSupabase() : null;

// ===========================================
// AUTH HELPERS (ready for when auth is added)
// ===========================================

/**
 * Get the current authenticated user
 * Returns null if not logged in or Supabase isn't configured
 */
export async function getCurrentUser() {
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Get the current user's ID
 * Returns null if not logged in
 */
export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null;
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

// ===========================================
// TYPE DEFINITIONS (match database schema)
// ===========================================

/**
 * Database types - generated from schema
 * TODO: Generate these automatically with supabase gen types
 */
export interface Database {
  public: {
    Tables: {
      places: {
        Row: {
          id: string;
          city_id: string | null;
          category_id: string | null;
          source: string;
          source_id: string | null;
          name: string;
          address: string | null;
          location: unknown; // geography type
          metadata: Record<string, unknown> | null;
          photos: string[] | null;
          is_new: boolean;
          status: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['places']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['places']['Insert']>;
      };
      lists: {
        Row: {
          id: string;
          name: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['lists']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['lists']['Insert']>;
      };
      comments: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          created_by: string | null;
          content: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['comments']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['comments']['Insert']>;
      };
      scoring_params: {
        Row: {
          id: string;
          name: string;
          weight: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['scoring_params']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['scoring_params']['Insert']>;
      };
    };
  };
}

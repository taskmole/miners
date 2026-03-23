/**
 * Supabase Helper Utilities
 *
 * Shared utilities for Supabase integration across hooks.
 * Used during the localStorage → Supabase migration.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { getAuthUserId } from './browser-session';

// localStorage key for anonymous user ID
const ANON_USER_KEY = 'miners-anonymous-user-id';

/**
 * Get a stable anonymous user ID
 *
 * Returns a UUID stored in localStorage. If none exists, generates one.
 * This allows tracking user data before authentication is ready.
 *
 * Once auth is implemented, this will be replaced with the real user ID.
 */
export function getAnonymousUserId(): string {
  if (typeof window === 'undefined') {
    // Server-side: return placeholder (won't be used for writes)
    return '00000000-0000-0000-0000-000000000000';
  }

  let userId = localStorage.getItem(ANON_USER_KEY);

  if (!userId) {
    // Generate a new UUID
    userId = crypto.randomUUID();
    localStorage.setItem(ANON_USER_KEY, userId);
  }

  return userId;
}

/**
 * Try Supabase operation, fall back to default on failure
 *
 * Wraps async Supabase calls with graceful fallback.
 * If Supabase isn't configured or the operation fails, returns the fallback value.
 *
 * @param operation - Async function that performs the Supabase operation
 * @param fallback - Value to return if operation fails
 * @param context - Optional context for error logging
 */
export async function withSupabase<T>(
  operation: () => Promise<T>,
  fallback: T,
  context?: string
): Promise<T> {
  if (!isSupabaseConfigured() || !supabase) {
    return fallback;
  }

  try {
    return await operation();
  } catch (error) {
    console.error(`Supabase error${context ? ` (${context})` : ''}:`, error);
    return fallback;
  }
}

/**
 * Log an activity to the activity_log table.
 * Only writes for authenticated users (skips anonymous).
 * Fire-and-forget — does not block the calling action.
 */
export function logActivity(
  actionType: string,
  summary: Record<string, unknown>
): void {
  const userId = getAuthUserId();
  if (!userId || !isSupabaseConfigured() || !supabase) return;

  supabase
    .from('activity_log')
    .insert({
      user_id: userId,
      action_type: actionType,
      summary: JSON.stringify(summary),
      created_at: new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.error('[activity_log] insert error:', error);
    });
}

/**
 * Log Supabase errors consistently
 */
export function handleSupabaseError(
  error: unknown,
  context: string
): void {
  console.error(`[Supabase] ${context}:`, error);
}

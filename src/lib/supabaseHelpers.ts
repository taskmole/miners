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
 * Retry a Supabase operation up to maxRetries times with increasing delay.
 * Returns the result on success, or throws after all retries are exhausted.
 *
 * @param operation - Async function to retry
 * @param context - Label for error logging
 * @param maxRetries - Number of retry attempts (default 2)
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  context?: string,
  maxRetries = 2
): Promise<T> {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase not configured');
  }

  const delays = [200, 500, 1000];
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = delays[attempt] || 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        console.warn(`[withRetry] ${context || 'operation'} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`);
      }
    }
  }

  console.error(`[withRetry] ${context || 'operation'} failed after ${maxRetries + 1} attempts:`, lastError);
  throw lastError;
}

/**
 * Migrate anonymous user data to authenticated user ID.
 * Calls a Supabase RPC function that re-tags all rows in a single transaction.
 * Only runs once per browser (uses localStorage flag).
 */
export async function migrateAnonymousData(authUserId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  if (typeof window === 'undefined') return;

  const migrated = localStorage.getItem('miners-anon-migrated');
  if (migrated) return;

  const anonId = localStorage.getItem(ANON_USER_KEY);
  if (!anonId) {
    localStorage.setItem('miners-anon-migrated', 'true');
    return;
  }

  // Skip if anon ID matches auth ID (no migration needed)
  if (anonId === authUserId) {
    localStorage.setItem('miners-anon-migrated', 'true');
    return;
  }

  try {
    const { error } = await supabase.rpc('migrate_anonymous_user', {
      anon_id: anonId,
      auth_id: authUserId,
    });

    if (error) {
      console.error('[migrateAnonymousData] RPC failed:', error);
      return;
    }

    localStorage.setItem('miners-anon-migrated', 'true');
  } catch (error) {
    console.error('[migrateAnonymousData] unexpected error:', error);
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

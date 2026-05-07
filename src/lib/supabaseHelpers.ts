/**
 * Supabase Helper Utilities
 *
 * migrateAnonymousData: re-tags anonymous rows on login (uses Supabase RPC directly).
 * logActivity: fire-and-forget activity logging via server API route.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { getAuthUserId } from './browser-session';
import { apiFetch } from './api-client';

// localStorage key for anonymous user ID (legacy, kept for migration)
const ANON_USER_KEY = 'miners-anonymous-user-id';

/**
 * Migrate anonymous user data to authenticated user ID.
 * Calls a Supabase RPC function that re-tags all rows in a single transaction.
 * Runs on every login to catch data created between sessions on different devices.
 */
export async function migrateAnonymousData(authUserId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  if (typeof window === 'undefined') return;

  // Collect all local IDs that might have been used to tag data
  const idsToMigrate = new Set<string>();

  const anonId = localStorage.getItem(ANON_USER_KEY);
  if (anonId && anonId !== authUserId) idsToMigrate.add(anonId);

  const sessionId = localStorage.getItem('miners-browser-session-id');
  if (sessionId && sessionId !== authUserId) idsToMigrate.add(sessionId);

  if (idsToMigrate.size === 0) return;

  // Migrate each anonymous ID to the auth user ID
  for (const oldId of idsToMigrate) {
    try {
      const { error } = await supabase.rpc('migrate_anonymous_user', {
        anon_id: oldId,
      });

      if (error) {
        console.error('[migrateAnonymousData] RPC failed for', oldId, ':', error);
      }
    } catch (error) {
      console.error('[migrateAnonymousData] unexpected error:', error);
    }
  }
}

/**
 * Log an activity to the activity_log table via the server API route.
 * Only writes for authenticated users (skips anonymous).
 * Fire-and-forget: does not block the calling action.
 */
export function logActivity(
  actionType: string,
  summary: Record<string, unknown>
): void {
  const userId = getAuthUserId();
  if (!userId) return;

  apiFetch('/api/db/activity-log', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      action_type: actionType,
      summary: JSON.stringify(summary),
      created_at: new Date().toISOString(),
    }),
  }).catch((error) => {
    console.error('[activity_log] insert error:', error);
  });
}


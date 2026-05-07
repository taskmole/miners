import { supabase, isSupabaseConfigured } from './supabase';
import { getAuthUserId } from './browser-session';
import { apiFetch } from './api-client';

const ANON_USER_KEY = 'miners-anonymous-user-id';

// Re-tags anonymous rows on login via Supabase RPC
export async function migrateAnonymousData(authUserId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  if (typeof window === 'undefined') return;

  const idsToMigrate = new Set<string>();

  const anonId = localStorage.getItem(ANON_USER_KEY);
  if (anonId && anonId !== authUserId) idsToMigrate.add(anonId);

  const sessionId = localStorage.getItem('miners-browser-session-id');
  if (sessionId && sessionId !== authUserId) idsToMigrate.add(sessionId);

  if (idsToMigrate.size === 0) return;

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

// Fire-and-forget activity logging (skips anonymous users)
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


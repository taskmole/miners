/**
 * POI Comments Types
 *
 * Supabase-ready structure matching the 'comments' table schema.
 * Currently uses localStorage for prototype, will migrate to Supabase.
 *
 * Supabase migration notes:
 * - entityId will become UUID reference to places.id
 * - createdBy will reference auth.users.id
 * - localStorage replaced by Supabase queries:
 *   - supabase.from('comments').select().eq('entity_type', 'place').eq('entity_id', placeId)
 *   - supabase.from('comments').insert({ entity_type: 'place', entity_id, content, created_by })
 */

// Comment structure - matches Supabase 'comments' table
export interface PoiComment {
  id: string;           // UUID in Supabase, generated ID locally
  entityType: 'place';  // Will support 'place' | 'area' | 'pitch' in full version
  entityId: string;     // UUID in Supabase, placeId string locally
  content: string;      // Maps to 'content' column
  createdBy: string;    // UUID in Supabase, 'guest' locally
  authorName: string;   // Denormalized for display (joined from users table in Supabase)
  createdAt: string;    // ISO timestamp
}

// localStorage structure (prototype)
export interface PoiCommentsState {
  version: number;
  comments: Record<string, PoiComment[]>;  // entityId → comments
}

// Storage constants
export const POI_COMMENTS_STORAGE_KEY = 'miners-poi-comments';
export const POI_COMMENTS_VERSION = 1;

/**
 * Format timestamp as relative time (e.g., "2h ago", "just now")
 */
export function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 4) return `${diffWeek}w ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;

  // For older dates, show the actual date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

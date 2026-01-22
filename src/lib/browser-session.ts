/**
 * Browser Session Utility
 *
 * Provides a unique identifier for each browser to track shape ownership.
 * When Supabase auth is added, getCurrentUserId() will return the real user ID.
 */

const SESSION_STORAGE_KEY = 'miners-browser-session-id';

/**
 * Get or create a unique browser session ID
 * This ID persists across page reloads but is unique per browser
 */
export function getBrowserSessionId(): string {
  // Check if we already have a session ID
  const existing = localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  // Generate a new UUID
  const newId = crypto.randomUUID();
  localStorage.setItem(SESSION_STORAGE_KEY, newId);
  return newId;
}

/**
 * Get the current user ID
 * Returns browser session ID for now.
 * After Supabase migration: return actual user ID from auth
 */
export function getCurrentUserId(): string {
  // TODO: After Supabase auth is added, replace with:
  // const { data: { user } } = await supabase.auth.getUser();
  // return user?.id ?? getBrowserSessionId();
  return getBrowserSessionId();
}

/**
 * Check if the current user can edit a shape
 * @param createdBy - The user ID who created the shape (undefined for legacy shapes)
 * @returns true if the current user can edit the shape
 */
export function canEditShape(createdBy: string | undefined): boolean {
  // Legacy shapes (no createdBy) are editable by anyone
  if (!createdBy) {
    return true;
  }

  // Check if current user is the author
  const currentUser = getCurrentUserId();
  if (createdBy === currentUser) {
    return true;
  }

  // TODO: After Supabase auth is added, add admin check:
  // const isAdmin = await checkUserRole('admin');
  // if (isAdmin) return true;

  return false;
}

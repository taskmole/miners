/**
 * Browser Session Utility
 *
 * Provides a unique identifier for each browser to track shape ownership.
 * Uses Supabase user ID when logged in, falls back to browser session for demo mode.
 */

const SESSION_STORAGE_KEY = 'miners-browser-session-id';
const AUTH_USER_ID_KEY = 'miners-auth-user-id';

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
 * Set the authenticated user ID (called when user signs in)
 */
export function setAuthUserId(userId: string | null): void {
  if (userId) {
    localStorage.setItem(AUTH_USER_ID_KEY, userId);
  } else {
    localStorage.removeItem(AUTH_USER_ID_KEY);
  }
}

/**
 * Get the authenticated user ID (if logged in)
 */
export function getAuthUserId(): string | null {
  return localStorage.getItem(AUTH_USER_ID_KEY);
}

/**
 * Get the current user ID
 * Returns Supabase user ID if logged in, otherwise browser session ID
 */
export function getCurrentUserId(): string {
  // Check for authenticated user first
  const authUserId = getAuthUserId();
  if (authUserId) {
    return authUserId;
  }
  // Fall back to browser session for demo mode
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

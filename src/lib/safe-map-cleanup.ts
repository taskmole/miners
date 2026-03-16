/**
 * Safely run map cleanup code. Use this in useEffect cleanup functions
 * to prevent crashes when navigating away from the map page.
 *
 * Extracted into its own module (no maplibre-gl dependency) so it's
 * always available even if the heavy map module hasn't loaded yet.
 */
export function safeMapCleanup(map: any, fn: (map: any) => void) {
  try {
    if (map) fn(map);
  } catch {
    // Map was destroyed during navigation - safe to ignore
  }
}

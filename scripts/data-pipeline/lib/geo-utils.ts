/**
 * Geographic Utilities
 *
 * Functions for calculating distances between coordinates
 * Used for deduplication (checking if two places are within X meters)
 */

const EARTH_RADIUS_METERS = 6371000;

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in meters
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Check if two points are within a given distance (meters)
 */
export function isWithinDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  thresholdMeters: number
): boolean {
  return haversineDistance(lat1, lon1, lat2, lon2) <= thresholdMeters;
}

/**
 * Find nearby items within a threshold distance
 * Returns indices of items that are within threshold
 */
export function findNearbyIndices(
  targetLat: number,
  targetLon: number,
  items: Array<{ lat: number; lon: number }>,
  thresholdMeters: number
): number[] {
  const nearby: number[] = [];

  for (let i = 0; i < items.length; i++) {
    if (isWithinDistance(targetLat, targetLon, items[i].lat, items[i].lon, thresholdMeters)) {
      nearby.push(i);
    }
  }

  return nearby;
}

/**
 * Default proximity threshold for deduplication (50 meters)
 * Same building/location can have slightly different GPS coordinates
 */
export const DEFAULT_PROXIMITY_THRESHOLD = 50;

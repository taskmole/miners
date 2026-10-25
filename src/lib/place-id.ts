export function hashUrl(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The `places.source` values that are property listings, and only them.
 * `places` also holds cafes, gyms and hand-added Miners locations; counting
 * those as properties would put 400 gyms in a report about scouting.
 */
export const PROPERTY_SOURCES = ["idealista", "idealista_transfer", "sreality"];

export function generatePropertyPlaceId(property: {
  latitude: number;
  longitude: number;
  url: string;
}): string {
  return `property-${property.latitude.toFixed(5)}-${property.longitude.toFixed(5)}-${hashUrl(property.url)}`;
}

/**
 * True for the id of a property listing (see generatePropertyPlaceId). Any
 * case, because parseCoordinatesFromPlaceId accepts any case too.
 */
export function isPropertyPlaceId(placeId: string): boolean {
  return /^property-/i.test(placeId);
}

export function generatePlaceId(
  type: string,
  lat: number,
  lon: number,
): string {
  return `${type}-${lat.toFixed(5)}-${lon.toFixed(5)}`;
}

/** The in-app deep link that opens a place's card: emails and share links. */
export function focusPath(placeId: string): string {
  return `/?focus=${encodeURIComponent(placeId)}`;
}

/** A place id's type, latitude, longitude and optional hash. Shared with the map head script. */
export const PLACE_ID_COORDS_RE = /^[a-z_]+-(-?\d+\.?\d*)-(-?\d+\.?\d*)(?:-[0-9a-f]+)?$/i;

export function parseCoordinatesFromPlaceId(
  placeId: string,
): { lat: number; lon: number } | null {
  const match = placeId.match(PLACE_ID_COORDS_RE);
  if (match) {
    return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
  }
  return null;
}

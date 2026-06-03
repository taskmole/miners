function hashUrl(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function generatePropertyPlaceId(property: {
  latitude: number;
  longitude: number;
  url: string;
}): string {
  return `property-${property.latitude.toFixed(5)}-${property.longitude.toFixed(5)}-${hashUrl(property.url)}`;
}

export function generatePlaceId(
  type: string,
  lat: number,
  lon: number,
): string {
  return `${type}-${lat.toFixed(5)}-${lon.toFixed(5)}`;
}

export function parseCoordinatesFromPlaceId(
  placeId: string,
): { lat: number; lon: number } | null {
  const match = placeId.match(
    /^[a-z_]+-(-?\d+\.?\d*)-(-?\d+\.?\d*)(?:-[0-9a-f]+)?$/i,
  );
  if (match) {
    return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
  }
  return null;
}

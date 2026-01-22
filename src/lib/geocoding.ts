/**
 * Reverse geocoding helper using Nominatim (OpenStreetMap)
 * Ported from index.html legacy implementation
 */

/**
 * Convert coordinates to a street address using Nominatim API
 * @param lat Latitude
 * @param lon Longitude
 * @returns Address string, or coordinates as fallback if geocoding fails
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    // Add a small delay to respect rate limits (Nominatim asks for max 1 req/sec)
    await new Promise(resolve => setTimeout(resolve, 200));

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'MinersLocationScout/1.0'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.display_name) {
      return data.display_name;
    } else {
      return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    }
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    // Fallback to coordinates
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }
}

/**
 * Format a full address to show only the first 3 parts (street-level)
 * e.g., "Calle Gran Via 12, Centro, Madrid, Spain" -> "Calle Gran Via 12, Centro, Madrid"
 */
export function formatShortAddress(fullAddress: string): string {
  const parts = fullAddress.split(',').map(p => p.trim());
  return parts.slice(0, 3).join(', ');
}

/**
 * City Configuration for Data Pipeline
 *
 * Add new cities here. Each city needs:
 * - name: Display name
 * - bounds: Bounding box for Google Places search
 * - idealistaArea: Area code for Idealista (null if not supported)
 * - euCoffeeTripSlug: URL slug for EU Coffee Trip (null if not supported)
 */

export interface CityBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface CityConfig {
  name: string;
  bounds: CityBounds;
  idealistaArea: string | null;
  euCoffeeTripSlug: string | null;
}

export const CITIES: Record<string, CityConfig> = {
  madrid: {
    name: "Madrid",
    bounds: {
      south: 40.30,
      north: 40.55,
      west: -3.85,
      east: -3.55,
    },
    idealistaArea: "madrid",
    euCoffeeTripSlug: "madrid",
  },
  barcelona: {
    name: "Barcelona",
    bounds: {
      south: 41.32,
      north: 41.47,
      west: 2.05,
      east: 2.23,
    },
    idealistaArea: "barcelona",
    euCoffeeTripSlug: "barcelona",
  },
  prague: {
    name: "Prague",
    bounds: {
      south: 50.00,
      north: 50.15,
      west: 14.30,
      east: 14.55,
    },
    idealistaArea: null, // Idealista not available in Prague
    euCoffeeTripSlug: "prague",
  },
  // Add more cities below:
  // vienna: {
  //   name: "Vienna",
  //   bounds: { south: 48.10, north: 48.32, west: 16.18, east: 16.58 },
  //   idealistaArea: null,
  //   euCoffeeTripSlug: "vienna",
  // },
};

/**
 * Get list of city IDs
 */
export function getCityIds(): string[] {
  return Object.keys(CITIES);
}

/**
 * Get city config by ID
 */
export function getCity(cityId: string): CityConfig | undefined {
  return CITIES[cityId];
}

/**
 * Check if city has Idealista support
 */
export function hasIdealistaSupport(cityId: string): boolean {
  const city = CITIES[cityId];
  return city ? city.idealistaArea !== null : false;
}

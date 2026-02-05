/**
 * Category Mapping
 *
 * Maps data source types to our internal category system
 * Categories are auto-assigned during import
 */

// Our internal category names (must match database categories table)
export const CATEGORIES = {
  EU_COFFEE_TRIP: "EU Coffee Trip",
  REGULAR_CAFE: "Regular Cafe",
  THE_MINERS: "The Miners",
  PROPERTY: "Property",
  TRANSIT_STATION: "Transit Station",
  OFFICE_CENTER: "Office Center",
  SHOPPING_CENTER: "Shopping Center",
  HIGH_STREET: "High Street",
  UNIVERSITY: "University",
  STUDENT_DORM: "Student Dorm",
  NEW_DEVELOPMENT: "New Development",
  GYM: "Gym",
} as const;

// Google Places primaryType → our category
const GOOGLE_TYPE_MAPPING: Record<string, string> = {
  coffee_shop: CATEGORIES.REGULAR_CAFE,
  cafe: CATEGORIES.REGULAR_CAFE,
  cafeteria: CATEGORIES.REGULAR_CAFE,
  espresso_bar: CATEGORIES.REGULAR_CAFE,
  brunch_restaurant: CATEGORIES.REGULAR_CAFE,
  bakery: CATEGORIES.REGULAR_CAFE,
  restaurant: CATEGORIES.REGULAR_CAFE,
  gym: CATEGORIES.GYM,
  fitness_center: CATEGORIES.GYM,
};

/**
 * Get category for a Google Places result
 */
export function getCategoryForGooglePlace(primaryType: string): string {
  return GOOGLE_TYPE_MAPPING[primaryType] || CATEGORIES.REGULAR_CAFE;
}

/**
 * Get category for EU Coffee Trip cafes
 */
export function getCategoryForEUCT(): string {
  return CATEGORIES.EU_COFFEE_TRIP;
}

/**
 * Get category for Idealista properties
 */
export function getCategoryForIdealista(): string {
  return CATEGORIES.PROPERTY;
}

/**
 * Data source identifiers
 */
export const SOURCES = {
  GOOGLE_PLACES: "google_places",
  EU_COFFEE_TRIP: "eu_coffee_trip",
  IDEALISTA: "idealista",
  OSM: "osm",
  USER: "user",
} as const;

/**
 * Get the appropriate source string for a data source
 */
export function getSourceString(
  source: "google" | "euct" | "idealista" | "osm" | "user"
): string {
  switch (source) {
    case "google":
      return SOURCES.GOOGLE_PLACES;
    case "euct":
      return SOURCES.EU_COFFEE_TRIP;
    case "idealista":
      return SOURCES.IDEALISTA;
    case "osm":
      return SOURCES.OSM;
    case "user":
      return SOURCES.USER;
    default:
      return SOURCES.USER;
  }
}

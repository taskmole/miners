/**
 * Google regular-cafe refresh: merge logic.
 *
 * Kept free of network and file access so it can be unit tested.
 * The script itself lives in ../refresh-google-cafes.ts.
 */

import { haversineDistance } from "./geo-utils";
import { nameSimilarity } from "./address-utils";
import { getCategoryForGooglePlace } from "./categories";
import type { CityBounds } from "../config/cities";

/** Column order of public/data/google_places_<city>.csv. The map reads these names. */
export const GOOGLE_COLUMNS = [
  "name",
  "address",
  "lat",
  "lon",
  "rating",
  "reviewCount",
  "website",
  "openingHours",
  "source_id",
  "category",
  "primaryType",
  // First time the cafe was seen. Drives the map's 30-day "new" count, so a refresh never touches it.
  "fetchedAt",
  "googleMapsUrl",
  "priceRange",
  // Last time Google's details were re-read. Drives the popup's "Updated X ago" badge.
  "refreshedAt",
] as const;
export type GoogleRow = Record<(typeof GOOGLE_COLUMNS)[number], string>;

/** Column order of the coffee-trip enrichment files (Google details for coffee-trip pins). */
export const ENRICHMENT_COLUMNS = [
  "euct_name",
  "euct_lat",
  "euct_lon",
  "gp_rating",
  "gp_reviewCount",
  "gp_website",
  "gp_openingHours",
  "gp_source_id",
  "gp_google_maps_url",
  "gp_priceRange",
] as const;
export type EnrichmentRow = Record<(typeof ENRICHMENT_COLUMNS)[number], string>;

/** Fields asked of Google, all in the same price tier as rating and hours. */
const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "primaryType",
  "websiteUri",
  "regularOpeningHours",
  "businessStatus",
  "priceLevel",
  "priceRange",
];

/** Text Search field mask. */
export const SEARCH_FIELD_MASK = [...PLACE_FIELDS.map((f) => `places.${f}`), "nextPageToken"].join(",");

/** The same fields for a one-place lookup, which takes them without the "places." prefix. */
export const DETAILS_FIELD_MASK = PLACE_FIELDS.join(",");

interface Money {
  currencyCode?: string;
  units?: string;
}

export interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  businessStatus?: string;
  priceLevel?: string;
  priceRange?: { startPrice?: Money; endPrice?: Money };
}

/** Answer to "does this one place still exist?" for a cafe the search missed. */
export interface PlaceCheck {
  status: "open" | "closed" | "gone" | "failed";
  /** Google's current details (its id may differ from the one we stored). */
  place?: GooglePlace;
}

/** A coffee-trip pin, with its coordinates exactly as written in its file. */
export interface CoffeeTripCafe {
  name: string;
  latitude: string;
  longitude: string;
}

/**
 * Google types a new search hit must have to become a pin. The "specialty
 * coffee" search also returns supermarkets, donut chains, bars, bakeries and
 * ice-cream shops, which would bury the real competitors. Cafes already on
 * the map are never filtered.
 */
export const CAFE_TYPES = new Set(["coffee_shop", "cafe", "cafeteria", "coffee_roastery", "coffee_stand"]);

/** Miners cafes come from the database; a Google copy would put a second pin on them. */
const MINERS_NAME = /\bminers\b/i;

/** A cafe Google lost under its old id, found again this close by, is the same cafe. */
export const RELINK_MAX_METRES = 30;
const RELINK_MIN_NAME_SIMILARITY = 0.5;

/** Safety stop: never remove more than this share of a city's cafes in one run. */
export const MAX_REMOVED_RATIO = 0.15;

/**
 * More new cafes than this share of a city in one run is the search catching up
 * (like the first run with split squares), not new openings.
 */
const CATCH_UP_RATIO = 0.25;

const PRICE_LEVEL_WORDS: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: "Cheap",
  PRICE_LEVEL_MODERATE: "Moderate",
  PRICE_LEVEL_EXPENSIVE: "Pricey",
  PRICE_LEVEL_VERY_EXPENSIVE: "Very pricey",
};

const PREFIX_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };
const SUFFIX_SYMBOLS: Record<string, string> = { CZK: "Kč", PLN: "zł", HUF: "Ft" };

/** Google's price as shown in the popup: "€1–10", "100–200 Kč", "€20+", or a word. */
export function formatPrice(place: Pick<GooglePlace, "priceRange" | "priceLevel">): string {
  const start = place.priceRange?.startPrice;
  const end = place.priceRange?.endPrice;
  if (start?.units) {
    const code = start.currencyCode ?? "";
    const amount = end?.units ? `${start.units}–${end.units}` : `${start.units}+`;
    if (PREFIX_SYMBOLS[code]) return `${PREFIX_SYMBOLS[code]}${amount}`;
    return `${amount} ${SUFFIX_SYMBOLS[code] ?? code}`.trim();
  }
  return PRICE_LEVEL_WORDS[place.priceLevel ?? ""] ?? "";
}

export function googleMapsUrl(placeId: string): string {
  return `https://www.google.com/maps/search/?api=1&query=place&query_place_id=${placeId}`;
}

/** A row with every column present and empty. */
function blankRow<C extends string>(columns: readonly C[]): Record<C, string> {
  return Object.fromEntries(columns.map((c) => [c, ""])) as Record<C, string>;
}

/** Google's latest details, written over a row. Position and "first seen" are left alone. */
function refreshRow(row: GoogleRow, place: GooglePlace, now: string): GoogleRow {
  return {
    ...row,
    name: place.displayName?.text || row.name,
    address: place.formattedAddress || row.address,
    rating: place.rating !== undefined ? String(place.rating) : row.rating,
    reviewCount: place.userRatingCount !== undefined ? String(place.userRatingCount) : row.reviewCount,
    website: place.websiteUri ?? row.website,
    openingHours: place.regularOpeningHours?.weekdayDescriptions?.join("; ") ?? row.openingHours,
    source_id: place.id,
    primaryType: place.primaryType ?? row.primaryType,
    googleMapsUrl: googleMapsUrl(place.id),
    priceRange: formatPrice(place) || row.priceRange,
    refreshedAt: now,
  };
}

function newRow(place: GooglePlace, now: string): GoogleRow {
  return refreshRow(
    {
      ...blankRow(GOOGLE_COLUMNS),
      lat: String(place.location!.latitude),
      lon: String(place.location!.longitude),
      category: getCategoryForGooglePlace(place.primaryType ?? ""),
      fetchedAt: now,
    },
    place,
    now
  );
}

function refreshEnrichment(row: EnrichmentRow, place: GooglePlace): EnrichmentRow {
  return {
    ...row,
    gp_rating: place.rating !== undefined ? String(place.rating) : row.gp_rating,
    gp_reviewCount: place.userRatingCount !== undefined ? String(place.userRatingCount) : row.gp_reviewCount,
    gp_website: place.websiteUri ?? row.gp_website,
    gp_openingHours: place.regularOpeningHours?.weekdayDescriptions?.join("; ") ?? row.gp_openingHours,
    gp_source_id: place.id,
    gp_google_maps_url: googleMapsUrl(place.id),
    gp_priceRange: formatPrice(place) || row.gp_priceRange,
  };
}

/** Same rounding the map uses to pair an enrichment row with its coffee-trip pin. */
export function coffeeTripKey(lat: string | number, lon: string | number): string {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

/**
 * The coffee-trip cafe a Google result is, if any. A name match is required:
 * a different cafe in the same building stays a regular cafe of its own.
 */
export function findCoffeeTripMatch(
  place: { name: string; lat: number; lon: number },
  coffeeTrip: CoffeeTripCafe[]
): CoffeeTripCafe | null {
  for (const cafe of coffeeTrip) {
    const metres = haversineDistance(place.lat, place.lon, Number(cafe.latitude), Number(cafe.longitude));
    const similarity = nameSimilarity(place.name, cafe.name);
    if ((metres <= 50 && similarity >= 0.5) || (metres <= 100 && similarity >= 0.7)) return cafe;
  }
  return null;
}

export interface GoogleMergeStats {
  refreshed: number;
  /** Missed by the search, refreshed from the one-place lookup instead. */
  refreshedByLookup: number;
  /** Missed by the search, but Google says they're still there. */
  keptUnseen: number;
  added: string[];
  removed: string[];
  relinked: string[];
  coffeeTripUpdated: number;
  coffeeTripAdded: string[];
  /** New hits left out for not being a cafe, counted by Google type. */
  skippedTypes: Record<string, number>;
}

export interface GoogleMergeInput {
  existing: GoogleRow[];
  /** This run's search results, one per id. */
  found: GooglePlace[];
  /** Answers for existing cafes the search missed, by stored id. */
  checks: Map<string, PlaceCheck>;
  coffeeTrip: CoffeeTripCafe[];
  enrichment: EnrichmentRow[];
  now: string;
}

/**
 * Build the new city and enrichment files.
 *
 * Map pins, comments, lists, hidden pins and share links are keyed by a
 * cafe's coordinates, so an existing cafe never moves, even when Google
 * gives it a new id. A cafe the search missed is only removed when Google
 * confirms it closed for good or no longer exists.
 */
export function mergeGoogleCity(input: GoogleMergeInput): {
  rows: GoogleRow[];
  enrichment: EnrichmentRow[];
  stats: GoogleMergeStats;
} {
  const { existing, found, checks, coffeeTrip, enrichment, now } = input;
  const stats: GoogleMergeStats = {
    refreshed: 0,
    refreshedByLookup: 0,
    keptUnseen: 0,
    added: [],
    removed: [],
    relinked: [],
    coffeeTripUpdated: 0,
    coffeeTripAdded: [],
    skippedTypes: {},
  };

  const foundById = new Map(found.map((p) => [p.id, p]));
  // Ids already spoken for: by a pin, or by a coffee-trip cafe's details.
  const claimed = new Set([...existing.map((r) => r.source_id), ...enrichment.map((e) => e.gp_source_id)]);
  const isClosed = (p: GooglePlace) => p.businessStatus === "CLOSED_PERMANENTLY";

  // 1. Existing cafes. `null` marks a removal; "gone" ones wait for step 2.
  const lost: number[] = [];
  const rows: (GoogleRow | null)[] = existing.map((row, i) => {
    const seen = foundById.get(row.source_id);
    if (seen) {
      if (isClosed(seen)) return null;
      stats.refreshed++;
      return refreshRow(row, seen, now);
    }

    const check = checks.get(row.source_id);
    if (check?.status === "closed") return null;
    if (check?.status === "gone") {
      lost.push(i);
      return row;
    }

    // Still there, or the check failed: keep. Refresh from the lookup, adopting
    // Google's new id unless another pin has it.
    stats.keptUnseen++;
    const place = check?.place;
    if (!place?.id) return row;
    if (place.id !== row.source_id) {
      if (claimed.has(place.id)) return row;
      claimed.add(place.id);
    }
    stats.refreshedByLookup++;
    return refreshRow(row, place, now);
  });

  // Unclaimed, open search hits: candidates for relinks and additions.
  const fresh = found.filter((p) => !claimed.has(p.id) && !isClosed(p) && p.location);

  // 2. Lost ids: the same cafe under a new id close by, or really gone.
  for (const i of lost) {
    const row = existing[i];
    const match = fresh.find(
      (p) =>
        !claimed.has(p.id) &&
        haversineDistance(Number(row.lat), Number(row.lon), p.location!.latitude, p.location!.longitude) <=
          RELINK_MAX_METRES &&
        nameSimilarity(row.name, p.displayName?.text ?? "") >= RELINK_MIN_NAME_SIMILARITY
    );
    if (match) {
      claimed.add(match.id);
      rows[i] = refreshRow(row, match, now);
      stats.relinked.push(`${row.name} -> ${match.displayName?.text ?? match.id}`);
    } else {
      rows[i] = null;
    }
  }

  existing.forEach((row, i) => {
    if (rows[i] === null) stats.removed.push(row.name);
  });

  // 3. Coffee-trip details, refreshed by id. Never deleted.
  const nextEnrichment = enrichment.map((row) => {
    const place = foundById.get(row.gp_source_id);
    if (!place) return row;
    stats.coffeeTripUpdated++;
    return refreshEnrichment(row, place);
  });
  const enrichedPins = new Set(nextEnrichment.map((e) => coffeeTripKey(e.euct_lat, e.euct_lon)));

  // 4. New search hits: a coffee-trip cafe's details, or a new regular cafe.
  const added: GoogleRow[] = [];
  for (const place of fresh) {
    if (claimed.has(place.id)) continue;
    claimed.add(place.id);

    const name = place.displayName?.text ?? "";
    const match = findCoffeeTripMatch(
      { name, lat: place.location!.latitude, lon: place.location!.longitude },
      coffeeTrip
    );
    if (match) {
      // One row per coffee-trip cafe: a pin that already has details keeps them.
      const key = coffeeTripKey(match.latitude, match.longitude);
      if (!enrichedPins.has(key)) {
        enrichedPins.add(key);
        nextEnrichment.push(
          refreshEnrichment(
            { ...blankRow(ENRICHMENT_COLUMNS), euct_name: match.name, euct_lat: match.latitude, euct_lon: match.longitude },
            place
          )
        );
        stats.coffeeTripAdded.push(match.name);
      }
      continue;
    }

    if (MINERS_NAME.test(name)) continue;
    const type = place.primaryType ?? "unknown";
    if (!CAFE_TYPES.has(type)) {
      stats.skippedTypes[type] = (stats.skippedTypes[type] ?? 0) + 1;
      continue;
    }
    added.push(newRow(place, now));
    stats.added.push(`${name} (${type})`);
  }

  return {
    rows: [...rows.filter((r): r is GoogleRow => r !== null), ...added],
    enrichment: nextEnrichment,
    stats,
  };
}

/** An area cut into a size x size grid of equal search squares. */
export function gridCells(bounds: CityBounds, size: number): CityBounds[] {
  const latStep = (bounds.north - bounds.south) / size;
  const lonStep = (bounds.east - bounds.west) / size;
  const cells: CityBounds[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      cells.push({
        south: bounds.south + row * latStep,
        north: bounds.south + (row + 1) * latStep,
        west: bounds.west + col * lonStep,
        east: bounds.west + (col + 1) * lonStep,
      });
    }
  }
  return cells;
}

/** True when a run's new cafes are a catch-up batch: shown on the map, not emailed as new. */
export function isCatchUp(existingCount: number, addedCount: number): boolean {
  return addedCount > existingCount * CATCH_UP_RATIO;
}

/** Reason to leave a city's files untouched, or null when the run looks healthy. */
export function checkGoogleSafety(existingCount: number, foundCount: number, removedCount: number): string | null {
  if (foundCount === 0) return "Google returned no cafes";
  if (existingCount > 0 && removedCount / existingCount > MAX_REMOVED_RATIO) {
    return `${removedCount} of ${existingCount} cafes would be removed (limit ${MAX_REMOVED_RATIO * 100}%)`;
  }
  return null;
}

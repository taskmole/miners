/**
 * Idealista Scraper Configuration
 *
 * Per-city search filters, proxy settings, and extraction patterns.
 * To change what the scraper fetches, edit the filter config here.
 */

// ---------------------------------------------------------------------------
// Per-city search filters
// ---------------------------------------------------------------------------

export interface IdealistaFilters {
  maxSqm: number;
  propertyType: string;       // "locales" = commercial premises
  streetLevel: boolean;       // "en-planta-calle"
  rentalOnly: boolean;        // "alquiler-solo-inmueble"
  useTypes: string[];         // "restauracion", "tienda", etc. (empty = any)
}

const DEFAULT_FILTERS: IdealistaFilters = {
  maxSqm: 500,
  propertyType: "locales",
  streetLevel: true,
  rentalOnly: true,
  useTypes: [
    "locales-fiesta",
    "restauracion",
    "comercio-alimentacion",
    "tienda",
    "estetica-belleza",
  ],
};

export const CITY_FILTERS: Record<string, IdealistaFilters> = {
  madrid: DEFAULT_FILTERS,
  barcelona: DEFAULT_FILTERS,
};

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

function buildFilterSegment(filters: IdealistaFilters): string {
  const parts: string[] = [];
  parts.push(`con-metros-cuadrados-menos-de_${filters.maxSqm}`);
  parts.push(filters.propertyType);
  if (filters.streetLevel) parts.push("en-planta-calle");
  if (filters.rentalOnly) parts.push("alquiler-solo-inmueble");
  if (filters.useTypes.length > 0) parts.push(...filters.useTypes);
  return parts.join(",");
}

/**
 * Build the Idealista search URL for a given city area and page.
 * Example output:
 *   https://www.idealista.com/en/alquiler-locales/madrid-madrid/con-metros-cuadrados-menos-de_500,...
 */
export function buildSearchUrl(
  cityArea: string,
  page: number,
  filters: IdealistaFilters
): string {
  const base = `https://www.idealista.com/en/alquiler-locales/${cityArea}-${cityArea}/${buildFilterSegment(filters)}`;
  if (page <= 1) return base + "/";
  return `${base}/pagina-${page}.htm`;
}

/**
 * Get filters for a city, falling back to Madrid defaults.
 */
export function getFiltersForCity(cityId: string): IdealistaFilters {
  return CITY_FILTERS[cityId] ?? CITY_FILTERS.madrid;
}

// ---------------------------------------------------------------------------
// Proxy configuration
// ---------------------------------------------------------------------------

export const PROXY_CONFIG = {
  url: "https://magic.xhr.dev",
  searchTimeoutMs: 30_000,
  detailTimeoutMs: 30_000,
  maxRetries: 3,
  backoffMs: [2_000, 4_000, 8_000],
  maxSearchPages: 34,
  delayBetweenSearchPagesMs: 5_000,
  delayBetweenDetailPagesMs: 2_000,
  detailBatchSizes: [40, 55, 45, 60] as readonly number[],
  detailBatchPausesMs: [[38_000, 48_000], [78_000, 95_000]] as readonly (readonly number[])[],
  circuitBreakerThreshold: 5,
  circuitBreakerPauseMs: 120_000,
} as const;

// ---------------------------------------------------------------------------
// Coordinate validation (Spain / Portugal / Iberian peninsula)
// ---------------------------------------------------------------------------

export interface CoordRange {
  lat: { min: number; max: number };
  lon: { min: number; max: number };
}

export const COORD_RANGES: Record<string, CoordRange> = {
  spain: { lat: { min: 35, max: 44 }, lon: { min: -10, max: 5 } },
};

export function isValidCoordinate(
  lat: number,
  lon: number,
  range: CoordRange = COORD_RANGES.spain
): boolean {
  return (
    lat > range.lat.min &&
    lat < range.lat.max &&
    lon > range.lon.min &&
    lon < range.lon.max
  );
}

// ---------------------------------------------------------------------------
// Listing ID extraction (from Idealista detail page URL)
// ---------------------------------------------------------------------------

const LISTING_ID_REGEX = /\/inmueble\/(\d+)\/?/;

export function extractListingId(url: string): string | null {
  const match = url.match(LISTING_ID_REGEX);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Gallery photo extraction
// ---------------------------------------------------------------------------

const GALLERY_REGEX =
  /https:\/\/img[0-9]*\.idealista\.com\/blur\/WEB_DETAIL\/0\/[^\s"'<>]+\.jpg/g;

const IMAGE_ID_REGEX = /\/(\d+)\.jpg/;

/**
 * Extract all unique gallery photo URLs from a detail page's HTML.
 * Returns de-duplicated WEB_DETAIL quality JPGs.
 */
export function extractGalleryPhotos(html: string): string[] {
  const matches = html.match(GALLERY_REGEX) ?? [];
  const seen = new Map<string, string>();
  for (const url of matches) {
    const idMatch = url.match(IMAGE_ID_REGEX);
    if (idMatch) {
      const imgId = idMatch[1];
      if (!seen.has(imgId)) seen.set(imgId, url);
    }
  }
  return Array.from(seen.values());
}

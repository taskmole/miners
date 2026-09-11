/**
 * Idealista Scraper Configuration
 *
 * Per-city search filters, proxy settings, and extraction patterns.
 * To change what the scraper fetches, edit the filter config here.
 */

// ---------------------------------------------------------------------------
// Per-city search filters
// ---------------------------------------------------------------------------

export type ListingMode = "rental" | "transfer";

export interface IdealistaFilters {
  maxSqm: number;
  propertyType: string;       // "locales" = commercial premises
  streetLevel: boolean;       // "en-planta-calle"
  listingMode: ListingMode;   // "rental" = alquiler-solo-inmueble, "transfer" = negocio-traspaso
  useTypes: string[];         // "restauracion", "tienda", etc. (empty = any)
}

const DEFAULT_FILTERS: IdealistaFilters = {
  maxSqm: 500,
  propertyType: "locales",
  streetLevel: true,
  listingMode: "rental",
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
  if (filters.listingMode === "rental") parts.push("alquiler-solo-inmueble");
  else if (filters.listingMode === "transfer") parts.push("negocio-traspaso");
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
  const pathSegment = filters.listingMode === "transfer" ? "traspasos" : "alquiler-locales";
  const base = `https://www.idealista.com/en/${pathSegment}/${cityArea}-${cityArea}/${buildFilterSegment(filters)}`;
  if (page <= 1) return base + "/";
  return `${base}/pagina-${page}.htm`;
}

/**
 * Get filters for a city, falling back to Madrid defaults.
 */
export function getFiltersForCity(cityId: string): IdealistaFilters {
  return CITY_FILTERS[cityId] ?? CITY_FILTERS.madrid;
}

export function getTransferFilters(cityId: string): IdealistaFilters {
  const base = getFiltersForCity(cityId);
  return { ...base, listingMode: "transfer" };
}

// ---------------------------------------------------------------------------
// Proxy configuration (Bright Data Web Unlocker, native proxy mode)
// ---------------------------------------------------------------------------

/**
 * Build the Bright Data proxy URL from environment credentials.
 *
 * Web Unlocker is addressed as an ordinary HTTP proxy. Auth lives in the
 * username, which encodes the customer, the zone, and any targeting options
 * (we pin to Spain because Idealista is a Spanish site and Spanish exit IPs
 * look less unusual to its anti-bot layer).
 */
export function buildProxyUri(): string {
  const customer = process.env.BRIGHTDATA_CUSTOMER_ID;
  const zone = process.env.BRIGHTDATA_ZONE;
  const password = process.env.BRIGHTDATA_PASSWORD;

  if (!customer || !zone || !password) {
    throw new Error(
      "Bright Data credentials missing. Set BRIGHTDATA_CUSTOMER_ID, " +
      "BRIGHTDATA_ZONE and BRIGHTDATA_PASSWORD in .env.local or CI secrets."
    );
  }

  const username = `brd-customer-${customer}-zone-${zone}-country-${PROXY_CONFIG.country}`;
  return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${PROXY_CONFIG.host}`;
}

export const PROXY_CONFIG = {
  host: "brd.superproxy.io:44445",
  country: "es",

  // Web Unlocker solves the anti-bot challenge itself, which legitimately takes
  // 15-25s per page (measured on Idealista, 2026-09-11). A short timeout would
  // abort requests that were about to succeed, so these are deliberately long.
  searchTimeoutMs: 90_000,
  detailTimeoutMs: 90_000,

  // Bright Data retries internally and bills only on success, so we need far
  // fewer retries than the old proxy required.
  maxRetries: 2,
  backoffMs: [5_000, 15_000],

  maxSearchPages: 34,

  // Stop Phase 1 after this many search pages fail back to back.
  searchFailureThreshold: 3,

  // Detail pages are fetched in parallel. At ~17s each, serial fetching would
  // take ~3h for a transfer run. Six at a time brings that to ~30min. Lower
  // this first if the failure rate climbs.
  detailConcurrency: 6,

  // Search pages stay sequential: we must stop as soon as we hit the last page,
  // and page count is unknown up front.
  delayBetweenSearchPagesMs: 1_000,

  // Listings are written to Supabase in chunks as they are scraped, so a run
  // that dies late keeps the work it already did.
  publishChunkSize: 50,

  // Kill switch if Bright Data itself goes down: trips on sustained failures.
  circuitBreakerThreshold: 8,
  circuitBreakerWindow: 10,

  // Hard spend cap. Bright Data's own account limits are only checked every
  // ~15 minutes, so a runaway loop could overshoot them. This stops the run
  // dead instead. A normal rental run uses ~290 requests and a transfer run
  // ~650 including search pages. Retries are counted too, so 1000 sat under 2x
  // real transfer volume: one growth spurt or retry storm would trip it and red
  // the job for no good reason. 1500 keeps genuine runaways bounded while
  // leaving real headroom. The $20/month auto-pause on the zone is the true
  // backstop; this is the fast-acting one.
  maxRequestsPerRun: 1_500,
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

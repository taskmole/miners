/**
 * sReality category tables and URL-to-API parameter converter.
 *
 * Single source of truth for sReality category codes and their URL slugs.
 * Both code-to-slug (for building detail URLs) and slug-to-code (for parsing
 * search URLs into API params) are derived from the same tables.
 *
 * Targets the 2026 rebuilt sReality API: https://www.sreality.cz/api/v1/estates
 * (the old /api/cs/v2 feed was removed). Category codes were renumbered in the
 * rebuild, so these tables differ from the pre-2026 ones. Multi-value filters
 * are comma-joined; paging uses offset + limit.
 */

// ---------------------------------------------------------------------------
// Code → slug tables (used to build detail URLs)
// ---------------------------------------------------------------------------

export const CATEGORY_TYPE_SLUGS: Record<number, string> = {
  1: "prodej",
  2: "pronajem",
};

export const CATEGORY_MAIN_SLUGS: Record<number, string> = {
  1: "byty",
  2: "domy",
  3: "pozemky",
  4: "komercni",
  5: "ostatni",
};

// Commercial (category_main_cb=4) subtypes. In the rebuilt API the search-URL
// slug and the detail-URL slug are identical (both plural), so one table serves
// both directions. Codes verified live against /api/v1/estates/filter_page.
export const CATEGORY_SUB_SLUGS: Record<number, string> = {
  25: "kancelare",
  26: "sklady",
  27: "vyrobni-prostory",
  28: "obchodni-prostory",
  29: "ubytovani",
  30: "restaurace",
  31: "zemedelske-objekty",
  32: "ostatni-komercni-prostory",
  38: "cinzovni-domy",
  49: "virtualni-kancelare",
  56: "ordinace",
  57: "apartmany",
};

// ---------------------------------------------------------------------------
// Slug → code reverse tables (derived from above, used for URL parsing)
// ---------------------------------------------------------------------------

function invertRecord(rec: Record<number, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, slug] of Object.entries(rec)) {
    out[slug] = Number(code);
  }
  return out;
}

const TYPE_SLUG_TO_CODE = invertRecord(CATEGORY_TYPE_SLUGS);
const MAIN_SLUG_TO_CODE = invertRecord(CATEGORY_MAIN_SLUGS);
const SUB_SLUG_TO_CODE = invertRecord(CATEGORY_SUB_SLUGS);

// Pre-2026 search URLs used some singular slug forms. Saved search links may
// still carry those, so normalize them to the current (plural) slugs.
const SEARCH_SLUG_NORMALIZE: Record<string, string> = {
  "obchodni-prostor": "obchodni-prostory",
  "vyrobni-prostor": "vyrobni-prostory",
  "zemedelsky-objekt": "zemedelske-objekty",
  "cinzovni-dum": "cinzovni-domy",
  "virtualni-kancelar": "virtualni-kancelare",
  "sklad": "sklady",
  "apartman": "apartmany",
  "ostatni": "ostatni-komercni-prostory",
};

// Condition slugs → building_condition codes (renumbered in the 2026 rebuild).
const CONDITION_SLUG_TO_CODE: Record<string, number> = {
  "velmi-dobry-stav": 1,
  "dobry-stav": 2,
  "spatny-stav": 3,
  "ve-vystavbe": 4,
  "projekt": 5,
  "novostavby": 6,
  "k-demolici": 7,
  "pred-rekonstrukci": 8,
  "po-rekonstrukci": 9,
  "v-rekonstrukci": 10,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SrealityApiParams {
  category_type_cb: number;
  category_main_cb: number;
  category_sub_cb?: string; // comma-joined codes
  locality_region_id?: number;
  usable_area_from?: number;
  usable_area_to?: number;
  building_condition?: string; // comma-joined codes
  limit: number;
}

// ---------------------------------------------------------------------------
// URL parser
// ---------------------------------------------------------------------------

/** Parse a sReality search URL into JSON API query parameters. */
export function parseSrealityUrl(
  url: string,
  srealityRegionId?: number | null
): SrealityApiParams {
  const parsed = new URL(url);
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  // Path: /hledani/{type}/{main}/{sub1,sub2,...}/{locality}

  if (pathParts[0] !== "hledani" || pathParts.length < 3) {
    throw new Error(`Cannot parse sReality URL path: ${parsed.pathname}`);
  }

  const typeSlug = pathParts[1];
  const mainSlug = pathParts[2];

  const typeCb = TYPE_SLUG_TO_CODE[typeSlug];
  const mainCb = MAIN_SLUG_TO_CODE[mainSlug];
  if (!typeCb) throw new Error(`Unknown sReality type slug: "${typeSlug}"`);
  if (!mainCb) throw new Error(`Unknown sReality main slug: "${mainSlug}"`);

  const params: SrealityApiParams = {
    category_type_cb: typeCb,
    category_main_cb: mainCb,
    limit: 100,
  };

  if (pathParts.length >= 4) {
    const candidateSubs = pathParts[3].split(",");
    const codes: number[] = [];
    for (const raw of candidateSubs) {
      const normalized = SEARCH_SLUG_NORMALIZE[raw] || raw;
      const code = SUB_SLUG_TO_CODE[normalized];
      if (code !== undefined) codes.push(code);
    }
    if (codes.length > 0) {
      params.category_sub_cb = codes.join(",");
    }
  }

  if (srealityRegionId) {
    params.locality_region_id = srealityRegionId;
  }

  const stav = parsed.searchParams.get("stav");
  if (stav) {
    const condCodes = stav
      .split(",")
      .map((s) => CONDITION_SLUG_TO_CODE[s.trim()])
      .filter((c): c is number => c !== undefined);
    if (condCodes.length > 0) {
      params.building_condition = condCodes.join(",");
    }
  }

  const areaFrom = parsed.searchParams.get("plocha-od");
  const areaTo = parsed.searchParams.get("plocha-do");
  if (areaFrom) params.usable_area_from = Number(areaFrom);
  if (areaTo) params.usable_area_to = Number(areaTo);

  return params;
}

// ---------------------------------------------------------------------------
// API URL builder
// ---------------------------------------------------------------------------

const SREALITY_API_BASE = "https://www.sreality.cz/api/v1/estates/search";

/**
 * Build a search API URL. Values are digit/comma/hyphen only, so the query
 * string is assembled by hand to keep commas literal (the API expects raw
 * commas in list params, not the %2C that URLSearchParams would emit).
 */
export function buildApiUrl(params: SrealityApiParams, offset: number): string {
  const parts = [
    `category_type_cb=${params.category_type_cb}`,
    `category_main_cb=${params.category_main_cb}`,
  ];
  if (params.category_sub_cb) parts.push(`category_sub_cb=${params.category_sub_cb}`);
  if (params.locality_region_id) parts.push(`locality_region_id=${params.locality_region_id}`);
  if (params.usable_area_from !== undefined) parts.push(`usable_area_from=${params.usable_area_from}`);
  if (params.usable_area_to !== undefined) parts.push(`usable_area_to=${params.usable_area_to}`);
  if (params.building_condition) parts.push(`building_condition=${params.building_condition}`);
  parts.push("sort=-date");
  parts.push(`limit=${params.limit}`);
  parts.push(`offset=${offset}`);
  return `${SREALITY_API_BASE}?${parts.join("&")}`;
}

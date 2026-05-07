/**
 * sReality category tables and URL-to-API parameter converter.
 *
 * Single source of truth for sReality category codes and their URL slugs.
 * Both code-to-slug (for building detail URLs) and slug-to-code (for parsing
 * search URLs into API params) are derived from the same tables.
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
};

export const CATEGORY_SUB_SLUGS: Record<number, string> = {
  2: "byt",
  3: "dum",
  4: "pozemek",
  5: "garaz",
  6: "pole",
  7: "les",
  8: "zahrada",
  9: "chata",
  10: "chalupa",
  11: "vila",
  12: "byt-1+kk",
  18: "kancelare",
  19: "sklad",
  20: "vyrobni-prostor",
  21: "obchodni-prostor",
  22: "ubytovani",
  23: "restaurace",
  24: "zemedelsky-objekt",
  25: "cinzovni-dum",
  26: "virtualni-kancelar",
  27: "vinny-sklep",
  28: "obchodni-prostor",
  29: "kancelare",
  30: "restaurace",
  31: "sklad",
  32: "vyrobni-prostor",
  33: "ubytovani",
  34: "zemedelsky-objekt",
  35: "cinzovni-dum",
  36: "virtualni-kancelar",
  37: "vinny-sklep",
  38: "apartman",
  39: "atelier",
  40: "kancelare",
  41: "restaurace",
  42: "obchodni-prostor",
  43: "ostatni",
  44: "pokoj",
  46: "garsoniera",
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

function invertToMulti(rec: Record<number, string>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [code, slug] of Object.entries(rec)) {
    if (!out[slug]) out[slug] = [];
    out[slug].push(Number(code));
  }
  return out;
}

const TYPE_SLUG_TO_CODE = invertRecord(CATEGORY_TYPE_SLUGS);
const MAIN_SLUG_TO_CODE = invertRecord(CATEGORY_MAIN_SLUGS);

// Multiple codes share the same slug (different type+main contexts).
// The API ignores codes that don't apply to the selected type+main.
const SUB_SLUG_TO_CODES = invertToMulti(CATEGORY_SUB_SLUGS);

// Search URLs use plural/variant slug forms; normalize to detail slugs
const SEARCH_SLUG_NORMALIZE: Record<string, string> = {
  "obchodni-prostory": "obchodni-prostor",
  "vyrobni-prostory": "vyrobni-prostor",
  "zemedelske-objekty": "zemedelsky-objekt",
  "cinzovni-domy": "cinzovni-dum",
  "virtualni-kancelare": "virtualni-kancelar",
  "vinne-sklepy": "vinny-sklep",
  "sklady": "sklad",
  "apartmany": "apartman",
  "ateliery": "atelier",
  "garaze": "garaz",
};

const CONDITION_SLUG_TO_CODE: Record<string, number> = {
  "novostavby": 1,
  "dobry-stav": 2,
  "velmi-dobry-stav": 3,
  "po-rekonstrukci": 4,
  "ve-vystavbe": 5,
  "pred-rekonstrukci": 6,
  "spatny-stav": 7,
  "projekt": 8,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SrealityApiParams {
  category_type_cb: number;
  category_main_cb: number;
  category_sub_cb?: string;
  locality_region_id?: number;
  usable_area?: string;
  building_condition?: string;
  per_page: number;
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
    per_page: 60,
  };

  if (pathParts.length >= 4) {
    const candidateSubs = pathParts[3].split(",");
    const codes: number[] = [];
    for (const raw of candidateSubs) {
      const normalized = SEARCH_SLUG_NORMALIZE[raw] || raw;
      const matched = SUB_SLUG_TO_CODES[normalized];
      if (matched) codes.push(...matched);
    }
    if (codes.length > 0) {
      params.category_sub_cb = codes.join("|");
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
      params.building_condition = condCodes.join("|");
    }
  }

  const areaFrom = parsed.searchParams.get("plocha-od");
  const areaTo = parsed.searchParams.get("plocha-do");
  if (areaFrom || areaTo) {
    params.usable_area = `${areaFrom || "0"}|${areaTo || "10000"}`;
  }

  return params;
}

// ---------------------------------------------------------------------------
// API URL builder
// ---------------------------------------------------------------------------

const SREALITY_API_BASE = "https://www.sreality.cz/api/cs/v2/estates";

export function buildApiUrl(params: SrealityApiParams, page: number): string {
  const qs = new URLSearchParams();
  qs.set("category_type_cb", String(params.category_type_cb));
  qs.set("category_main_cb", String(params.category_main_cb));
  if (params.category_sub_cb) qs.set("category_sub_cb", params.category_sub_cb);
  if (params.locality_region_id) qs.set("locality_region_id", String(params.locality_region_id));
  if (params.usable_area) qs.set("usable_area", params.usable_area);
  if (params.building_condition) qs.set("building_condition", params.building_condition);
  qs.set("per_page", String(params.per_page));
  qs.set("page", String(page));
  return `${SREALITY_API_BASE}?${qs.toString()}`;
}

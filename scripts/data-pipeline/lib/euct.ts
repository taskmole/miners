/**
 * European Coffee Trip (EUCT) parsing and merge logic.
 *
 * Kept free of network and file access so it can be unit tested.
 * The scraper itself lives in ../fetch-euct.ts.
 */

import * as cheerio from "cheerio";

export const EUCT_BASE_URL = "https://europeancoffeetrip.com";

/** Column order of public/data/*cafe_info.csv. Readers rely on these names. */
export const EUCT_COLUMNS = [
  "city_name",
  "name",
  "link",
  "address",
  "latitude",
  "longitude",
  "premium",
  "awards_winner",
  "featured_photo",
  "website",
  "instagram",
  "facebook",
  "date_published",
  "date_modified",
] as const;

export type EuctRow = Record<(typeof EUCT_COLUMNS)[number], string>;

/** One cafe as listed on a city page (before its own page is fetched). */
export type ListedCafe = Pick<
  EuctRow,
  "name" | "link" | "address" | "latitude" | "longitude" | "premium" | "awards_winner" | "featured_photo"
>;

/** Fields that only exist on the cafe's own page. */
export type CafeDetails = Pick<
  EuctRow,
  "website" | "instagram" | "facebook" | "date_published" | "date_modified"
>;

/** Miners locations come from the database, so EUCT's copies would duplicate them. */
const MINERS_NAME = /\bminers\b/i;

/** Safety stops: below these the city file is left untouched. */
export const MIN_LISTED_RATIO = 0.8;
export const MIN_MATCHED_RATIO = 0.7;

/** Match key for links: case and trailing slash must not split one cafe in two. */
export function linkKey(link: string): string {
  return link.trim().toLowerCase().replace(/\/+$/, "");
}

/** The map checks premium === "True", the format the original Python script wrote. */
function pyBool(value: unknown): string {
  return value === true || value === "true" || value === "True" || value === 1 || value === "1"
    ? "True"
    : "False";
}

/**
 * Read the cafe list embedded in a city page (`cafesToMap = [...]`).
 * Returns null when the list is missing or unreadable, which means the
 * page was blocked or the site changed.
 */
export function parseCityPage(html: string): ListedCafe[] | null {
  const match = html.match(/cafesToMap\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;

  return raw
    .filter((c) => c && c.link && c.latitude && c.longitude && !MINERS_NAME.test(c.name ?? ""))
    .map((c) => ({
      name: String(c.name ?? "Unknown"),
      link: String(c.link).startsWith("http") ? String(c.link) : EUCT_BASE_URL + c.link,
      address: String(c.address ?? ""),
      latitude: String(c.latitude),
      longitude: String(c.longitude),
      premium: pyBool(c.premium),
      awards_winner: pyBool(c.awards_winner),
      featured_photo: String(c.featured_photo ?? ""),
    }));
}

/** Read website, socials and dates from a cafe's own page. */
export function parseCafePage(html: string): CafeDetails {
  const details: CafeDetails = {
    website: "",
    instagram: "",
    facebook: "",
    date_published: html.match(/"datePublished":"([^"]+)"/)?.[1] ?? "",
    date_modified: html.match(/"dateModified":"([^"]+)"/)?.[1] ?? "",
  };

  // Social links are anchors wrapping a Social-*.svg icon.
  const $ = cheerio.load(html);
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const src = $(el).find("img").attr("src") ?? "";
    if (src.includes("Social-Instagram.svg") && href.includes("instagram.com")) details.instagram = href;
    else if (src.includes("Social-Facebook.svg") && href.includes("facebook.com")) details.facebook = href;
    else if (src.includes("Social-Website.svg")) details.website = href;
  });

  return details;
}

/**
 * Check a fresh city list against the current file before spending money on
 * cafe pages. Returns a reason to stop, or null when it is safe to continue.
 */
export function checkSafety(existing: EuctRow[], listed: ListedCafe[] | null): string | null {
  if (!listed || listed.length === 0) return "city page had no cafe list (blocked or site changed)";

  const current = existing.filter((r) => r.link && !MINERS_NAME.test(r.name));
  if (current.length === 0) return null;

  if (listed.length < current.length * MIN_LISTED_RATIO) {
    return `site lists ${listed.length} cafes but the file has ${current.length} (below ${MIN_LISTED_RATIO * 100}%)`;
  }

  const listedKeys = new Set(listed.map((c) => linkKey(c.link)));
  const matched = current.filter((r) => listedKeys.has(linkKey(r.link))).length;
  if (matched < current.length * MIN_MATCHED_RATIO) {
    return `only ${matched} of ${current.length} existing cafes matched a link on the site (link format changed?)`;
  }

  return null;
}

const BLANK_DETAILS: CafeDetails = { website: "", instagram: "", facebook: "", date_published: "", date_modified: "" };

export interface MergeStats {
  kept: number;
  added: number;
  removed: number;
  detailFailures: number;
}

/**
 * Build the new city file.
 *
 * Map pins, comments, lists, hidden pins and share links are keyed by a
 * cafe's coordinates, so a cafe already in the file keeps its latitude and
 * longitude exactly as written. Cafes the site no longer lists are dropped.
 * A null entry in `details` means that cafe's page failed: keep its old details.
 */
export function mergeCity(
  cityName: string,
  existing: EuctRow[],
  listed: ListedCafe[],
  details: Map<string, CafeDetails | null>
): { rows: EuctRow[]; stats: MergeStats } {
  const existingByKey = new Map(existing.filter((r) => r.link).map((r) => [linkKey(r.link), r]));
  const stats: MergeStats = { kept: 0, added: 0, removed: 0, detailFailures: 0 };
  const seen = new Set<string>();
  const rows: EuctRow[] = [];

  for (const cafe of listed) {
    const key = linkKey(cafe.link);
    if (seen.has(key)) continue;
    seen.add(key);

    const old = existingByKey.get(key);
    const fresh = details.get(key) ?? null;
    if (!fresh) stats.detailFailures++;

    const pageDetails: CafeDetails = fresh ?? old ?? BLANK_DETAILS;

    rows.push({
      city_name: cityName,
      ...cafe,
      link: old?.link ?? cafe.link,
      latitude: old?.latitude ?? cafe.latitude,
      longitude: old?.longitude ?? cafe.longitude,
      website: pageDetails.website,
      instagram: pageDetails.instagram,
      facebook: pageDetails.facebook,
      date_published: pageDetails.date_published,
      date_modified: pageDetails.date_modified,
    });

    if (old) stats.kept++;
    else stats.added++;
  }

  stats.removed = [...existingByKey.keys()].filter((k) => !seen.has(k)).length;
  return { rows, stats };
}

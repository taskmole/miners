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

/** A "new" cafe this close to a "removed" one is the same cafe under a new link. */
export const RELINK_MAX_METRES = 30;

export interface MergeStats {
  kept: number;
  added: string[];
  removed: string[];
  relinked: string[];
  detailFailures: number;
}

function metresApart(a: Pick<EuctRow, "latitude" | "longitude">, b: Pick<EuctRow, "latitude" | "longitude">): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lat1, lon1, lat2, lon2] = [a.latitude, a.longitude, b.latitude, b.longitude].map(Number);
  const x = toRad(lon2 - lon1) * Math.cos(toRad((lat1 + lat2) / 2));
  return Math.hypot(x, toRad(lat2 - lat1)) * 6_371_000;
}

/**
 * Build the new city file.
 *
 * Map pins, comments, lists, hidden pins and share links are keyed by a
 * cafe's coordinates, so a cafe already in the file keeps its latitude and
 * longitude exactly as written. That includes a cafe whose link changed: a
 * new cafe within RELINK_MAX_METRES of a removed one takes over its
 * coordinates. Cafes the site no longer lists are dropped.
 * A null entry in `details` means that cafe's page failed: keep its old details.
 */
export function mergeCity(
  cityName: string,
  existing: EuctRow[],
  listed: ListedCafe[],
  details: Map<string, CafeDetails | null>
): { rows: EuctRow[]; stats: MergeStats } {
  const existingByKey = new Map(existing.filter((r) => r.link).map((r) => [linkKey(r.link), r]));
  const listedByKey = new Map(listed.map((c) => [linkKey(c.link), c]));
  const stats: MergeStats = { kept: 0, added: [], removed: [], relinked: [], detailFailures: 0 };

  // Existing cafes the site no longer lists under the same link.
  const unmatched = [...existingByKey].filter(([key]) => !listedByKey.has(key)).map(([, row]) => row);

  const rows = [...listedByKey].map(([key, cafe]): EuctRow => {
    let old = existingByKey.get(key);
    if (old) {
      stats.kept++;
    } else {
      // Miners rows are dropped on purpose (they come from the DB), never relinked.
      const moved = unmatched.findIndex(
        (r) => !MINERS_NAME.test(r.name) && metresApart(r, cafe) <= RELINK_MAX_METRES
      );
      if (moved >= 0) {
        [old] = unmatched.splice(moved, 1);
        stats.relinked.push(`${old.name} -> ${cafe.name}`);
      } else {
        stats.added.push(cafe.name);
      }
    }

    const fresh = details.get(key) ?? null;
    if (!fresh) stats.detailFailures++;
    const from: CafeDetails = fresh ?? old ?? BLANK_DETAILS;

    return {
      city_name: cityName,
      ...cafe,
      website: from.website,
      instagram: from.instagram,
      facebook: from.facebook,
      date_published: from.date_published,
      date_modified: from.date_modified,
      // A relinked cafe takes the site's new link; a kept one keeps its own spelling.
      link: existingByKey.has(key) ? old!.link : cafe.link,
      latitude: old?.latitude ?? cafe.latitude,
      longitude: old?.longitude ?? cafe.longitude,
    };
  });

  stats.removed = unmatched.map((r) => r.name);
  return { rows, stats };
}

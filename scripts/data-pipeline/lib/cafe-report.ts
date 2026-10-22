/**
 * The cafe change report: what the monthly refresh added, removed and changed.
 *
 * Both refresh scripts (fetch-euct.ts, then refresh-google-cafes.ts) add
 * their part to public/data/cafe-changes.json. The file is committed with the
 * cafe files, so it goes live in the same deploy, and the daily
 * /api/send-cafe-update-email cron emails it once.
 *
 * The app imports only the types from here.
 */

import * as fs from "fs";

export type CafeKind = "coffee-trip" | "regular";

export interface ReportCafe {
  name: string;
  kind: CafeKind;
  /** Map id (cafe-<lat>-<lon>) for the email link. Absent for cafes that are gone. */
  placeId?: string;
  /** What changed, in plain words, e.g. "rating 4.3 → 4.6". Only on changed cafes. */
  changes?: string[];
}

export interface CityChanges {
  added: ReportCafe[];
  removed: ReportCafe[];
  changed: ReportCafe[];
}

export interface CafeReport {
  /** GitHub run id + attempt. The email goes out once per stamp. */
  stamp: string;
  createdAt: string;
  cities: Record<string, CityChanges>;
}

/** Ratings wobble by 0.1 all the time; smaller moves are noise. */
export const RATING_CHANGE_MIN = 0.2;

/** Same id the map builds for a cafe pin (src/lib/place-id.ts generatePlaceId). */
export function cafePlaceId(lat: string | number, lon: string | number): string {
  return `cafe-${Number(lat).toFixed(5)}-${Number(lon).toFixed(5)}`;
}

/** One cafe, reduced to what the report compares. */
export interface ComparableCafe {
  placeId: string;
  name: string;
  rating?: string;
  price?: string;
  premium?: string;
}

/** Plain-words list of what changed between two versions of one cafe. */
export function describeChanges(before: ComparableCafe, after: ComparableCafe): string[] {
  const changes: string[] = [];
  if (before.name !== after.name) changes.push(`renamed from "${before.name}"`);

  const [oldRating, newRating] = [parseFloat(before.rating ?? ""), parseFloat(after.rating ?? "")];
  if (!isNaN(oldRating) && !isNaN(newRating) && Math.abs(newRating - oldRating) >= RATING_CHANGE_MIN - 1e-9) {
    changes.push(`rating ${oldRating.toFixed(1)} → ${newRating.toFixed(1)}`);
  }

  // Only known-to-known: a price appearing for the first time is not news.
  if (before.price && after.price && before.price !== after.price) {
    changes.push(`price ${before.price} → ${after.price}`);
  }

  if (before.premium !== undefined && after.premium !== undefined && before.premium !== after.premium) {
    changes.push(after.premium === "True" ? "now Premium" : "no longer Premium");
  }
  return changes;
}

/**
 * Compare a city's cafes before and after a refresh, matched by map position.
 * Kept cafes never move, so a cafe in both lists has the same placeId.
 */
export function diffCafes(
  kind: CafeKind,
  before: ComparableCafe[],
  after: ComparableCafe[],
  { reportAdded = true, reportChanged = true } = {}
): CityChanges {
  const beforeById = new Map(before.map((c) => [c.placeId, c]));
  const afterIds = new Set(after.map((c) => c.placeId));
  const result: CityChanges = { added: [], removed: [], changed: [] };

  for (const cafe of after) {
    const old = beforeById.get(cafe.placeId);
    if (!old) {
      if (reportAdded) result.added.push({ name: cafe.name, kind, placeId: cafe.placeId });
    } else if (reportChanged) {
      const changes = describeChanges(old, cafe);
      if (changes.length) result.changed.push({ name: cafe.name, kind, placeId: cafe.placeId, changes });
    }
  }
  for (const cafe of before) {
    if (!afterIds.has(cafe.placeId)) result.removed.push({ name: cafe.name, kind });
  }
  return result;
}

/**
 * Add one city's changes to the report. A report from another run is
 * replaced, never appended to. Changes to the same cafe are combined.
 */
export function addToReport(
  report: CafeReport | null,
  stamp: string,
  createdAt: string,
  city: string,
  changes: CityChanges
): CafeReport {
  const base: CafeReport = report?.stamp === stamp ? report : { stamp, createdAt, cities: {} };
  const current = base.cities[city] ?? { added: [], removed: [], changed: [] };

  const changed = [...current.changed];
  for (const cafe of changes.changed) {
    const same = changed.find((c) => c.placeId && c.placeId === cafe.placeId);
    if (same) same.changes = [...(same.changes ?? []), ...(cafe.changes ?? [])];
    else changed.push(cafe);
  }

  return {
    ...base,
    cities: {
      ...base.cities,
      [city]: {
        added: [...current.added, ...changes.added],
        removed: [...current.removed, ...changes.removed],
        changed,
      },
    },
  };
}

/**
 * Write one city's changes into the report file. Only the real monthly run
 * does this: it sets CAFE_REPORT_STAMP. Dry runs and local runs never do.
 */
export function saveToReportFile(filePath: string, city: string, changes: CityChanges): void {
  const stamp = process.env.CAFE_REPORT_STAMP;
  if (!stamp) return;

  let report: CafeReport | null = null;
  try {
    report = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CafeReport;
  } catch {
    // No report yet, or unreadable: start a fresh one.
  }
  const next = addToReport(report, stamp, new Date().toISOString(), city, changes);
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2) + "\n");
}

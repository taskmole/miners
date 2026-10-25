/**
 * Which city a property is in, worked out from its coordinates.
 *
 * This file used to do something else. It held a hardcoded rule saying that a
 * request on a Spanish property must also reach Kirill, because head office
 * wanted the Spanish market watched by its own person and there was no way to
 * say "the person who approves Madrid" - a role applied everywhere or nowhere.
 *
 * Per-city grants can say exactly that, so the rule is gone. Kirill holds
 * Approve in Madrid and is picked up by request_reviewer_emails() like anyone
 * else, and adding a watcher for a new city is now a tick in the admin screen
 * rather than a deploy.
 *
 * What survives is the useful half: turning a point into a city. The city is
 * worked out from the property itself rather than from whichever city the
 * user happened to have selected, because the two can disagree (a saved list,
 * a deep link, a stale picker) and the property is the thing the email is
 * actually about.
 */

import { cities } from "@/lib/cities";

/**
 * City centres, read from the one city list rather than copied.
 *
 * This used to be a hand-maintained duplicate, because the list lived inside
 * CitySelector, a client component that drags React and the flag icons in
 * with it. The list now lives in src/lib/cities.ts, which is plain data, so a
 * server route can import it without any of that.
 */
const CITY_CENTRES: { id: string; country: string; lat: number; lon: number }[] =
  cities.map((city) => ({
    id: city.id,
    country: city.countryCode,
    lon: city.coordinates[0],
    lat: city.coordinates[1],
  }));

/**
 * How far from a city centre a property may sit and still count as that
 * city. Wide enough for any commuter belt, tight enough that a point in
 * another country (Berlin is ~280 km from Prague) is left unknown rather than
 * guessed at.
 */
const MAX_CITY_RADIUS_KM = 150;

/** Rough great-circle distance. Precision beyond a kilometre is irrelevant here. */
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The nearest known city centre, or null when the point is nowhere near one. */
function nearestCentre(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  let best: { centre: (typeof CITY_CENTRES)[number]; km: number } | null = null;
  for (const centre of CITY_CENTRES) {
    const km = distanceKm(lat, lon, centre.lat, centre.lon);
    if (!best || km < best.km) best = { centre, km };
  }

  if (!best || best.km > MAX_CITY_RADIUS_KM) return null;
  return best.centre;
}

/** Nearest known city's id, or null when the point is nowhere near one. */
export function cityForCoordinates(lat: number, lon: number): string | null {
  return nearestCentre(lat, lon)?.id ?? null;
}

/**
 * Nearest known city's country, or null when the point is nowhere near one.
 * Still used to decide currency and wording, which are country-shaped rather
 * than city-shaped.
 */
export function countryForCoordinates(lat: number, lon: number): string | null {
  return nearestCentre(lat, lon)?.country ?? null;
}

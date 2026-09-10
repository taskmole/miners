/**
 * Who else gets told, based on where the property is.
 *
 * Head office asked for the Spanish market to be watched by its own person:
 * a request filed on a Spanish property must reach Kirill as well as the
 * reviewers who already get everything. Nothing is taken away here, only
 * added, so a country with no entry keeps the existing behaviour exactly.
 *
 * The country is worked out from the property itself rather than from the
 * city the user happened to have selected, because the two can disagree
 * (a saved list, a deep link, a stale picker) and the property is the thing
 * the email is actually about.
 */

/** Extra reviewers per ISO 3166-1 alpha-2 country code. */
const COUNTRY_EXTRA_REVIEWERS: Record<string, string[]> = {
  ES: ["kirill.odintsov@theminers.eu"],
};

/**
 * City centres, the single source for turning a point into a country.
 * Deliberately duplicated from CitySelector rather than imported: that module
 * is a client component and pulls in React and the flag icons, which must not
 * land in a server route just to answer "which country is this". The test
 * keeps the two in step.
 */
const CITY_CENTRES: { country: string; lat: number; lon: number }[] = [
  { country: "ES", lat: 40.4168, lon: -3.7038 },  // Madrid
  { country: "ES", lat: 41.3874, lon: 2.1734 },   // Barcelona
  { country: "ES", lat: 37.3891, lon: -5.9845 },  // Seville
  { country: "CZ", lat: 50.0755, lon: 14.4378 },  // Prague
];

/**
 * How far from a city centre a property may sit and still count as that
 * city's country. Wide enough for any commuter belt, tight enough that a
 * point in another country (Berlin is ~280 km from Prague) is left unknown
 * rather than guessed at.
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

/** Nearest known city's country, or null when the point is nowhere near one. */
export function countryForCoordinates(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  let best: { country: string; km: number } | null = null;
  for (const centre of CITY_CENTRES) {
    const km = distanceKm(lat, lon, centre.lat, centre.lon);
    if (!best || km < best.km) best = { country: centre.country, km };
  }

  if (!best || best.km > MAX_CITY_RADIUS_KM) return null;
  return best.country;
}

/** The extra addresses for a country. Empty for countries with no rule. */
function extraReviewersForCountry(country: string | null): string[] {
  if (!country) return [];
  return COUNTRY_EXTRA_REVIEWERS[country.toUpperCase()] ?? [];
}

/**
 * Add the country's extra reviewers to a recipient list.
 *
 * Case-insensitive de-duplication: if the extra reviewer is already in the
 * base list (they were made an admin, say), they must not be mailed twice.
 * The original spelling of an address that is already there wins.
 */
export function withCountryReviewers(
  recipients: string[],
  country: string | null,
): string[] {
  const seen = new Set(recipients.map(e => e.trim().toLowerCase()));
  const extras = extraReviewersForCountry(country).filter(
    e => !seen.has(e.trim().toLowerCase()),
  );
  return extras.length ? [...recipients, ...extras] : recipients;
}

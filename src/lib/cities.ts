/**
 * The city list. One source, read by every screen and every server route.
 *
 * Before this file there were three lists that disagreed with each other: the
 * `enabled` column in the database, the hardcoded array in CitySelector, and a
 * `CITY_OPTIONS` array on the admin user screen that was missing Barcelona
 * entirely, so saving anyone's profile silently stripped Barcelona from them.
 *
 * Two words that are easy to confuse and mean different things:
 *
 *   active   - selectable on the map. Barcelona and Seville are not, yet.
 *   assignable - somebody may be given access to it. Every city is.
 *
 * An inactive city is one nobody can open, not one nobody may be permissioned
 * for. Getting that backwards is what hid Barcelona from the admin screen.
 *
 * Deliberately free of React and of any import that pulls it in: server routes
 * and the notification code need this list too, and must not drag the flag
 * icons into a serverless bundle to answer "which country is Madrid in".
 */

export interface City {
  id: string;
  name: string;
  /** Selectable on the map. False for a city that is not live yet. */
  active: boolean;
  /** [longitude, latitude], MapLibre order. */
  coordinates: [number, number];
  chip: { text: string; style: string } | null;
  /** ISO 3166-1 alpha-2, used for the flag and for notification routing. */
  countryCode: string;
}

export const cities: City[] = [
  { id: "madrid", name: "Madrid", active: true, coordinates: [-3.7038, 40.4168], chip: null, countryCode: "ES" },
  { id: "prague", name: "Prague", active: true, coordinates: [14.4378, 50.0755], chip: { text: "NEW", style: "gold" }, countryCode: "CZ" },
  { id: "barcelona", name: "Barcelona", active: false, coordinates: [2.1734, 41.3874], chip: { text: "COMING SOON", style: "gray" }, countryCode: "ES" },
  { id: "seville", name: "Seville", active: false, coordinates: [-5.9845, 37.3891], chip: { text: "COMING SOON", style: "gray" }, countryCode: "ES" },
];

/** Cities that can be opened on the map today. */
export const activeCities = cities.filter((c) => c.active);

/** The city someone lands on when they have expressed no preference. */
export const DEFAULT_CITY = cities[0];

export function cityById(id: string | null | undefined): City | undefined {
  if (!id) return undefined;
  return cities.find((c) => c.id === id);
}

/** Display names keyed by id, for anything that renders a city from a grant. */
export const cityNames: Record<string, string> = Object.fromEntries(
  cities.map((c) => [c.id, c.name]),
);

/**
 * The shape the permission screens want: every city, including the ones that
 * are not live, because access is granted per city whether or not the map can
 * open it yet.
 */
export const cityOptions = cities.map((c) => ({
  id: c.id,
  name: c.name,
  enabled: c.active,
}));

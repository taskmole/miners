/**
 * Start the map's data downloads while the app's code is still loading.
 *
 * The map waits for its listings and map files, and the browser used to ask
 * for them only after all the app's code had downloaded and run: about 1.6 s
 * into a page open on a phone, 0.75 s on a laptop. The answers themselves take
 * about a second, so all of that was waiting in a line.
 *
 * A tiny script in the page head (buildMapPrefetchScript, put there by the
 * root layout) now sends the same requests the moment the page starts, using
 * the session already stored in the browser. When useMapData later asks for
 * one of those URLs, takePrefetchedResponse hands over the answer that is
 * already on its way. Anything unexpected (no session, a different token, an
 * error, an answer that is too old) and useMapData simply fetches as before,
 * so the worst case is today's behaviour plus a few unused requests.
 *
 * A shared or email link (/?focus=<placeId>, or a link parked across the
 * Google sign-in) opens in the place's city, not the saved one. The script
 * works that city out from the place id with the same rule the app uses
 * (nearest city centre within 150 km, see notify-routing.ts).
 */
import { activeCities } from "./cities";
import { CITY_CENTRES, MAX_CITY_RADIUS_KM } from "./notify-routing";
import { PLACE_ID_COORDS_RE } from "./place-id";
import { PENDING_KEY, PENDING_TTL_MS } from "./share";

/**
 * What useMapData's loaders request for each city, listings first because the
 * map waits on them longest. A city missing here just loads its listings. A
 * test checks this against the loaders, so the two cannot drift apart.
 */
export const MAP_DATA_URLS: Record<string, string[]> = {
  madrid: [
    "/api/db/places?city_id=madrid",
    "/api/data?type=data",
    "/api/data?type=cafes",
    "/api/data?type=google_madrid",
    "/api/data?type=google_enrichment",
    "/api/data?type=other",
    "/api/data?type=gyms_madrid",
    "/api/data?type=metro",
  ],
  prague: [
    "/api/db/places?city_id=prague",
    "/api/data?type=prague_cafes",
    "/api/data?type=google_prague",
    "/api/data?type=google_enrichment_prague",
    "/api/data?type=osm_pois_prague",
    "/api/data?type=gyms_prague",
    "/api/data?type=metro&city=prague",
  ],
  barcelona: ["/api/db/places?city_id=barcelona", "/api/data?type=barcelona_cafes"],
};

export function mapDataUrlsFor(cityId: string): string[] {
  return MAP_DATA_URLS[cityId] ?? [`/api/db/places?city_id=${encodeURIComponent(cityId)}`];
}

/** Where supabase-js keeps the session by default (a test checks this against the library). */
export function sessionStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

/** An answer older than this is not used; the window entry is gone by then anyway. */
const MAX_AGE_MS = 20_000;
/** Only the token's last characters are kept on the page, enough to tell sessions apart. */
const TOKEN_TAIL = 16;

type MapPrefetch = {
  tokenTail: string;
  startedAt: number;
  responses: Record<string, Promise<Response | null>>;
};
type PrefetchWindow = Window & { __minersMapPrefetch?: MapPrefetch };

/**
 * The head script, or null when Supabase is not configured.
 *
 * It does nothing unless this is an open of the map (path "/") with no query,
 * or with exactly ?focus=<placeId> (other queries, such as sign-in errors or
 * older email links, are left alone), and the stored session has 5+ minutes
 * left. A shared place (in the address, or parked within the last 30 minutes)
 * decides the city; otherwise the person's saved city does. Either way the
 * city must be live, or nothing is fetched. It never throws.
 */
export function buildMapPrefetchScript(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  const urlsByCity: Record<string, string[]> = {};
  for (const city of activeCities) urlsByCity[city.id] = mapDataUrlsFor(city.id);
  const centres = CITY_CENTRES.map(({ id, lat, lon }) => ({ id, lat, lon }));

  return `(function () {
  var URLS = ${JSON.stringify(urlsByCity)};
  var CENTRES = ${JSON.stringify(centres)};
  try {
    if (location.pathname !== "/") return;
    if (typeof AbortSignal === "undefined" || !AbortSignal.timeout) return;
    var placeId = null;
    if (location.search) {
      var linked = /^\\?focus=([^&]+)$/.exec(location.search);
      if (!linked) return;
      placeId = decodeURIComponent(linked[1]);
    } else {
      var pending = JSON.parse(sessionStorage.getItem(${JSON.stringify(PENDING_KEY)}) || "null");
      if (pending && typeof pending.placeId === "string" && typeof pending.at === "number" &&
          Date.now() - pending.at <= ${PENDING_TTL_MS}) placeId = pending.placeId;
    }
    var session = JSON.parse(localStorage.getItem(${JSON.stringify(sessionStorageKey(supabaseUrl))}) || "null");
    var token = session && session.access_token;
    if (!token || !(session.expires_at * 1000 > Date.now() + 300000)) return;
    var cityId;
    if (placeId !== null) {
      cityId = placeCity(placeId);
    } else {
      var meta = session.user && session.user.user_metadata;
      cityId = meta && meta.default_city;
    }
    var urls = cityId && Object.prototype.hasOwnProperty.call(URLS, cityId) && URLS[cityId];
    if (!urls) return;
    var responses = {};
    urls.forEach(function (url) {
      responses[url] = fetch(url, {
        cache: "no-store",
        headers: { Authorization: "Bearer " + token },
        signal: AbortSignal.timeout(15000)
      }).catch(function () { return null; });
    });
    window.__minersMapPrefetch = { tokenTail: token.slice(-${TOKEN_TAIL}), startedAt: Date.now(), responses: responses };
    setTimeout(function () { delete window.__minersMapPrefetch; }, ${MAX_AGE_MS});
  } catch (e) {}

  // Same rule as cityForCoordinates in notify-routing.ts, step for step.
  function placeCity(id) {
    var match = ${PLACE_ID_COORDS_RE.toString()}.exec(id);
    if (!match) return null;
    var lat = parseFloat(match[1]), lon = parseFloat(match[2]);
    var best = null, bestKm = 0;
    CENTRES.forEach(function (c) {
      var km = distanceKm(lat, lon, c.lat, c.lon);
      if (!best || km < bestKm) { best = c; bestKm = km; }
    });
    return best && bestKm <= ${MAX_CITY_RADIUS_KM} ? best.id : null;
  }
  function distanceKm(aLat, aLon, bLat, bLon) {
    var toRad = function (deg) { return (deg * Math.PI) / 180; };
    var dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
    var h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
})();`;
}

/**
 * The head script's answer for this URL, at most once, or null.
 *
 * Only handed over when it was sent with the same session and is still fresh;
 * otherwise the whole batch is dropped and the caller fetches as usual.
 */
export function takePrefetchedResponse(url: string, token: string | null): Promise<Response | null> | null {
  if (typeof window === "undefined" || !token) return null;
  const w = window as PrefetchWindow;
  const batch = w.__minersMapPrefetch;
  if (!batch) return null;

  if (batch.tokenTail !== token.slice(-TOKEN_TAIL) || Date.now() - batch.startedAt > MAX_AGE_MS) {
    delete w.__minersMapPrefetch;
    return null;
  }

  const response = batch.responses[url];
  if (!response) return null;
  delete batch.responses[url];
  if (Object.keys(batch.responses).length === 0) delete w.__minersMapPrefetch;
  return response;
}

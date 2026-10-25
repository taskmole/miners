/**
 * Share links: the /s/<code> URLs behind the "Link" button on place cards.
 *
 * Shared by the browser (making the code, remembering where a link should
 * land across the Google sign-in round trip) and the server (checking what a
 * browser sent before it is stored and shown to strangers in a chat preview).
 * Imports nothing browser-only or server-only, so both can use it.
 */

import { cityById, type City } from "@/lib/cities";
import { cityForCoordinates } from "@/lib/notify-routing";
import { parseCoordinatesFromPlaceId } from "@/lib/place-id";

/** 10 base62 characters: about 8 x 10^17 codes, so links cannot be guessed. */
export const SHARE_CODE_RE = /^[A-Za-z0-9]{10}$/;

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A fresh random share code.
 *
 * Made in the browser rather than by the server so the link exists the moment
 * the button is clicked. Safari and iOS refuse clipboard writes and the share
 * sheet once the click has been "spent" waiting on a network round trip.
 */
export function makeShareCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  // 256 is not a multiple of 62, so this is very slightly biased toward the
  // first few characters. Irrelevant for unguessability at this length.
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function shareUrl(origin: string, code: string): string {
  return `${origin}/s/${code}`;
}

/**
 * Hosts the preview image is allowed to download a photo from.
 *
 * These are the only three that appear in places.photos today (Idealista,
 * Sreality's sdn.cz CDN, European Coffee Trip). Anything else is dropped at
 * save time and again before download, so the preview route can never be
 * pointed at an arbitrary URL.
 */
export function isAllowedPhotoUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname;
  const onDomain = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  return /^img\d*\.idealista\.com$/.test(host) || onDomain("sdn.cz") || onDomain("europeancoffeetrip.com");
}

const MAX_TITLE = 160;
const MAX_ADDRESS = 200;

/** Place types a share may carry: the prefixes used by place ids on the map. */
const PLACE_TYPE_RE = /^[a-z_]{2,30}$/;

interface ShareInput {
  code: string;
  placeId: string;
  placeType: string;
  title: string;
  address?: string | null;
  photoUrl?: string | null;
}

export interface CleanShare {
  code: string;
  placeId: string;
  placeType: string;
  title: string;
  address: string | null;
  photoUrl: string | null;
  lat: number;
  lon: number;
}

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Collapse whitespace so a pasted newline cannot break the preview layout.
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Check and tidy what the browser sent. Returns null when it is unusable.
 *
 * The city is deliberately NOT accepted from the browser. The caller derives
 * it from the coordinates in the place id and checks access against that.
 */
export function cleanShareInput(input: Partial<ShareInput> | null | undefined): CleanShare | null {
  if (!input) return null;
  const { code, placeId, placeType } = input;
  if (typeof code !== "string" || !SHARE_CODE_RE.test(code)) return null;
  if (typeof placeId !== "string" || placeId.length > 120) return null;
  if (typeof placeType !== "string" || !PLACE_TYPE_RE.test(placeType)) return null;

  const coords = parseCoordinatesFromPlaceId(placeId);
  if (!coords) return null;

  const title = clip(input.title, MAX_TITLE);
  if (!title) return null;

  const address = clip(input.address, MAX_ADDRESS) || null;
  const photo = typeof input.photoUrl === "string" ? input.photoUrl.trim() : "";
  const photoUrl = photo && photo.length <= 1000 && isAllowedPhotoUrl(photo) ? photo : null;

  return { code, placeId, placeType, title, address, photoUrl, lat: coords.lat, lon: coords.lon };
}

const PLACE_TYPE_LABELS: Record<string, string> = {
  property: "Property",
  cafe: "Cafe",
  eu_coffee_trip: "Cafe",
  regular_cafe: "Cafe",
  gym: "Gym",
  office: "Office",
  shopping: "Shopping",
  high_street: "High street",
  dorm: "Student housing",
  university: "University",
  transit: "Transit",
  metro: "Metro",
};

/** Human label for a place type, for the no-photo preview card. */
export function placeTypeLabel(type: string): string {
  return PLACE_TYPE_LABELS[type] ?? "Place";
}

// ---------------------------------------------------------------------------
// Where a shared link should land, remembered across sign-in.
//
// The link arrives as /?focus=<placeId>. If the person is signed out, the
// Google round trip ends on a bare "/", so the destination is parked in
// sessionStorage (per tab, survives the redirect) until the app has signed
// them in, checked their access and loaded the city.
// ---------------------------------------------------------------------------

/** Exported for the map head script, which stays out of the way while a shared place is waiting. */
export const PENDING_KEY = "miners:pending-focus";
/** Long enough for a slow sign-in, short enough that a stale tab forgets. */
export const PENDING_TTL_MS = 30 * 60 * 1000;

export function savePendingFocus(placeId: string, now = Date.now()): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ placeId, at: now }));
  } catch {
    // Private mode or storage disabled: the link just won't survive sign-in.
  }
}

export function readPendingFocus(now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { placeId?: unknown; at?: unknown };
    if (typeof parsed.placeId !== "string" || typeof parsed.at !== "number") return null;
    if (now - parsed.at > PENDING_TTL_MS) {
      sessionStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed.placeId;
  } catch {
    return null;
  }
}

/**
 * The live city of the shared place waiting to open, or null.
 *
 * Worked out from the place id's coordinates, the same rule focusPlace uses
 * when it opens the place, so the app can start in that city instead of
 * loading the person's saved city first and switching seconds later. Null
 * when no link is waiting (or it is stale), the id has no coordinates, or the
 * place is in no city or one that is not live.
 */
export function pendingPlaceCity(now = Date.now()): City | null {
  const placeId = readPendingFocus(now);
  const spot = placeId ? parseCoordinatesFromPlaceId(placeId) : null;
  const city = spot ? cityById(cityForCoordinates(spot.lat, spot.lon)) : undefined;
  return city?.active ? city : null;
}

export function clearPendingFocus(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clear.
  }
}

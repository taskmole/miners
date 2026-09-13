import { supabase } from "@/lib/supabase";

type ApiFetchOptions = RequestInit & {
  noAuth?: boolean;
};

let _getToken: (() => string | null) | null = null;
let _waitForFreshToken: (() => Promise<string | null>) | null = null;

// Called once from AuthContext on mount to wire up token access
export function registerAuthProvider(
  getToken: () => string | null,
  waitForFreshToken: () => Promise<string | null>
): void {
  _getToken = getToken;
  _waitForFreshToken = waitForFreshToken;
}

/**
 * The token read straight from the Supabase client, bypassing AuthContext.
 *
 * This is the safety net for the case that used to blank the map: the two
 * variables above are module state, and AuthProvider fills them in during its
 * render. If anything asks for a token before that has happened, or if this
 * module is re-evaluated afterwards without AuthProvider re-rendering (which
 * is exactly what Fast Refresh does in development), both are null and the
 * old code returned null on the spot. The request then went out with no
 * Authorization header at all and came back 401 in single-digit milliseconds,
 * which is what "Error loading data: Places API 401" on the map was.
 *
 * Reading the session here cannot go stale in the same way, because the
 * Supabase client is the thing that owns it. `getSession()` reads from memory
 * or localStorage and only refreshes when the token is close to expiring, so
 * this is cheap enough to sit on the fallback path.
 */
async function tokenFromSupabaseClient(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * The access token to send, or null when this really is a signed-out or demo
 * session.
 *
 * Three sources in order of cost: the value AuthContext is holding, the
 * promise it resolves when a token next arrives, and the Supabase client
 * itself. Every caller goes through here, so no request can be sent
 * unauthenticated just because AuthContext has not wired itself up yet.
 */
async function currentToken(): Promise<string | null> {
  const held = _getToken ? _getToken() : null;
  if (held) return held;

  if (_waitForFreshToken) {
    const fresh = await _waitForFreshToken();
    if (fresh) return fresh;
  }

  return tokenFromSupabaseClient();
}

/**
 * A token for the retry path, deliberately skipping the AuthContext ref.
 *
 * That ref is only refilled by onAuthStateChange, so a tab that slept past
 * expiry is still holding a dead JWT. currentToken() would hand that same dead
 * value back, the retry would see an unchanged token and give up, and the
 * caller gets the 401 it was trying to recover from. The Supabase client owns
 * the session and refreshes it on read, so it is the one source worth asking a
 * second time.
 */
async function tokenForRetry(): Promise<string | null> {
  const refreshed = await tokenFromSupabaseClient();
  if (refreshed) return refreshed;
  return currentToken();
}

/**
 * The current access token, or null when there is not one yet.
 *
 * Exported for the map data loaders, which cannot use apiFetch: they need a
 * per-request timeout and a fall-back-to-empty behaviour that apiFetch
 * deliberately does not have. They still have to send the token, because the
 * map data is now city-restricted and an unauthenticated request to
 * /api/db/places or /api/data sees nothing at all.
 */
export async function getAuthToken(): Promise<string | null> {
  return currentToken();
}

/** The retry-path counterpart of getAuthToken, for the map data loaders. */
export async function getRefreshedAuthToken(): Promise<string | null> {
  return tokenForRetry();
}

// Fetch wrapper that injects auth headers and retries once on 401
export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { noAuth, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);
  if (!headers.has("Content-Type") && fetchOptions.body) {
    headers.set("Content-Type", "application/json");
  }

  // A caller that set its own Authorization means it, so do not paint over it.
  if (!noAuth && !headers.has("Authorization")) {
    const token = await currentToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  // What actually goes out on the wire, for the 401 retry below to compare
  // against. Read back off the headers rather than from `token`, because a
  // caller may have supplied its own Authorization. If it supplied something
  // that is not a Bearer token, it is not ours to second-guess: leave it alone
  // and do not retry over the top of it.
  const authHeader = headers.get("Authorization");
  const callerSuppliedAuth = authHeader !== null && !authHeader.startsWith("Bearer ");
  const sentToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  // cache: "no-store" skips the browser HTTP cache. localhost:3000 is shared
  // by every project ever run on this machine, and a cacheable redirect left
  // there by another app replays from cache forever (ERR_TOO_MANY_REDIRECTS)
  // without the request ever reaching the server. Our API routes are all
  // force-dynamic anyway, so there is nothing worth caching here.
  let res = await fetch(url, { cache: "no-store", ...fetchOptions, headers });

  // 401 = token expired during request, or was missing because AuthContext had
  // not wired itself up yet. Get a token by whatever route works and retry once.
  // No longer gated on _waitForFreshToken being set: when it is not, that is
  // precisely the case the retry exists for.
  if (res.status === 401 && !noAuth && !callerSuppliedAuth) {
    const freshToken = await tokenForRetry();
    if (freshToken && freshToken !== sentToken) {
      headers.set("Authorization", `Bearer ${freshToken}`);
      res = await fetch(url, { cache: "no-store", ...fetchOptions, headers });
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

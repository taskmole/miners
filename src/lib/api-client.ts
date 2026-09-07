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

  if (!noAuth) {
    let token = _getToken ? _getToken() : null;
    if (!token && _waitForFreshToken) {
      token = await _waitForFreshToken();
    }
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  // cache: "no-store" skips the browser HTTP cache. localhost:3000 is shared
  // by every project ever run on this machine, and a cacheable redirect left
  // there by another app replays from cache forever (ERR_TOO_MANY_REDIRECTS)
  // without the request ever reaching the server. Our API routes are all
  // force-dynamic anyway, so there is nothing worth caching here.
  let res = await fetch(url, { cache: "no-store", ...fetchOptions, headers });

  // 401 = token expired during request. Wait for refresh, retry once.
  if (res.status === 401 && !noAuth && _waitForFreshToken) {
    const freshToken = await _waitForFreshToken();
    if (freshToken) {
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

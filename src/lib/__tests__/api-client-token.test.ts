import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The map went blank with "Error loading data: Places API 401: Unauthorized"
 * and the server log said the requests arrived with no Authorization header at
 * all.
 *
 * Cause: `_getToken` and `_waitForFreshToken` in api-client are module state,
 * filled in by AuthProvider during its render. Anything that asked for a token
 * before that had happened - or after the module was re-evaluated without
 * AuthProvider re-rendering, which is what Fast Refresh does - found both null
 * and the old code returned null immediately. The request then went out
 * unauthenticated and came back 401 in single-digit milliseconds.
 *
 * The fix is a third source: the Supabase client itself, which owns the
 * session and cannot fall out of step with it. These tests pin that down,
 * including the cases that must NOT change.
 */

const getSession = vi.fn();

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return { auth: { getSession } };
  },
}));

/** Fresh module state per test: the registration lives in module scope. */
async function freshClient() {
  vi.resetModules();
  return import('../api-client');
}

const withSession = (token: string | null) => {
  getSession.mockResolvedValue({
    data: { session: token ? { access_token: token } : null },
  });
};

describe('getAuthToken', () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to the Supabase session when no provider is registered', async () => {
    // The regression. Before the fix this returned null on the spot.
    const { getAuthToken } = await freshClient();
    withSession('token-from-supabase');

    expect(await getAuthToken()).toBe('token-from-supabase');
  });

  it('prefers the token AuthContext is holding, without touching Supabase', async () => {
    const { getAuthToken, registerAuthProvider } = await freshClient();
    withSession('token-from-supabase');
    registerAuthProvider(() => 'token-from-context', async () => 'fresh');

    expect(await getAuthToken()).toBe('token-from-context');
    expect(getSession).not.toHaveBeenCalled();
  });

  it('waits for a fresh token before falling back', async () => {
    const { getAuthToken, registerAuthProvider } = await freshClient();
    withSession('token-from-supabase');
    registerAuthProvider(() => null, async () => 'token-from-wait');

    expect(await getAuthToken()).toBe('token-from-wait');
    expect(getSession).not.toHaveBeenCalled();
  });

  it('still returns null for a signed-out or demo visitor', async () => {
    // This one matters as much as the fix: a demo user must not start
    // sending headers, and must not hang waiting for a token that is never
    // coming.
    const { getAuthToken } = await freshClient();
    withSession(null);

    expect(await getAuthToken()).toBeNull();
  });

  it('survives a Supabase client that throws', async () => {
    const { getAuthToken } = await freshClient();
    getSession.mockRejectedValue(new Error('offline'));

    expect(await getAuthToken()).toBeNull();
  });
});

describe('apiFetch authorisation', () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ok = () => ({ status: 200, ok: true, text: async () => '{"ok":true}' });

  it('sends the header even when only the Supabase fallback has a token', async () => {
    const { apiFetch } = await freshClient();
    withSession('token-from-supabase');
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/db/lists');

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-from-supabase');
  });

  it('sends no header for a signed-out visitor', async () => {
    const { apiFetch } = await freshClient();
    withSession(null);
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/data?type=cafes');

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 401 once with a newer token', async () => {
    const { apiFetch, registerAuthProvider } = await freshClient();
    withSession(null);
    let current = 'stale';
    registerAuthProvider(() => current, async () => current);

    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => {
        current = 'refreshed';
        return { status: 401, ok: false, text: async () => 'Unauthorized' };
      })
      .mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/db/lists');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryHeaders = fetchMock.mock.calls[1][1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer refreshed');
  });

  /**
   * The retry has to skip the AuthContext ref, not just read it again.
   *
   * `_getToken` returns AuthContext's tokenRef, which is only refilled by
   * onAuthStateChange. A tab that slept past expiry still holds the dead JWT,
   * so asking the same source twice returns the same dead value, the retry
   * decides nothing changed, and the caller gets the 401 it was recovering
   * from. Only the Supabase client can refresh.
   */
  it('retries a 401 with a refreshed token when AuthContext is holding a stale one', async () => {
    const { apiFetch, registerAuthProvider } = await freshClient();
    // AuthContext is stuck on the expired token and will keep saying so.
    registerAuthProvider(() => 'expired', async () => 'expired');
    // Supabase refreshed the session on read, which is the only live source.
    withSession('refreshed-by-supabase');

    // apiFetch reuses one Headers instance across the retry, so read the value
    // as each call happens rather than off the recorded (and since mutated) object.
    const sent: (string | null)[] = [];
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      sent.push((init.headers as Headers).get('Authorization'));
      return sent.length === 1
        ? { status: 401, ok: false, text: async () => 'Unauthorized' }
        : ok();
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/db/lists');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sent).toEqual(['Bearer expired', 'Bearer refreshed-by-supabase']);
  });

  it('leaves a caller-supplied non-Bearer Authorization alone', async () => {
    // slice(7) on "Basic abc123" used to yield "bc123", which never matched the
    // fresh token, so the retry overwrote the caller's own credential.
    const { apiFetch } = await freshClient();
    withSession('token-from-supabase');

    const fetchMock = vi.fn().mockResolvedValue({
      status: 401, ok: false, text: async () => 'Unauthorized',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiFetch('/api/db/lists', { headers: { Authorization: 'Basic abc123' } }),
    ).rejects.toThrow('API 401');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Basic abc123');
  });

  it('does not retry a 401 when the same token comes back', async () => {
    // Otherwise a genuine permission refusal costs every caller two requests.
    const { apiFetch, registerAuthProvider } = await freshClient();
    withSession(null);
    registerAuthProvider(() => 'same', async () => 'same');

    const fetchMock = vi.fn().mockResolvedValue({
      status: 401, ok: false, text: async () => 'Unauthorized',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/db/lists')).rejects.toThrow('API 401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves noAuth requests alone', async () => {
    const { apiFetch } = await freshClient();
    withSession('token-from-supabase');
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/public', { noAuth: true });

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });
});

/**
 * tokenRefresh tests — proactive timer + reactive refresh + reauth event
 *
 * The module keeps a few module-scope `let`s (in-flight refresh dedupe
 * promise, scheduled timer ref, listener Set). To get a clean state per
 * test we use `vi.resetModules()` + dynamic import so each test gets a
 * fresh copy of the module.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type TokenRefreshModule = typeof import('../src/auth/tokenRefresh');

/** Build a JWT-shaped string with the given exp (seconds since epoch). */
function jwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 'u', username: 'jamie', exp }));
  return `${header}.${payload}.sig`;
}

async function freshModule(): Promise<TokenRefreshModule> {
  vi.resetModules();
  return (await import('../src/auth/tokenRefresh')) as TokenRefreshModule;
}

describe('tokenRefresh', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    dispatchSpy = vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    dispatchSpy.mockRestore();
  });

  it('isTokenExpired: true for past exp, false for future', async () => {
    const { isTokenExpired } = await freshModule();
    const past = Math.floor(Date.now() / 1000) - 60;
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(isTokenExpired(jwt(past))).toBe(true);
    expect(isTokenExpired(jwt(future))).toBe(false);
  });

  it('isTokenExpired: false for unparseable token (server has final say)', async () => {
    const { isTokenExpired } = await freshModule();
    expect(isTokenExpired('not-a-jwt')).toBe(false);
  });

  it('getTokenExpiryMs: returns ms epoch from exp claim', async () => {
    const { getTokenExpiryMs } = await freshModule();
    const exp = Math.floor(Date.now() / 1000) + 100;
    expect(getTokenExpiryMs(jwt(exp))).toBe(exp * 1000);
  });

  it('refreshToken: posts username to /dev/token, stores new token, notifies subscribers', async () => {
    localStorage.setItem('auth_player', JSON.stringify({ username: 'jamie' }));
    const newToken = jwt(Math.floor(Date.now() / 1000) + 3600);
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ token: newToken }), { status: 200 }),
    );

    const mod = await freshModule();
    const listener = vi.fn();
    mod.subscribeToTokenChanges(listener);

    const result = await mod.refreshToken();

    expect(result).toBe(newToken);
    expect(localStorage.getItem('auth_token')).toBe(newToken);
    expect(listener).toHaveBeenCalledWith(newToken);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/dev\/token$/);
    expect(init?.method).toBe('POST');
    expect(init?.body).toContain('jamie');

    mod.cancelRefresh();
  });

  it('refreshToken: emits auth:reauth-required when no stored player', async () => {
    const mod = await freshModule();
    const result = await mod.refreshToken();
    expect(result).toBeNull();
    const calls = dispatchSpy.mock.calls.map((c) => (c[0] as Event).type);
    expect(calls).toContain('auth:reauth-required');
  });

  it('refreshToken: emits auth:reauth-required when /dev/token returns 4xx', async () => {
    localStorage.setItem('auth_player', JSON.stringify({ username: 'jamie' }));
    fetchSpy.mockResolvedValue(new Response('{}', { status: 401 }));

    const mod = await freshModule();
    const result = await mod.refreshToken();
    expect(result).toBeNull();
    const calls = dispatchSpy.mock.calls.map((c) => (c[0] as Event).type);
    expect(calls).toContain('auth:reauth-required');
  });

  it('refreshToken: dedupes concurrent callers (single network round-trip)', async () => {
    localStorage.setItem('auth_player', JSON.stringify({ username: 'jamie' }));
    let resolveFetch: (v: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((res) => { resolveFetch = res; });
    fetchSpy.mockReturnValue(fetchPromise);

    const mod = await freshModule();
    const a = mod.refreshToken();
    const b = mod.refreshToken();
    const c = mod.refreshToken();

    resolveFetch(new Response(JSON.stringify({ token: jwt(Math.floor(Date.now() / 1000) + 3600) }), { status: 200 }));

    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(ra).toBe(rb);
    expect(rb).toBe(rc);
    expect(fetchSpy).toHaveBeenCalledOnce();
    mod.cancelRefresh();
  });

  it('scheduleRefresh: refreshes immediately when token already past the safety window', async () => {
    localStorage.setItem('auth_player', JSON.stringify({ username: 'jamie' }));
    const newToken = jwt(Math.floor(Date.now() / 1000) + 3600);
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ token: newToken }), { status: 200 }),
    );

    const mod = await freshModule();
    // Token expires in 60s, but safety window is 5 min — refresh immediately.
    const nearExp = jwt(Math.floor(Date.now() / 1000) + 60);
    mod.scheduleRefresh(nearExp);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled(), { timeout: 1000 });
    mod.cancelRefresh();
  });

  it('scheduleRefresh: defers when token has plenty of life left', async () => {
    const mod = await freshModule();
    const farFuture = jwt(Math.floor(Date.now() / 1000) + 7200); // 2h
    mod.scheduleRefresh(farFuture);
    // Give the microtask queue a tick — fetch should NOT have been called.
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).not.toHaveBeenCalled();
    mod.cancelRefresh();
  });
});

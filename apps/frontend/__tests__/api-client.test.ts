/**
 * API client tests — fetch wrapper with token interceptor
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiFetch } from '../src/api/client';

// The 401-retry path calls refreshToken(). Mock it so the suite doesn't
// depend on a real /dev/token endpoint and we can assert call counts.
vi.mock('../src/auth/tokenRefresh', () => ({
  refreshToken: vi.fn(),
  scheduleRefresh: vi.fn(),
  cancelRefresh: vi.fn(),
  isTokenExpired: vi.fn().mockReturnValue(false),
  subscribeToTokenChanges: vi.fn().mockReturnValue(() => {}),
}));
import { refreshToken } from '../src/auth/tokenRefresh';

describe('apiFetch', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let getItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    // The refreshToken mock is module-scoped so its `mock` queue persists
    // across tests — reset it explicitly so previous mockResolvedValueOnce
    // calls don't leak in.
    (refreshToken as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    getItemSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('is exported as a function', () => {
    expect(typeof apiFetch).toBe('function');
  });

  it('includes Authorization header when token exists in sessionStorage', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    getItemSpy.mockImplementation((key: string) =>
      key === 'auth_token' ? 'test-token-123' : null
    );

    await apiFetch('/rooms');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token-123');
  });

  it('omits Authorization header when no token in sessionStorage', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    getItemSpy.mockReturnValue(null);

    await apiFetch('/rooms');

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('rejects with ApiError object on non-2xx response', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    );
    getItemSpy.mockReturnValue(null);

    await expect(apiFetch('/rooms/unknown')).rejects.toMatchObject({
      status: 404,
      message: 'Not found',
    });
  });

  it('includes the relative path in the request URL', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );
    getItemSpy.mockReturnValue(null);

    await apiFetch('/rooms');
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/rooms$/);
  });

  it('returns empty object for 204 No Content responses', async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, { status: 204 })
    );
    getItemSpy.mockReturnValue(null);

    const result = await apiFetch('/rooms/123');
    expect(result).toEqual({});
  });

  it('passes the request method through to fetch', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );
    getItemSpy.mockReturnValue(null);

    await apiFetch('/rooms', { method: 'POST', body: JSON.stringify({ name: 'test' }) });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init?.method).toBe('POST');
  });

  // --------------------------------------------------------------------
  // 401 reactive refresh + retry
  // --------------------------------------------------------------------

  it('on 401, refreshes the token and retries the request once with the new token', async () => {
    // First call returns 401, second call (after refresh) returns 200.
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'expired' }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    // First read = stale token, second read (after refresh) = fresh token.
    getItemSpy
      .mockImplementationOnce((key: string) => (key === 'auth_token' ? 'stale' : null))
      .mockImplementationOnce((key: string) => (key === 'auth_token' ? 'fresh' : null));
    (refreshToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce('fresh');

    const result = await apiFetch('/rooms');
    expect(result).toEqual({ ok: true });
    expect(refreshToken).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // The retry call must carry the fresh token.
    const [, retryInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    const retryHeaders = new Headers(retryInit?.headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh');
  });

  it('on 401, surfaces the original error if refresh fails', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'expired' }), { status: 401 }),
    );
    getItemSpy.mockReturnValue('stale');
    (refreshToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(apiFetch('/rooms')).rejects.toMatchObject({ status: 401 });
    expect(refreshToken).toHaveBeenCalledOnce();
    // Only the original request, no retry, when refresh comes back empty.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT attempt refresh+retry on 401 from /dev/token (avoids recursion)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad creds' }), { status: 401 }),
    );
    getItemSpy.mockReturnValue('stale');

    await expect(apiFetch('/dev/token', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      status: 401,
    });
    expect(refreshToken).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

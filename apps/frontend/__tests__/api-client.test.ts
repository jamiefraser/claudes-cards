/**
 * API client tests — fetch wrapper with token interceptor
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiFetch } from '../src/api/client';

describe('apiFetch', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let getItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
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
});

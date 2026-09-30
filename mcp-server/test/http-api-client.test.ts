import { describe, it, expect, vi } from 'vitest';
// AC26: HttpApiClient(baseUrl, fetchImpl), from the not-yet-created adapter.
import { HttpApiClient } from '../src/adapters/http-api-client.js';
import { ApiError } from '../src/ports/api-client.js';

function fakeResponse(opts: { ok: boolean; status: number; body: unknown }) {
  return {
    ok: opts.ok,
    status: opts.status,
    json: async () => opts.body,
  } as Response;
}

describe('HttpApiClient', () => {
  it('encodes path ids', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL) => {
      calls.push(String(input));
      return fakeResponse({ ok: true, status: 200, body: { id: 'x', pr_id: 'x', files: [] } });
    });
    const client = new HttpApiClient('http://localhost:3001', fetchImpl as unknown as typeof fetch);
    await client.getPullDetail('weird id/with slash');
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!);
    // The raw id must not appear unescaped in the path (it contains '/' and a space).
    expect(url.pathname).not.toContain('weird id/with slash');
    expect(url.pathname).toContain(encodeURIComponent('weird id/with slash'));
  });

  it('parses error envelope', async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse({
        ok: false,
        status: 404,
        body: { error: { code: 'not_found', message: 'PR abc not found' } },
      }),
    );
    const client = new HttpApiClient('http://localhost:3001', fetchImpl as unknown as typeof fetch);
    await expect(client.getPullDetail('abc')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'PR abc not found',
      method: 'GET',
    });
    try {
      await client.getPullDetail('abc');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
  });

  it('connection refused is status null', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const client = new HttpApiClient('http://localhost:3001', fetchImpl as unknown as typeof fetch);
    await expect(client.listRepos()).rejects.toMatchObject({ status: null });
  });

  it('wrong top-level shape is bad_response', async () => {
    // listRepos expects an array; return an object instead.
    const fetchImpl = vi.fn(async () =>
      fakeResponse({ ok: true, status: 200, body: { not: 'an array' } }),
    );
    const client = new HttpApiClient('http://localhost:3001', fetchImpl as unknown as typeof fetch);
    await expect(client.listRepos()).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('wrong top-level shape is bad_response the other way', async () => {
    // getPullDetail expects an object; return an array instead.
    const fetchImpl = vi.fn(async () => fakeResponse({ ok: true, status: 200, body: [] }));
    const client = new HttpApiClient('http://localhost:3001', fetchImpl as unknown as typeof fetch);
    await expect(client.getPullDetail('abc')).rejects.toMatchObject({ code: 'bad_response' });
  });
});

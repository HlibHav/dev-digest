import { describe, it, expect } from 'vitest';
import { ApiError } from '../src/ports/api-client.js';
// AC9: toToolError(err, apiUrl), from the not-yet-created app/errors.ts.
import { toToolError, ToolError } from '../src/app/errors.js';

describe('toToolError', () => {
  it('429 → E6', () => {
    const apiError = new ApiError('too many requests', {
      status: 429,
      code: 'rate_limited',
      method: 'POST',
      path: '/pulls/pr-1/review',
    });
    const toolError = toToolError(apiError, 'http://localhost:3001');
    expect(toolError).toBeInstanceOf(ToolError);
    expect(toolError.message).toBe(
      'The DevDigest API allows 10 review runs per minute. Wait a minute, then retry.',
    );
  });

  it('unreachable → E8', () => {
    const apiError = new ApiError('fetch failed', {
      status: null,
      code: 'network_error',
      method: 'GET',
      path: '/agents',
    });
    const toolError = toToolError(apiError, 'http://localhost:3201');
    expect(toolError.message).toBe(
      'DevDigest API is not reachable at http://localhost:3201. Start it (cd server && pnpm dev) or set DEVDIGEST_API_URL.',
    );
  });

  it('other status → E9', () => {
    const apiError = new ApiError('internal error', {
      status: 500,
      code: 'internal_error',
      method: 'GET',
      path: '/repos/r1/pulls',
    });
    const toolError = toToolError(apiError, 'http://localhost:3001');
    expect(toolError.message).toBe(
      'DevDigest API error 500 on GET /repos/r1/pulls: internal error.',
    );
  });

  it('E9 truncates the message to 200 chars', () => {
    const longMessage = 'x'.repeat(500);
    const apiError = new ApiError(longMessage, {
      status: 500,
      code: 'internal_error',
      method: 'GET',
      path: '/repos/r1/pulls',
    });
    const toolError = toToolError(apiError, 'http://localhost:3001');
    // Prefix: 'DevDigest API error 500 on GET /repos/r1/pulls: ' + <=200 chars + '.'
    const prefix = 'DevDigest API error 500 on GET /repos/r1/pulls: ';
    expect(toolError.message.startsWith(prefix)).toBe(true);
    const rest = toolError.message.slice(prefix.length);
    expect(rest.length).toBeLessThanOrEqual(201); // <=200 chars + trailing '.'
  });
});

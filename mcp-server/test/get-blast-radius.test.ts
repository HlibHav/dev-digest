import { describe, it, expect } from 'vitest';
// AC17: getBlastRadius(input), from the not-yet-created app/blast-radius.ts. Its signature
// takes no ServerDeps/ApiClient argument at all, so "zero API calls" is structural here.
import { getBlastRadius } from '../src/app/blast-radius.js';

describe('getBlastRadius', () => {
  it('returns not_implemented without API calls', () => {
    const out = getBlastRadius({ repo: 'acme/payments-api', pr: 42 });
    expect(out).toEqual({
      status: 'not_implemented',
      repo: 'acme/payments-api',
      pr: 42,
      message:
        'Blast radius is not implemented yet (L04 homework). Use devdigest_get_findings for review results on this PR.',
    });
  });

  it('accepts an optional files array without changing the result', () => {
    const out = getBlastRadius({ repo: 'acme/payments-api', pr: 42, files: ['src/a.ts', 'src/b.ts'] });
    expect(out.status).toBe('not_implemented');
    expect(out.repo).toBe('acme/payments-api');
    expect(out.pr).toBe(42);
  });
});

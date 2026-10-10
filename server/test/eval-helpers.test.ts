import { describe, it, expect } from 'vitest';
import {
  caseNameFromFinding,
  buildCaseDiff,
  diffBytes,
  prDescription,
  redactSecrets,
} from '../src/modules/eval/helpers.js';

describe('eval helpers', () => {
  it("AC-6 caseNameFromFinding gives 'src/config.ts:12 — Hardcoded Stripe secret key in commit'", () => {
    expect(
      caseNameFromFinding({
        file: 'src/config.ts',
        start_line: 12,
        title: 'Hardcoded Stripe secret key in commit',
      }),
    ).toBe('src/config.ts:12 — Hardcoded Stripe secret key in commit');
  });

  it('buildCaseDiff prepends the git file header and keeps the patch verbatim', () => {
    const patch = '@@ -1 +1 @@\n-a\n+b';
    const out = buildCaseDiff('src/b.ts', patch);
    expect(out.startsWith('diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n')).toBe(true);
    expect(out.endsWith(patch)).toBe(true);
  });

  it('diffBytes counts UTF-8 bytes, not characters', () => {
    expect(diffBytes('é')).toBe(2);
    expect(diffBytes('abc')).toBe(3);
    expect(diffBytes('')).toBe(0);
  });

  it('prDescription joins title and body, trims, and is undefined when empty', () => {
    expect(prDescription({ title: 'T', body: 'B' })).toBe('T\n\nB');
    expect(prDescription({ title: '  T ', body: '' })).toBe('T');
    expect(prDescription({ title: '', body: ' B ' })).toBe('B');
    expect(prDescription({ title: ' ', body: '\n' })).toBeUndefined();
  });

  it('redactSecrets masks github, google, xai keys and key=value pairs', () => {
    const out = redactSecrets(
      'ghp_abcdefghijklmnop1234 github_pat_11AAA_bbbCCC AIzaSyA1234567890abcdefghij xai-abc123XYZ url?api_key=hunter2&x=1 token=abc.def',
    );
    for (const raw of ['ghp_abcdefghijklmnop1234', 'github_pat_11AAA', 'AIzaSyA1234', 'xai-abc123', 'hunter2', 'abc.def']) {
      expect(out).not.toContain(raw);
    }
    expect(out).toContain('x=1');
  });

  it('redactSecrets masks sk- keys and Bearer tokens and leaves other text alone', () => {
    const out = redactSecrets('key sk-abc123DEF456 and Authorization: Bearer xyz.789 failed');
    expect(out).not.toContain('abc123DEF456');
    expect(out).not.toContain('xyz.789');
    expect(out).toBe('key sk-*** and Authorization: Bearer *** failed');
    expect(redactSecrets('plain message')).toBe('plain message');
  });
});

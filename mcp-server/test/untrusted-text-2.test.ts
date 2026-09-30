import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Repo, ConventionCandidate } from '@devdigest/shared';
import { FakeApiClient, type FakeSeed } from '../src/adapters/mocks.js';
import type { Clock, ServerDeps } from '../src/ports/api-client.js';
import { ApiError } from '../src/ports/api-client.js';
import { getConventions } from '../src/app/conventions.js';
import { toToolError } from '../src/app/errors.js';
import { sanitizeUntrusted } from '../src/app/present.js';

// ---- Revision 2.3 (security re-review follow-ups) ----
// 1. convention `category` passes through sanitizeUntrusted and is capped at 60 chars.
// 2. the E9 API error `message` is passed through sanitizeUntrusted before the existing
//    200-char cut.
// 3. sanitizeUntrusted additionally strips U+2061-2069 (whole U+2060-2069 block), U+061C,
//    U+00AD and U+007F, while still keeping U+FE0F, \n, \t, Cyrillic and emoji.
// 4. the regex source in app/present.ts contains no raw invisible/bidi/tag/C0/C1 characters,
//    only \u / \u{} escapes.

// ---- fixtures (mirrors untrusted-text.test.ts's fixture style) ----

function repo(overrides: Partial<Repo>): Repo {
  return {
    id: overrides.id ?? 'r1',
    workspace_id: 'ws-1',
    owner: 'acme',
    name: 'payments-api',
    full_name: 'acme/payments-api',
    default_branch: 'main',
    clone_path: null,
    last_polled_at: null,
    created_by: null,
    ...overrides,
  };
}

function candidate(overrides: Partial<ConventionCandidate>): ConventionCandidate {
  return {
    id: overrides.id ?? 'cand-1',
    category: 'naming',
    rule: 'Use kebab-case for file names.',
    evidence_path: 'src/foo-bar.ts',
    evidence_line: 1,
    evidence_snippet: 'export function fooBar() {}',
    confidence: 0.9,
    status: 'accepted',
    ...overrides,
  };
}

function noopClock(): Clock {
  return { now: () => 0, sleep: async () => {} };
}

function emptySeed(): FakeSeed {
  return {
    repos: [],
    pullsByRepo: {},
    detailsByPr: {},
    agents: [],
    startedRun: { pr_id: 'pr-1', runs: [], reviews: [] },
    runsByPr: {},
    reviewsByPr: {},
    conventionsByRepo: {},
  };
}

function deps(seed: FakeSeed, clock: Clock = noopClock()): { deps: ServerDeps; api: FakeApiClient } {
  const api = new FakeApiClient(seed);
  return { deps: { api, clock, waitMs: 110000, pollMs: 2000, apiUrl: 'http://localhost:3001' }, api };
}

// ---- the dirty payload, reused from untrusted-text.test.ts ----

const ZW = '​﻿';
const BIDI = '‮⁦';
const TAG = '\u{E0041}';
const C0 = '\u0007';
const C1 = '\u0085';
const DIRTY = `Hello${ZW}World${BIDI}Test${TAG}Tag${C0}Bell${C1}Nel\nNewline\tTab Привіт 🎉`;
const CLEAN = 'HelloWorldTestTagBellNel\nNewline\tTab Привіт 🎉';

describe('convention category (Revision 2.3 #1)', () => {
  it('sanitizes the category through sanitizeUntrusted', async () => {
    const seed = emptySeed();
    seed.repos = [repo({ id: 'r1', full_name: 'acme/payments-api' })];
    seed.conventionsByRepo['r1'] = {
      candidates: [candidate({ id: 'c1', category: DIRTY })],
      scan: null,
    };
    const { deps: d } = deps(seed);
    const out = await getConventions(d, { repo: 'acme/payments-api' });
    expect(out.conventions[0]!.category).toBe(CLEAN);
  });

  it('caps the category at 60 chars', async () => {
    const seed = emptySeed();
    seed.repos = [repo({ id: 'r1', full_name: 'acme/payments-api' })];
    const longCategory = 'x'.repeat(90);
    seed.conventionsByRepo['r1'] = {
      candidates: [candidate({ id: 'c1', category: longCategory })],
      scan: null,
    };
    const { deps: d } = deps(seed);
    const out = await getConventions(d, { repo: 'acme/payments-api' });
    expect(out.conventions[0]!.category.length).toBeLessThanOrEqual(60);
  });
});

describe('E9 error message (Revision 2.3 #2)', () => {
  it('sanitizes the API error message before the 200-char cut', () => {
    const apiError = new ApiError(DIRTY, {
      status: 500,
      code: 'internal_error',
      method: 'GET',
      path: '/repos/r1/pulls',
    });
    const toolError = toToolError(apiError, 'http://localhost:3001');
    const prefix = 'DevDigest API error 500 on GET /repos/r1/pulls: ';
    expect(toolError.message.startsWith(prefix)).toBe(true);
    const rest = toolError.message.slice(prefix.length);
    // trailing '.' appended by toToolError
    expect(rest).toBe(`${CLEAN}.`);
  });
});

describe('sanitizeUntrusted widened character classes (Revision 2.3 #3)', () => {
  it('strips U+2061-2069 (function application / invisible operators / directional isolates)', () => {
    const dirty = `A⁡B⁤C⁦D⁩E`;
    expect(sanitizeUntrusted(dirty)).toBe('ABCDE');
  });

  it('strips U+061C (Arabic letter mark)', () => {
    const dirty = `left؜right`;
    expect(sanitizeUntrusted(dirty)).toBe('leftright');
  });

  it('strips U+00AD (soft hyphen)', () => {
    const dirty = `soft­hyphen`;
    expect(sanitizeUntrusted(dirty)).toBe('softhyphen');
  });

  it('strips U+007F (DEL)', () => {
    const dirty = `de\u007Fl`;
    expect(sanitizeUntrusted(dirty)).toBe('del');
  });

  it('keeps U+FE0F (variation selector) so "❤️" survives intact', () => {
    const heart = '❤️';
    expect(sanitizeUntrusted(heart)).toBe(heart);
  });

  it('keeps \\n, \\t, Cyrillic and emoji', () => {
    expect(sanitizeUntrusted(CLEAN)).toBe(CLEAN);
  });
});

describe('no raw invisible characters in present.ts source (Revision 2.3 #4)', () => {
  it('the regex source contains only \\u / \\u{} escapes for invisible/bidi/tag/C0/C1 characters', () => {
    const presentPath = fileURLToPath(new URL('../src/app/present.ts', import.meta.url));
    const source = readFileSync(presentPath, 'utf8');
    // Zero-width + bidi + the widened U+2060-2069 block, the Unicode tag block, U+061C,
    // U+00AD, U+007F, and C0/C1 controls other than \n (\u000A) and \t (\u0009).
    const BANNED_LITERAL_RE =
      /[\u0000-\u0008\u000B-\u001F\u007F\u0080-\u009F­؜​-‏‪-‮⁠-⁩﻿\u{E0000}-\u{E007F}]/u;
    expect(BANNED_LITERAL_RE.test(source)).toBe(false);
  });
});

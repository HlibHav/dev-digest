import { describe, it, expect } from 'vitest';
import type { Repo, ConventionCandidate } from '@devdigest/shared';
import { FakeApiClient, type FakeSeed } from '../src/adapters/mocks.js';
import type { Clock, ServerDeps } from '../src/ports/api-client.js';
// AC16, AC21: getConventions(deps, input), from the not-yet-created app/conventions.ts.
import { getConventions } from '../src/app/conventions.js';
import { ToolError } from '../src/app/errors.js';

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

function deps(seed: FakeSeed): ServerDeps {
  return {
    api: new FakeApiClient(seed),
    clock: noopClock(),
    waitMs: 110000,
    pollMs: 2000,
    apiUrl: 'http://localhost:3001',
  };
}

describe('getConventions', () => {
  it('accepted by default', async () => {
    const seed = emptySeed();
    const theRepo = repo({ id: 'r1', full_name: 'acme/payments-api' });
    seed.repos = [theRepo];
    seed.conventionsByRepo['r1'] = {
      candidates: [
        candidate({ id: 'c1', status: 'accepted', category: 'naming' }),
        candidate({ id: 'c2', status: 'pending', category: 'style' }),
        candidate({ id: 'c3', status: 'rejected', category: 'security' }),
      ],
      scan: null,
    };
    const out = await getConventions(deps(seed), { repo: 'acme/payments-api' });
    expect(out.repo).toBe('acme/payments-api');
    expect(out.conventions).toHaveLength(1);
    expect(out.conventions[0]).toMatchObject({
      category: 'naming',
      rule: 'Use kebab-case for file names.',
      file: 'src/foo-bar.ts',
      line: 1,
    });
  });

  it('status all/pending', async () => {
    const seed = emptySeed();
    const theRepo = repo({ id: 'r1', full_name: 'acme/payments-api' });
    seed.repos = [theRepo];
    seed.conventionsByRepo['r1'] = {
      candidates: [
        candidate({ id: 'c1', status: 'accepted' }),
        candidate({ id: 'c2', status: 'pending' }),
        candidate({ id: 'c3', status: 'rejected' }),
      ],
      scan: null,
    };
    const pending = await getConventions(deps(seed), { repo: 'acme/payments-api', status: 'pending' });
    expect(pending.conventions.map((c: { category: string }) => c.category)).toHaveLength(1);
    const all = await getConventions(deps(seed), { repo: 'acme/payments-api', status: 'all' });
    expect(all.conventions).toHaveLength(3);
  });

  it('empty is not an error (M4)', async () => {
    const seed = emptySeed();
    const theRepo = repo({ id: 'r1', full_name: 'acme/payments-api' });
    seed.repos = [theRepo];
    seed.conventionsByRepo['r1'] = { candidates: [], scan: null };
    const out = await getConventions(deps(seed), { repo: 'acme/payments-api' });
    expect(out).toMatchObject({
      conventions: [],
      message: 'No accepted conventions for acme/payments-api — extract and accept them in DevDigest (Conventions), then retry.',
    });
  });

  it('caps 200 candidates', async () => {
    const seed = emptySeed();
    const theRepo = repo({ id: 'r1', full_name: 'acme/payments-api' });
    seed.repos = [theRepo];
    seed.conventionsByRepo['r1'] = {
      candidates: Array.from({ length: 200 }, (_, i) =>
        candidate({ id: `c${i}`, status: 'accepted', category: `cat-${i}` }),
      ),
      scan: null,
    };
    const out = await getConventions(deps(seed), { repo: 'acme/payments-api' });
    expect(out.conventions).toHaveLength(50);
    expect(out.total).toBe(200);
    expect(out.truncated).toBe(true);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(20000);
  });

  it('unknown repo gives E1', async () => {
    const seed = emptySeed();
    const api = new FakeApiClient(seed);
    await expect(
      getConventions(
        { api, clock: noopClock(), waitMs: 110000, pollMs: 2000, apiUrl: 'http://localhost:3001' },
        { repo: 'acme/unknown' },
      ),
    ).rejects.toBeInstanceOf(ToolError);
  });
});

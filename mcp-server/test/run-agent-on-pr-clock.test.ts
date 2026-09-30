import { describe, it, expect } from 'vitest';
import type { Repo, PrMeta, PrDetail, Agent, ReviewRecord, RunSummary, FindingRecord } from '@devdigest/shared';
import { FakeApiClient, type FakeSeed } from '../src/adapters/mocks.js';
import type { Clock, ServerDeps } from '../src/ports/api-client.js';
import { runAgentOnPr } from '../src/app/reviews.js';

// Regression for the bug at src/app/reviews.ts:80 — `deps.clock.now() >= deps.waitMs` compares
// an absolute timestamp to a duration. With a fake clock whose `now()` starts at a realistic
// epoch (not 0), that condition is true on the very first check, before any polling happens.
// These tests use a clock that starts at a large epoch and only advances as `sleep` is awaited,
// so they catch the bug that the existing (clock-starts-at-0) tests miss.

const REALISTIC_EPOCH = 1_790_000_000_000;

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

function pr(overrides: Partial<PrMeta>): PrMeta {
  return {
    id: overrides.id ?? 'pr-1',
    number: 42,
    title: 'Fix things',
    author: 'octocat',
    branch: 'feature',
    base: 'main',
    head_sha: 'abc123',
    additions: 1,
    deletions: 1,
    files_count: 1,
    status: 'open',
    ...overrides,
  };
}

function detail(overrides: Partial<PrDetail>): PrDetail {
  return {
    ...pr({}),
    body: null,
    files: [{ path: 'src/a.ts', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n+line' }],
    commits: [],
    linked_issue: null,
    ...overrides,
  };
}

function agent(overrides: Partial<Agent>): Agent {
  return {
    id: overrides.id ?? 'agent-1',
    name: 'Security Reviewer',
    description: 'Reviews for security issues.',
    provider: 'openrouter',
    model: 'openai/gpt-4.1-mini',
    system_prompt: 'You are a reviewer.',
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    uses_intent: false,
    ...overrides,
  };
}

function finding(overrides: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: 'WARNING',
    category: 'bug',
    title: 'A finding',
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'Some rationale text.',
    suggestion: null,
    confidence: 0.8,
    kind: 'finding',
    review_id: 'review-1',
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord> & { id: string }): ReviewRecord {
  return {
    pr_id: 'pr-1',
    agent_id: 'agent-1',
    run_id: 'run-1',
    agent_name: 'Security Reviewer',
    kind: 'review',
    verdict: 'comment',
    summary: 'A summary.',
    score: 80,
    model: 'openai/gpt-4.1-mini',
    grounding: 'grounded',
    created_at: '2026-09-01T00:00:00.000Z',
    findings: [],
    ...overrides,
  };
}

function runSummary(overrides: Partial<RunSummary> & { run_id: string }): RunSummary {
  return {
    agent_id: 'agent-1',
    agent_name: 'Security Reviewer',
    provider: 'openrouter',
    model: 'openai/gpt-4.1-mini',
    status: 'running',
    error: null,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    findings_count: null,
    grounding: null,
    ran_at: '2026-09-01T00:00:00.000Z',
    score: null,
    blockers: null,
    cost_usd: null,
    ...overrides,
  };
}

/** A clock whose `now()` starts at a realistic epoch and advances only as `sleep(ms)` is
 * awaited — unlike the existing tests' fake clock, which starts at 0. */
function realisticClock(): { clock: Clock; sleeps: number[] } {
  let now = REALISTIC_EPOCH;
  const sleeps: number[] = [];
  const clock: Clock = {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
      if (sleeps.length > 200) {
        throw new Error('fake clock: too many sleeps, aborting to avoid a hang');
      }
    },
  };
  return { clock, sleeps };
}

function baseSeed(): FakeSeed {
  const theRepo = repo({ id: 'r1', full_name: 'acme/payments-api' });
  const thePr = pr({ id: 'pr-1', number: 42 });
  const theAgent = agent({ id: 'agent-1', name: 'Security Reviewer' });
  return {
    repos: [theRepo],
    pullsByRepo: { r1: [thePr] },
    detailsByPr: { 'pr-1': detail({}) },
    agents: [theAgent],
    startedRun: {
      pr_id: 'pr-1',
      runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Security Reviewer' }],
      reviews: [],
    },
    runsByPr: {},
    reviewsByPr: {},
    conventionsByRepo: {},
  };
}

function makeDeps(
  seed: FakeSeed,
  opts?: ConstructorParameters<typeof FakeApiClient>[1],
): { deps: ServerDeps; api: FakeApiClient; sleeps: number[] } {
  const api = new FakeApiClient(seed, opts);
  const { clock, sleeps } = realisticClock();
  return {
    deps: { api, clock, waitMs: 110000, pollMs: 2000, apiUrl: 'http://localhost:3001' },
    api,
    sleeps,
  };
}

describe('runAgentOnPr with a clock that starts at a realistic epoch', () => {
  it('Case A: reaches done after two running polls, never returns M1', async () => {
    const seed = baseSeed();
    seed.runsByPr['pr-1'] = [runSummary({ run_id: 'run-1', status: 'running' })];
    seed.reviewsByPr['pr-1'] = [
      review({
        id: 'review-1',
        run_id: 'run-1',
        verdict: 'approve',
        score: 90,
        summary: 'Looks fine.',
        findings: [finding({ id: 'f1', severity: 'WARNING', file: 'src/a.ts', start_line: 1 })],
      }),
    ];
    const { deps, sleeps } = makeDeps(seed, { runStatuses: { 'run-1': ['running', 'running', 'done'] } });

    const out = await runAgentOnPr(deps, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' });

    expect(out.status).toBe('done');
    expect(out.run_id).toBe('run-1');
    expect(out.verdict).toBe('approve');
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]?.file).toBe('src/a.ts');
    expect(out.message).toBeNull();
    // Two running polls, each with a pollMs sleep, then the third poll sees "done".
    expect(sleeps).toEqual([2000, 2000]);
  });

  it('Case B: M1 only after the clock has advanced by at least waitMs from its start', async () => {
    const seed = baseSeed();
    seed.runsByPr['pr-1'] = [runSummary({ run_id: 'run-1', status: 'running' })];
    const { deps, sleeps } = makeDeps(seed, { runStatuses: { 'run-1': ['running'] } });

    const out = await runAgentOnPr(deps, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' });

    // AC8: "Between polls it sleeps exactly pollMs" until the run stays running through
    // waitMs. That takes ceil(waitMs / pollMs) = 55 sleeps of 2000 ms each (elapsed reaches
    // 110000 only after the 55th sleep) before the timeout message is returned.
    expect(sleeps.length).toBe(Math.ceil(deps.waitMs / deps.pollMs));
    for (const ms of sleeps) expect(ms).toBe(deps.pollMs);
    expect(out.status).toBe('running');
    expect(out.run_id).toBe('run-1');
    expect(out.message).toBe(
      'Still running after 110s — call devdigest_get_findings with this run_id to fetch the result.',
    );
  });
});

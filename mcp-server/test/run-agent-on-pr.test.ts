import { describe, it, expect } from 'vitest';
import type { Repo, PrMeta, PrDetail, Agent, ReviewRecord, RunSummary, FindingRecord } from '@devdigest/shared';
import { FakeApiClient, type FakeSeed } from '../src/adapters/mocks.js';
import type { Clock, ServerDeps } from '../src/ports/api-client.js';
// AC5, AC6, AC7, AC8: runAgentOnPr(deps, input), from the not-yet-created app/reviews.ts.
import { runAgentOnPr } from '../src/app/reviews.js';
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

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: overrides.id ?? 'f1',
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

function review(overrides: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: overrides.id ?? 'review-1',
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

function runSummary(overrides: Partial<RunSummary>): RunSummary {
  return {
    run_id: overrides.run_id ?? 'run-1',
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

// Local mirror of the plan's ReviewOut/FindingOut shape (present.ts doesn't exist yet), used
// only to type the test's own assertions — not a stand-in for the real output schema.
type FindingOutShape = {
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  file: string;
  line: number;
  title: string;
  body: string;
};
type ReviewOutShape = {
  status: 'done' | 'running';
  run_id: string | null;
  agent: string;
  verdict: 'request_changes' | 'approve' | 'comment' | null;
  score: number | null;
  summary: string | null;
  counts: { critical: number; warning: number; suggestion: number };
  findings: FindingOutShape[];
  next_offset: number | null;
  message: string | null;
};

function fakeClock(): { clock: Clock; sleeps: number[] } {
  let now = 0;
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
    startedRun: { pr_id: 'pr-1', runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Security Reviewer' }], reviews: [] },
    runsByPr: {},
    reviewsByPr: {},
    conventionsByRepo: {},
  };
}

function makeDeps(seed: FakeSeed, opts?: ConstructorParameters<typeof FakeApiClient>[1]): { deps: ServerDeps; api: FakeApiClient; sleeps: number[] } {
  const api = new FakeApiClient(seed, opts);
  const { clock, sleeps } = fakeClock();
  return {
    deps: { api, clock, waitMs: 110000, pollMs: 2000, apiUrl: 'http://localhost:3001' },
    api,
    sleeps,
  };
}

describe('runAgentOnPr', () => {
  it('refreshes, starts, polls, returns sorted concise findings', async () => {
    const seed = baseSeed();
    // A second, unrelated run is still going (Review focus: only the started run is awaited).
    seed.runsByPr['pr-1'] = [runSummary({ run_id: 'run-1' }), runSummary({ run_id: 'run-2', agent_id: 'agent-2' })];
    // A review from an earlier run proves selection is by run_id, not "any review present".
    seed.reviewsByPr['pr-1'] = [
      review({
        id: 'review-0',
        run_id: 'run-0',
        findings: [],
      }),
      review({
        id: 'review-1',
        run_id: 'run-1',
        verdict: 'request_changes',
        score: 40,
        summary: 'Needs work.',
        findings: [
          finding({ id: 'f-warn-b', severity: 'WARNING', file: 'b.ts', start_line: 5 }),
          finding({ id: 'f-critical', severity: 'CRITICAL', file: 'a.ts', start_line: 10 }),
          finding({ id: 'f-warn-a-line1', severity: 'WARNING', file: 'a.ts', start_line: 1 }),
          finding({ id: 'f-suggestion', severity: 'SUGGESTION', file: 'a.ts', start_line: 1 }),
          finding({ id: 'f-warn-a-line2', severity: 'WARNING', file: 'a.ts', start_line: 2 }),
        ],
      }),
    ];
    const { deps, api, sleeps } = makeDeps(seed, {
      runStatuses: { 'run-1': ['running', 'done'] },
    });

    const out = (await runAgentOnPr(deps, {
      repo: 'acme/payments-api',
      pr: 42,
      agent: 'agent-1',
    })) as ReviewOutShape;

    // Order and arguments of the port calls that matter for this AC (resolution calls filtered out).
    const relevant = api.calls.filter((c) =>
      (['getPullDetail', 'startReview', 'listRuns', 'listReviews'] as const).includes(
        c.method as 'getPullDetail' | 'startReview' | 'listRuns' | 'listReviews',
      ),
    );
    expect(relevant[0]).toMatchObject({ method: 'getPullDetail', args: ['pr-1'] });
    expect(relevant[1]).toMatchObject({ method: 'startReview', args: ['pr-1', 'agent-1'] });
    expect(relevant.at(-1)).toMatchObject({ method: 'listReviews', args: ['pr-1'] });
    const listRunsCalls = relevant.filter((c) => c.method === 'listRuns');
    expect(listRunsCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of listRunsCalls) expect(call.args).toEqual(['pr-1']);

    // Polled with the configured pollMs between polls.
    expect(sleeps.length).toBeGreaterThanOrEqual(1);
    for (const ms of sleeps) expect(ms).toBe(2000);

    expect(out.status).toBe('done');
    expect(out.run_id).toBe('run-1');
    expect(out.verdict).toBe('request_changes');
    expect(out.score).toBe(40);
    expect(out.summary).toBe('Needs work.');
    expect(out.counts).toEqual({ critical: 1, warning: 3, suggestion: 1 });
    // CRITICAL first, then WARNING sorted by file then line, then SUGGESTION.
    expect(out.findings.map((f) => f.severity)).toEqual([
      'CRITICAL',
      'WARNING',
      'WARNING',
      'WARNING',
      'SUGGESTION',
    ]);
    const warnings = out.findings.filter((f) => f.severity === 'WARNING');
    expect(warnings.map((f) => [f.file, f.line])).toEqual([
      ['a.ts', 1],
      ['a.ts', 2],
      ['b.ts', 5],
    ]);
    expect(out.next_offset).toBeNull();
  });

  it('refuses an empty diff without starting a run (E5)', async () => {
    const seed = baseSeed();
    seed.detailsByPr['pr-1'] = detail({ files: [] });
    const { deps, api } = makeDeps(seed);

    await expect(
      runAgentOnPr(deps, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' }),
    ).rejects.toMatchObject({
      message:
        'PR #42 in acme/payments-api has no diff stored, so a review would see nothing and still cost money. Open the PR in DevDigest to refresh it from GitHub, then retry.',
    });
    expect(api.calls.some((c) => c.method === 'startReview')).toBe(false);
  });

  it('refuses when every patch is null or empty (E5)', async () => {
    const seed = baseSeed();
    seed.detailsByPr['pr-1'] = detail({
      files: [
        { path: 'a.ts', additions: 0, deletions: 0, patch: null },
        { path: 'b.ts', additions: 0, deletions: 0, patch: '' },
      ],
    });
    const { deps, api } = makeDeps(seed);
    await expect(
      runAgentOnPr(deps, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' }),
    ).rejects.toBeInstanceOf(ToolError);
    expect(api.calls.some((c) => c.method === 'startReview')).toBe(false);
  });

  it("failed run is an error with its reason (E7)", async () => {
    const seed = baseSeed();
    const longError = 'z'.repeat(500);
    seed.runsByPr['pr-1'] = [runSummary({ run_id: 'run-1', status: 'failed', error: longError })];
    const { deps } = makeDeps(seed, { runStatuses: { 'run-1': ['failed'] } });

    try {
      await runAgentOnPr(deps, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      const message = (err as Error).message;
      expect(message.startsWith('Run run-1 failed: ')).toBe(true);
      expect(message.endsWith("Check the agent's provider key in DevDigest Settings, then retry devdigest_run_agent_on_pr.")).toBe(true);
      const errorPart = message.slice('Run run-1 failed: '.length, message.indexOf('. Check the'));
      expect(errorPart.length).toBeLessThanOrEqual(300);
    }
  });

  it('returns running + run_id after 110 s on the fake clock (M1)', async () => {
    const seed = baseSeed();
    seed.runsByPr['pr-1'] = [runSummary({ run_id: 'run-1', status: 'running' })];
    const { deps, sleeps } = makeDeps(seed, { runStatuses: { 'run-1': ['running'] } });

    const out = await runAgentOnPr(deps, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' });

    expect(out).toEqual({
      status: 'running',
      run_id: 'run-1',
      verdict: null,
      score: null,
      summary: null,
      counts: { critical: 0, warning: 0, suggestion: 0 },
      findings: [],
      next_offset: null,
      message: 'Still running after 110s — call devdigest_get_findings with this run_id to fetch the result.',
    });
    for (const ms of sleeps) expect(ms).toBe(2000);
    expect(sleeps.length).toBeGreaterThanOrEqual(1);
  });
});

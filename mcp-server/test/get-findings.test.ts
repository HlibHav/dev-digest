import { describe, it, expect } from 'vitest';
import type { Repo, PrMeta, Agent, ReviewRecord, RunSummary, FindingRecord } from '@devdigest/shared';
import { FakeApiClient, type FakeSeed } from '../src/adapters/mocks.js';
import type { Clock, ServerDeps } from '../src/ports/api-client.js';
// AC10-15, AC21: getFindings(deps, input), from the not-yet-created app/reviews.ts.
import { getFindings } from '../src/app/reviews.js';
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
    file: 'a.ts',
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

function baseSeed(): FakeSeed {
  const seed = emptySeed();
  seed.repos = [repo({ id: 'r1', full_name: 'acme/payments-api' })];
  seed.pullsByRepo['r1'] = [pr({ id: 'pr-1', number: 42 })];
  seed.agents = [agent({ id: 'agent-1', name: 'Security Reviewer' })];
  return seed;
}

// Local mirror of the plan's FindingsOut/ReviewOut/FindingOut shape (present.ts doesn't exist
// yet), used only to type the test's own assertions — not a stand-in for the real schema.
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
type FindingsOutShape = {
  repo: string;
  pr: number;
  response_format: 'concise' | 'detailed';
  reviews: ReviewOutShape[];
  message: string | null;
};

function deps(seed: FakeSeed): { deps: ServerDeps; api: FakeApiClient } {
  const api = new FakeApiClient(seed);
  return { deps: { api, clock: noopClock(), waitMs: 110000, pollMs: 2000, apiUrl: 'http://localhost:3001' }, api };
}

describe('getFindings default mode (no agent, no run_id)', () => {
  it('latest review per agent, newest first, at most 5', async () => {
    const seed = baseSeed();
    seed.agents = Array.from({ length: 6 }, (_, i) =>
      agent({ id: `agent-${i}`, name: `Agent ${i}` }),
    );
    const reviews: ReviewRecord[] = [];
    for (let i = 0; i < 6; i++) {
      // Older review for this agent — must be excluded in favor of the newest.
      reviews.push(
        review({
          id: `old-${i}`,
          agent_id: `agent-${i}`,
          run_id: `old-run-${i}`,
          created_at: `2026-01-0${(i % 9) + 1}T00:00:00.000Z`,
        }),
      );
      reviews.push(
        review({
          id: `new-${i}`,
          agent_id: `agent-${i}`,
          run_id: i === 0 ? null : `run-${i}`, // agent-0's latest review has run_id: null
          created_at: `2026-09-${20 - i}T00:00:00.000Z`, // agent-0 newest, agent-5 oldest
        }),
      );
    }
    // A kind:'summary' review, newer than everything else, must be excluded entirely.
    reviews.push(
      review({ id: 'summary-1', agent_id: 'agent-1', kind: 'summary', created_at: '2026-12-31T00:00:00.000Z' }),
    );
    seed.reviewsByPr['pr-1'] = reviews;

    const { deps: d } = deps(seed);
    const out = (await getFindings(d, { repo: 'acme/payments-api', pr: 42 })) as FindingsOutShape;

    expect(out.reviews).toHaveLength(5);
    expect(out.reviews.map((r: ReviewOutShape) => r.run_id)).toEqual(
      out.reviews.map((r: ReviewOutShape) => r.run_id),
    );
    // The 5 newest "new-*" reviews (agent-0..agent-4), newest first; agent-5's is dropped by
    // the cap, and every "old-*"/"summary-1" review is excluded regardless of recency.
    // agent-0's review has run_id:null, proving a nullable run_id is still returned by default.
    expect(out.reviews.map((r: ReviewOutShape) => r.run_id)).toEqual([
      null,
      'run-1',
      'run-2',
      'run-3',
      'run-4',
    ]);
  });

  it('no reviews is not an error (M2)', async () => {
    const seed = baseSeed();
    const { deps: d } = deps(seed);
    const out = await getFindings(d, { repo: 'acme/payments-api', pr: 42 });
    expect(out.reviews).toEqual([]);
    expect(out.message).toBe('No finished reviews on PR #42 yet — call devdigest_run_agent_on_pr to start one.');
  });
});

describe('getFindings with agent', () => {
  it("agent filter returns only that agent's latest review", async () => {
    const seed = baseSeed();
    seed.agents = [agent({ id: 'agent-1', name: 'Security Reviewer' }), agent({ id: 'agent-2', name: 'Style Bot' })];
    seed.reviewsByPr['pr-1'] = [
      review({ id: 'r1', agent_id: 'agent-1', created_at: '2026-09-01T00:00:00.000Z' }),
      review({ id: 'r2', agent_id: 'agent-2', created_at: '2026-09-02T00:00:00.000Z' }),
    ];
    const { deps: d } = deps(seed);
    const out = await getFindings(d, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' });
    expect(out.reviews).toHaveLength(1);
    expect(out.reviews[0]!.run_id).toBe('run-1');
  });

  it('agent without a finished review (E11)', async () => {
    const seed = baseSeed();
    seed.agents = [agent({ id: 'agent-1', name: 'Security Reviewer' })];
    seed.reviewsByPr['pr-1'] = [];
    const { deps: d } = deps(seed);
    await expect(getFindings(d, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' })).rejects.toMatchObject({
      message: 'No finished review by Security Reviewer on PR #42 — call devdigest_run_agent_on_pr to start one.',
    });
  });

  it('unknown agent (E3)', async () => {
    const seed = baseSeed();
    const { deps: d } = deps(seed);
    await expect(getFindings(d, { repo: 'acme/payments-api', pr: 42, agent: 'nope' })).rejects.toBeInstanceOf(
      ToolError,
    );
  });
});

describe('getFindings with run_id', () => {
  it('a done run returns its review', async () => {
    const seed = baseSeed();
    seed.runsByPr['pr-1'] = [runSummary({ run_id: 'run-1', status: 'done' })];
    seed.reviewsByPr['pr-1'] = [review({ id: 'r1', run_id: 'run-1' })];
    const { deps: d } = deps(seed);
    const out = await getFindings(d, { repo: 'acme/payments-api', pr: 42, run_id: 'run-1' });
    expect(out.reviews).toHaveLength(1);
    expect(out.reviews[0]!.status).toBe('done');
  });

  it('a still-running run gives status running with M3', async () => {
    const seed = baseSeed();
    seed.runsByPr['pr-1'] = [runSummary({ run_id: 'run-1', status: 'running' })];
    seed.reviewsByPr['pr-1'] = [];
    const { deps: d } = deps(seed);
    const out = await getFindings(d, { repo: 'acme/payments-api', pr: 42, run_id: 'run-1' });
    expect(out.reviews).toHaveLength(1);
    expect(out.reviews[0]!.status).toBe('running');
    expect(out.reviews[0]!.message).toBe('Still running — call devdigest_get_findings with this run_id again later.');
  });

  it('a failed run gives E7', async () => {
    const seed = baseSeed();
    seed.runsByPr['pr-1'] = [runSummary({ run_id: 'run-1', status: 'failed', error: 'boom' })];
    const { deps: d } = deps(seed);
    await expect(
      getFindings(d, { repo: 'acme/payments-api', pr: 42, run_id: 'run-1' }),
    ).rejects.toMatchObject({
      message:
        "Run run-1 failed: boom. Check the agent's provider key in DevDigest Settings, then retry devdigest_run_agent_on_pr.",
    });
  });

  it('a run absent from the PR gives E10', async () => {
    const seed = baseSeed();
    seed.runsByPr['pr-1'] = [];
    const { deps: d } = deps(seed);
    await expect(
      getFindings(d, { repo: 'acme/payments-api', pr: 42, run_id: 'ghost-run' }),
    ).rejects.toMatchObject({
      message: 'Run ghost-run not found on PR #42 — omit run_id to get the latest reviews.',
    });
  });
});

describe('getFindings paging and counts', () => {
  function twentyFindings(): FindingRecord[] {
    return Array.from({ length: 20 }, (_, i) => finding({ id: `f${i}`, file: 'a.ts', start_line: i }));
  }

  it('counts precede findings and cover all findings', async () => {
    const seed = baseSeed();
    seed.reviewsByPr['pr-1'] = [
      review({
        id: 'r1',
        findings: [
          finding({ id: 'c1', severity: 'CRITICAL' }),
          finding({ id: 'w1', severity: 'WARNING' }),
          finding({ id: 'w2', severity: 'WARNING' }),
          finding({ id: 's1', severity: 'SUGGESTION' }),
        ],
      }),
    ];
    const { deps: d } = deps(seed);
    const out = await getFindings(d, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' });
    const reviewOut = out.reviews[0]!;
    expect(reviewOut.counts).toEqual({ critical: 1, warning: 2, suggestion: 1 });
    const keys = Object.keys(reviewOut);
    expect(keys.indexOf('counts')).toBeLessThan(keys.indexOf('findings'));
    // A JSON string preserves key insertion order too.
    const text = JSON.stringify(reviewOut);
    expect(text.indexOf('"counts"')).toBeLessThan(text.indexOf('"findings"'));
  });

  it('offset pages and next_offset ends at null', async () => {
    const seed = baseSeed();
    seed.reviewsByPr['pr-1'] = [review({ id: 'r1', findings: twentyFindings() })];
    const { deps: d } = deps(seed);

    const first = await getFindings(d, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1', offset: 0 });
    expect(first.reviews[0]!.findings).toHaveLength(15);
    expect(first.reviews[0]!.next_offset).toBe(15);

    const rest = await getFindings(d, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1', offset: 15 });
    expect(rest.reviews[0]!.findings).toHaveLength(5);
    expect(rest.reviews[0]!.next_offset).toBeNull();
  });

  it('offset past the end returns findings:[] with next_offset:null and unchanged counts', async () => {
    const seed = baseSeed();
    seed.reviewsByPr['pr-1'] = [review({ id: 'r1', findings: twentyFindings() })];
    const { deps: d } = deps(seed);
    const out = await getFindings(d, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1', offset: 999 });
    expect(out.reviews[0]!.findings).toEqual([]);
    expect(out.reviews[0]!.next_offset).toBeNull();
    expect(out.reviews[0]!.counts).toEqual({ critical: 0, warning: 20, suggestion: 0 });
  });

  it('offset applies to each review independently in the default (5-review) mode', async () => {
    const seed = baseSeed();
    seed.agents = [agent({ id: 'agent-1', name: 'A1' }), agent({ id: 'agent-2', name: 'A2' })];
    seed.reviewsByPr['pr-1'] = [
      review({
        id: 'a1-review',
        agent_id: 'agent-1',
        run_id: 'run-a1',
        created_at: '2026-09-01T00:00:00.000Z',
        findings: [finding({ id: 'a1-f0' }), finding({ id: 'a1-f1' }), finding({ id: 'a1-f2' })],
      }),
      review({
        id: 'a2-review',
        agent_id: 'agent-2',
        run_id: 'run-a2',
        created_at: '2026-09-02T00:00:00.000Z',
        findings: twentyFindings(),
      }),
    ];
    const { deps: d } = deps(seed);
    const out = (await getFindings(d, { repo: 'acme/payments-api', pr: 42, offset: 1 })) as FindingsOutShape;
    const a1 = out.reviews.find((r) => r.run_id === 'run-a1')!;
    const a2 = out.reviews.find((r) => r.run_id === 'run-a2')!;
    expect(a1.findings).toHaveLength(2); // 3 - offset 1
    expect(a1.next_offset).toBeNull();
    expect(a2.findings).toHaveLength(15); // capped, 19 remained after offset 1
    expect(a2.next_offset).toBe(16); // 1 + 15
  });

  it('concise caps: at most 15 per review, title ≤120, body ≤200', async () => {
    const seed = baseSeed();
    seed.reviewsByPr['pr-1'] = [
      review({
        id: 'r1',
        findings: Array.from({ length: 20 }, (_, i) =>
          finding({ id: `f${i}`, title: 'T'.repeat(150), rationale: 'R'.repeat(300) }),
        ),
      }),
    ];
    const { deps: d } = deps(seed);
    const out = await getFindings(d, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' });
    const findings = out.reviews[0]!.findings;
    expect(findings.length).toBeLessThanOrEqual(15);
    for (const f of findings) {
      expect(f.title.length).toBeLessThanOrEqual(120);
      expect(f.body.length).toBeLessThanOrEqual(200);
    }
  });

  it('detailed caps: at most 20 per page, title ≤120, body ≤1000', async () => {
    const seed = baseSeed();
    seed.reviewsByPr['pr-1'] = [
      review({
        id: 'r1',
        findings: Array.from({ length: 25 }, (_, i) =>
          finding({ id: `f${i}`, title: 'T'.repeat(150), rationale: 'R'.repeat(2000) }),
        ),
      }),
    ];
    const { deps: d } = deps(seed);
    const out = await getFindings(d, {
      repo: 'acme/payments-api',
      pr: 42,
      agent: 'agent-1',
      response_format: 'detailed',
    });
    const findings = out.reviews[0]!.findings;
    expect(findings.length).toBeLessThanOrEqual(20);
    for (const f of findings) {
      expect(f.title.length).toBeLessThanOrEqual(120);
      expect(f.body.length).toBeLessThanOrEqual(1000);
    }
  });

  it('detailed without agent or run_id (E12)', async () => {
    const seed = baseSeed();
    const { deps: d, api } = deps(seed);
    await expect(
      getFindings(d, { repo: 'acme/payments-api', pr: 42, response_format: 'detailed' }),
    ).rejects.toMatchObject({
      message:
        'response_format "detailed" needs agent or run_id — call devdigest_list_agents or pass the run_id from devdigest_run_agent_on_pr.',
    });
    expect(api.calls).toHaveLength(0);
  });

  it('concise worst case ≤36,000 chars over 5 agents × 60 findings', async () => {
    const seed = baseSeed();
    seed.agents = Array.from({ length: 5 }, (_, i) => agent({ id: `agent-${i}`, name: `Agent ${i}` }));
    seed.reviewsByPr['pr-1'] = seed.agents.map((a, i) =>
      review({
        id: `r${i}`,
        agent_id: a.id,
        run_id: `run-${i}`,
        created_at: `2026-09-0${i + 1}T00:00:00.000Z`,
        findings: Array.from({ length: 60 }, (_, j) =>
          finding({
            id: `f${i}-${j}`,
            title: 'T'.repeat(500),
            rationale: 'R'.repeat(2000),
            file: 'a'.repeat(40),
          }),
        ),
      }),
    );
    const { deps: d } = deps(seed);
    const out = await getFindings(d, { repo: 'acme/payments-api', pr: 42 });
    expect(out.reviews).toHaveLength(5);
    for (const r of out.reviews) {
      expect(r.findings.length).toBeLessThanOrEqual(15);
      expect(r.next_offset).toBe(15);
    }
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(36000);
  });

  it('detailed worst case ≤26,000 chars for one review of 60 findings', async () => {
    const seed = baseSeed();
    seed.reviewsByPr['pr-1'] = [
      review({
        id: 'r1',
        findings: Array.from({ length: 60 }, (_, j) =>
          finding({ id: `f${j}`, title: 'T'.repeat(500), rationale: 'R'.repeat(2000), file: 'a'.repeat(40) }),
        ),
      }),
    ];
    const { deps: d } = deps(seed);
    const out = await getFindings(d, {
      repo: 'acme/payments-api',
      pr: 42,
      agent: 'agent-1',
      response_format: 'detailed',
    });
    expect(out.reviews[0]!.findings.length).toBeLessThanOrEqual(20);
    expect(out.reviews[0]!.next_offset).toBe(20);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(26000);
  });
});

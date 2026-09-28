import { describe, it, expect } from 'vitest';
import type {
  Repo,
  PrMeta,
  PrDetail,
  Agent,
  ReviewRecord,
  RunSummary,
  FindingRecord,
  ConventionCandidate,
} from '@devdigest/shared';
import { FakeApiClient, type FakeSeed } from '../src/adapters/mocks.js';
import type { Clock, ServerDeps } from '../src/ports/api-client.js';
// AC31: sanitizeUntrusted, applied inside presentReview/listAgents/getConventions/runAgentOnPr
// (app/present.ts, not yet written). Exercised only through the use cases, per the plan.
import { getFindings, runAgentOnPr } from '../src/app/reviews.js';
import { listAgents } from '../src/app/agents.js';
import { getConventions } from '../src/app/conventions.js';
import { ToolError } from '../src/app/errors.js';

// ---- fixtures (mirrors get-findings.test.ts / run-agent-on-pr.test.ts fixture style) ----

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

function baseSeed(): FakeSeed {
  const seed = emptySeed();
  seed.repos = [repo({ id: 'r1', full_name: 'acme/payments-api' })];
  seed.pullsByRepo['r1'] = [pr({ id: 'pr-1', number: 42 })];
  seed.agents = [agent({ id: 'agent-1', name: 'Security Reviewer' })];
  seed.detailsByPr['pr-1'] = detail({});
  return seed;
}

function deps(seed: FakeSeed, clock: Clock = noopClock()): { deps: ServerDeps; api: FakeApiClient } {
  const api = new FakeApiClient(seed);
  return { deps: { api, clock, waitMs: 110000, pollMs: 2000, apiUrl: 'http://localhost:3001' }, api };
}

// ---- the untrusted payload (AC31) ----
// zero-width (U+200B, U+FEFF), bidi controls (U+202E, U+2066), a Unicode tag character
// (U+E0041), a C0 control (BEL, U+0007) and a C1 control (NEL, U+0085), interleaved with text
// that must survive: \n, \t, Cyrillic and an emoji.
const ZW = '​﻿';
const BIDI = '‮⁦';
const TAG = '\u{E0041}';
const C0 = '\u0007';
const C1 = '\u0085';
const DIRTY = `Hello${ZW}World${BIDI}Test${TAG}Tag${C0}Bell${C1}Nel\nNewline\tTab Привіт 🎉`;
const CLEAN = 'HelloWorldTestTagBellNel\nNewline\tTab Привіт 🎉';

/** Matches any character `sanitizeUntrusted` must strip: zero-width, bidi, Unicode tag
 * characters, and C0/C1 controls other than \n and \t. */
const DIRTY_CHARS_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u0080-\u009F​-‏⁠﻿‪-‮⁦-⁩\u{E0000}-\u{E007F}]/u;

describe('sanitizeUntrusted (AC31)', () => {
  it('strips control/zero-width/bidi/tag characters from finding title, file and body while keeping newlines, tabs, Cyrillic and emoji', async () => {
    const seed = baseSeed();
    seed.reviewsByPr['pr-1'] = [
      review({
        id: 'r1',
        findings: [finding({ id: 'f1', title: DIRTY, file: DIRTY, rationale: DIRTY })],
      }),
    ];
    const { deps: d } = deps(seed);
    const out = await getFindings(d, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' });
    const f = out.reviews[0]!.findings[0]!;
    expect(f.title).toBe(CLEAN);
    expect(f.file).toBe(CLEAN);
    expect(f.body).toBe(CLEAN);
    expect(DIRTY_CHARS_RE.test(f.title)).toBe(false);
    expect(DIRTY_CHARS_RE.test(f.file)).toBe(false);
    expect(DIRTY_CHARS_RE.test(f.body)).toBe(false);
  });

  it('strips the same characters from review summary', async () => {
    const seed = baseSeed();
    seed.reviewsByPr['pr-1'] = [review({ id: 'r1', summary: DIRTY })];
    const { deps: d } = deps(seed);
    const out = await getFindings(d, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' });
    expect(out.reviews[0]!.summary).toBe(CLEAN);
  });

  it('strips the same characters from convention rule and file (evidence_path)', async () => {
    const seed = emptySeed();
    seed.repos = [repo({ id: 'r1', full_name: 'acme/payments-api' })];
    seed.conventionsByRepo['r1'] = {
      candidates: [candidate({ id: 'c1', rule: DIRTY, evidence_path: DIRTY })],
      scan: null,
    };
    const { deps: d } = deps(seed);
    const out = await getConventions(d, { repo: 'acme/payments-api' });
    expect(out.conventions[0]!.rule).toBe(CLEAN);
    expect(out.conventions[0]!.file).toBe(CLEAN);
  });

  it('strips the same characters from agent description', async () => {
    const seed = emptySeed();
    seed.agents = [agent({ id: 'agent-1', description: DIRTY })];
    const { deps: d } = deps(seed);
    const out = await listAgents(d);
    expect(out.agents[0]!.description).toBe(CLEAN);
  });

  it('strips the same characters from the run error reached through E7 via runAgentOnPr', async () => {
    const seed = baseSeed();
    seed.startedRun = {
      pr_id: 'pr-1',
      runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Security Reviewer' }],
      reviews: [],
    };
    seed.runsByPr['pr-1'] = [runSummary({ run_id: 'run-1', status: 'failed', error: DIRTY })];
    const { deps: d } = deps(seed);
    try {
      await runAgentOnPr(d, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      const message = (err as Error).message;
      expect(message).toContain(CLEAN);
      expect(DIRTY_CHARS_RE.test(message)).toBe(false);
    }
  });

  it('sanitises before truncating: 150 zero-width characters followed by 100 visible ones become just the 100 visible characters, not an ellipsis', async () => {
    const seed = baseSeed();
    const visible = 'V'.repeat(100);
    const dirtyThenVisible = '​'.repeat(150) + visible;
    seed.reviewsByPr['pr-1'] = [
      review({ id: 'r1', findings: [finding({ id: 'f1', title: dirtyThenVisible })] }),
    ];
    const { deps: d } = deps(seed);
    const out = await getFindings(d, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' });
    expect(out.reviews[0]!.findings[0]!.title).toBe(visible);
  });

  it('new cap: finding file is capped at 200 chars', async () => {
    const seed = baseSeed();
    seed.reviewsByPr['pr-1'] = [
      review({ id: 'r1', findings: [finding({ id: 'f1', file: 'x'.repeat(250) })] }),
    ];
    const { deps: d } = deps(seed);
    const out = await getFindings(d, { repo: 'acme/payments-api', pr: 42, agent: 'agent-1' });
    expect(out.reviews[0]!.findings[0]!.file.length).toBeLessThanOrEqual(200);
  });

  it('new cap: convention file is capped at 200 chars', async () => {
    const seed = emptySeed();
    seed.repos = [repo({ id: 'r1', full_name: 'acme/payments-api' })];
    seed.conventionsByRepo['r1'] = {
      candidates: [candidate({ id: 'c1', evidence_path: 'y'.repeat(250) })],
      scan: null,
    };
    const { deps: d } = deps(seed);
    const out = await getConventions(d, { repo: 'acme/payments-api' });
    expect(out.conventions[0]!.file.length).toBeLessThanOrEqual(200);
  });
});

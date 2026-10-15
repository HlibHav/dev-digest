import { and, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * Agent Performance demo data (SPEC-2026-10-15-agent-performance AC-43, AC-49,
 * AC-50): finished review runs written directly, because a real run calls a
 * model and the dev seed may not. They sit on a PR of their own, so PR #482's
 * review, findings and cost stay as they were (AC-51).
 *
 * Idempotent: every run, review and finding has a fixed id. A re-seed moves
 * `agent_runs.ran_at` to the new seed time and touches nothing else.
 */

export const DEMO_PR_NUMBER = 476;
export const DEMO_PR_TITLE = 'Retry webhook deliveries with exponential backoff';

const HOUR_MS = 3_600_000;

const SECURITY = 'Security Reviewer';
const GENERAL = 'General Reviewer';
const PERFORMANCE = 'Performance Reviewer';
const API_CONTRACT = 'API Contract Reviewer';

const DEEPSEEK = 'deepseek/deepseek-v4-flash';
const GPT_MINI = 'openai/gpt-4.1-mini';

export interface DemoRunSpec {
  key: string;
  /** Agent name; null = a run with no agent (a deleted agent's run). */
  agent: string | null;
  status: 'done' | 'failed';
  /** null = a run with no recorded model. */
  model: string | null;
  /** null = a done run with no recorded cost. */
  costUsd: number | null;
  durationMs: number;
  /** Hours before the seed time. */
  offsetHours: number;
  findings: { accepted: number; dismissed: number; pending: number };
  /** A failed run has no review. */
  hasReview: boolean;
  runId: string;
  reviewId: string;
}

/** Fixed, valid v4-shaped ids: `kind` (1 run, 2 review, 3 finding), run index, finding index. */
function demoId(kind: number, run: number, n = 0): string {
  const hex = (v: number, len: number) => v.toString(16).padStart(len, '0');
  return `a6e17f00-${hex(kind, 4)}-4${hex(run, 3)}-8${hex(n, 3)}-000000476000`;
}

type SpecInput = Omit<DemoRunSpec, 'runId' | 'reviewId' | 'hasReview'>;

const SPECS: SpecInput[] = [
  { key: 'S1', agent: SECURITY, status: 'done', model: DEEPSEEK, costUsd: 0.012, durationMs: 42000, offsetHours: 2, findings: { accepted: 9, dismissed: 2, pending: 1 } },
  { key: 'S2', agent: SECURITY, status: 'done', model: GPT_MINI, costUsd: 0.02, durationMs: 38000, offsetHours: 30, findings: { accepted: 2, dismissed: 0, pending: 1 } },
  { key: 'S3', agent: SECURITY, status: 'failed', model: DEEPSEEK, costUsd: null, durationMs: 0, offsetHours: 120, findings: { accepted: 0, dismissed: 0, pending: 0 } },
  { key: 'G1', agent: GENERAL, status: 'done', model: DEEPSEEK, costUsd: 0.008, durationMs: 30000, offsetHours: 6, findings: { accepted: 2, dismissed: 1, pending: 0 } },
  { key: 'G2', agent: GENERAL, status: 'done', model: DEEPSEEK, costUsd: null, durationMs: 25000, offsetHours: 240, findings: { accepted: 0, dismissed: 0, pending: 1 } },
  { key: 'P1', agent: PERFORMANCE, status: 'done', model: null, costUsd: 0.005, durationMs: 20000, offsetHours: 12, findings: { accepted: 1, dismissed: 0, pending: 1 } },
  { key: 'A1', agent: API_CONTRACT, status: 'done', model: GPT_MINI, costUsd: 0.015, durationMs: 33000, offsetHours: 3, findings: { accepted: 0, dismissed: 1, pending: 1 } },
  { key: 'D1', agent: null, status: 'done', model: GPT_MINI, costUsd: 0.01, durationMs: 28000, offsetHours: 192, findings: { accepted: 1, dismissed: 0, pending: 0 } },
];

export const DEMO_RUNS: readonly DemoRunSpec[] = SPECS.map((s, i) => ({
  ...s,
  hasReview: s.status === 'done',
  runId: demoId(1, i),
  reviewId: demoId(2, i),
}));

export function demoRunTime(seedNow: Date, spec: DemoRunSpec): Date {
  return new Date(seedNow.getTime() - spec.offsetHours * HOUR_MS);
}

/** Finding ids of a spec, in the order accepted, dismissed, pending. */
export function demoFindingIds(spec: DemoRunSpec): string[] {
  const index = DEMO_RUNS.indexOf(spec);
  const { accepted, dismissed, pending } = spec.findings;
  return Array.from({ length: accepted + dismissed + pending }, (_, n) => demoId(3, index, n));
}

export async function seedAgentPerformanceDemo(
  db: Db,
  workspaceId: string,
  repoId: string,
  now: Date = new Date(),
): Promise<void> {
  const agents = await db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
  const agentIdByName = new Map(agents.map((a) => [a.name, a.id]));
  // Without the built-in agents there is nothing to attribute the runs to.
  if (!agentIdByName.has(SECURITY)) return;

  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, DEMO_PR_NUMBER)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: DEMO_PR_NUMBER,
        title: DEMO_PR_TITLE,
        author: 'jonas.weber',
        branch: 'feat/webhook-retry-backoff',
        base: 'main',
        headSha: 'f00dcafe4760',
        additions: 96,
        deletions: 12,
        filesCount: 3,
        status: 'needs_review',
        body: 'Retry failed webhook deliveries with exponential backoff and jitter.',
      })
      .returning();
  }
  const prId = pr!.id;

  for (const spec of DEMO_RUNS) {
    const agentId = spec.agent ? (agentIdByName.get(spec.agent) ?? null) : null;
    const ranAt = demoRunTime(now, spec);
    const findingCount = spec.findings.accepted + spec.findings.dismissed + spec.findings.pending;
    const done = spec.status === 'done';

    await db
      .insert(t.agentRuns)
      .values({
        id: spec.runId,
        workspaceId,
        agentId,
        prId,
        ranAt,
        provider: spec.model ? 'openrouter' : null,
        model: spec.model,
        durationMs: spec.durationMs,
        tokensIn: done ? 4200 : null,
        tokensOut: done ? 900 : null,
        status: spec.status,
        error: done ? null : 'The provider call failed.',
        source: 'local',
        findingsCount: done ? findingCount : null,
        score: done ? 70 : null,
        blockers: done ? 0 : null,
        costUsd: spec.costUsd,
      })
      // A re-seed moves the demo run to the new seed time and changes nothing else.
      .onConflictDoUpdate({ target: t.agentRuns.id, set: { ranAt } });

    if (!spec.hasReview) continue;

    await db
      .insert(t.reviews)
      .values({
        id: spec.reviewId,
        workspaceId,
        prId,
        agentId,
        runId: spec.runId,
        kind: 'review',
        verdict: 'comment',
        summary: `Seeded demo review (${spec.key}).`,
        score: 70,
        model: spec.model,
        createdAt: ranAt,
      })
      .onConflictDoNothing({ target: t.reviews.id });

    const { accepted, dismissed } = spec.findings;
    const ids = demoFindingIds(spec);
    if (ids.length === 0) continue;
    await db
      .insert(t.findings)
      .values(
        ids.map((id, n) => ({
          id,
          reviewId: spec.reviewId,
          file: 'src/webhooks/retry.ts',
          startLine: 10 + n,
          endLine: 10 + n,
          severity: 'WARNING',
          category: 'correctness',
          title: `Seeded demo finding ${spec.key}-${n + 1}`,
          rationale: 'Seeded demo finding for the Agent Performance screens.',
          confidence: 0.8,
          acceptedAt: n < accepted ? ranAt : null,
          dismissedAt: n >= accepted && n < accepted + dismissed ? ranAt : null,
        })),
      )
      .onConflictDoNothing({ target: t.findings.id });
  }
}

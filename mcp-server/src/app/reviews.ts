import type { Repo, PrMeta, ReviewRecord, ReviewRunResponse, RunSummary } from '@devdigest/shared';
import type { ServerDeps } from '../ports/api-client.js';
import { resolveAgent, resolvePr, resolveRepo } from './resolve.js';
import { toToolError, ToolError } from './errors.js';
import {
  presentReview,
  sanitizeUntrusted,
  truncate,
  UNTRUSTED_NOTICE,
  type FindingsOut,
  type ReviewOut,
} from './present.js';

type ResolvedPr = PrMeta & { id: string };

function timedOutReviewOut(runId: string, waitMs: number): ReviewOut {
  return {
    status: 'running',
    run_id: runId,
    verdict: null,
    score: null,
    summary: null,
    counts: { critical: 0, warning: 0, suggestion: 0 },
    findings: [],
    next_offset: null,
    message: `Still running after ${Math.round(waitMs / 1000)}s — call devdigest_get_findings with this run_id to fetch the result.`,
  };
}

function runFailedError(runId: string, status: string, error: string | null): ToolError {
  const reason = error ? truncate(sanitizeUntrusted(error), 300) : 'no error recorded';
  return new ToolError(
    `Run ${runId} ${status}: ${reason}. Check the agent's provider key in DevDigest Settings, then retry devdigest_run_agent_on_pr.`,
  );
}

function hasStoredDiff(files: { patch?: string | null | undefined }[]): boolean {
  return files.some((f) => f.patch !== null && f.patch !== undefined && f.patch.length > 0);
}

/** `devdigest_run_agent_on_pr`: refreshes the PR, guards against an empty diff, starts the
 * run and polls `listRuns` until it leaves `running` (or `waitMs` elapses), then returns the
 * concise `ReviewOut` from `listReviews`. */
export async function runAgentOnPr(
  deps: ServerDeps,
  input: { repo: string; pr: number; agent: string },
): Promise<ReviewOut> {
  try {
    const repo = await resolveRepo(deps.api, input.repo);
    const pr = await resolvePr(deps.api, repo, input.pr);
    const agent = await resolveAgent(deps.api, input.agent);

    const detail = await deps.api.getPullDetail(pr.id);
    if (!hasStoredDiff(detail.files)) {
      throw new ToolError(
        `PR #${input.pr} in ${repo.full_name} has no diff stored, so a review would see nothing and still cost money. Open the PR in DevDigest to refresh it from GitHub, then retry.`,
      );
    }

    const started: ReviewRunResponse = await deps.api.startReview(pr.id, agent.id);
    const target = started.runs.find((r) => r.agent_id === agent.id) ?? started.runs[0];
    if (!target) {
      throw new ToolError(
        `DevDigest did not start a run for ${agent.name} on PR #${input.pr} — retry devdigest_run_agent_on_pr.`,
      );
    }
    const runId = target.run_id;
    const start = deps.clock.now();

    for (;;) {
      const runs: RunSummary[] = await deps.api.listRuns(pr.id);
      const run = runs.find((r) => r.run_id === runId);
      const status = run?.status ?? 'running';

      if (status === 'failed' || status === 'cancelled') {
        throw runFailedError(runId, status, run?.error ?? null);
      }
      if (status !== 'running') {
        const reviews = await deps.api.listReviews(pr.id);
        const review = reviews.find((r) => r.run_id === runId);
        if (!review) {
          throw new ToolError(
            `Run ${runId} finished but its review was not found — call devdigest_get_findings with this run_id.`,
          );
        }
        return { notice: UNTRUSTED_NOTICE, ...presentReview(review, { format: 'concise', offset: 0 }) };
      }
      if (deps.clock.now() - start >= deps.waitMs) {
        return timedOutReviewOut(runId, deps.waitMs);
      }
      await deps.clock.sleep(deps.pollMs);
    }
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw toToolError(err, deps.apiUrl);
  }
}

type FindingsInput = {
  repo: string;
  pr: number;
  agent?: string;
  run_id?: string;
  response_format?: 'concise' | 'detailed';
  offset?: number;
};

async function findingsForDefault(
  deps: ServerDeps,
  repo: Repo,
  pr: ResolvedPr,
  format: 'concise' | 'detailed',
  offset: number,
): Promise<FindingsOut> {
  const reviews = await deps.api.listReviews(pr.id);
  const latestByAgent = new Map<string, ReviewRecord>();
  for (const r of reviews) {
    if (r.kind !== 'review') continue;
    const key = r.agent_id ?? r.id;
    const existing = latestByAgent.get(key);
    if (!existing || new Date(r.created_at).getTime() > new Date(existing.created_at).getTime()) {
      latestByAgent.set(key, r);
    }
  }
  const top5 = [...latestByAgent.values()]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return {
    notice: UNTRUSTED_NOTICE,
    repo: repo.full_name,
    pr: pr.number,
    response_format: format,
    reviews: top5.map((r) => presentReview(r, { format, offset })),
    message:
      top5.length === 0
        ? `No finished reviews on PR #${pr.number} yet — call devdigest_run_agent_on_pr to start one.`
        : null,
  };
}

async function findingsForAgent(
  deps: ServerDeps,
  repo: Repo,
  pr: ResolvedPr,
  agentInput: string,
  format: 'concise' | 'detailed',
  offset: number,
): Promise<FindingsOut> {
  const agent = await resolveAgent(deps.api, agentInput);
  const reviews = await deps.api.listReviews(pr.id);
  const candidates = reviews.filter((r) => r.kind === 'review' && r.agent_id === agent.id);
  if (candidates.length === 0) {
    throw new ToolError(
      `No finished review by ${agent.name} on PR #${pr.number} — call devdigest_run_agent_on_pr to start one.`,
    );
  }
  const latest = candidates.reduce((a, b) =>
    new Date(a.created_at).getTime() >= new Date(b.created_at).getTime() ? a : b,
  );
  return {
    notice: UNTRUSTED_NOTICE,
    repo: repo.full_name,
    pr: pr.number,
    response_format: format,
    reviews: [presentReview(latest, { format, offset })],
    message: null,
  };
}

async function findingsForRunId(
  deps: ServerDeps,
  repo: Repo,
  pr: ResolvedPr,
  runId: string,
  format: 'concise' | 'detailed',
  offset: number,
): Promise<FindingsOut> {
  const runs = await deps.api.listRuns(pr.id);
  const run = runs.find((r) => r.run_id === runId);
  if (!run) {
    throw new ToolError(`Run ${runId} not found on PR #${pr.number} — omit run_id to get the latest reviews.`);
  }
  if (run.status === 'failed' || run.status === 'cancelled') {
    throw runFailedError(runId, run.status, run.error);
  }
  if (run.status === 'running') {
    const reviewOut: ReviewOut = {
      status: 'running',
      run_id: runId,
      agent: run.agent_name ?? run.agent_id ?? 'unknown',
      verdict: null,
      score: null,
      summary: null,
      counts: { critical: 0, warning: 0, suggestion: 0 },
      findings: [],
      next_offset: null,
      message: 'Still running — call devdigest_get_findings with this run_id again later.',
    };
    return {
      notice: UNTRUSTED_NOTICE,
      repo: repo.full_name,
      pr: pr.number,
      response_format: format,
      reviews: [reviewOut],
      message: null,
    };
  }

  const reviews = await deps.api.listReviews(pr.id);
  const review = reviews.find((r) => r.run_id === runId);
  if (!review) {
    throw new ToolError(
      `Run ${runId} finished but its review was not found — call devdigest_get_findings with this run_id.`,
    );
  }
  return {
    notice: UNTRUSTED_NOTICE,
    repo: repo.full_name,
    pr: pr.number,
    response_format: format,
    reviews: [presentReview(review, { format, offset })],
    message: null,
  };
}

/** `devdigest_get_findings`: latest review per agent by default, narrowed by `agent` or
 * `run_id`; `response_format:"detailed"` needs one of those (E12) and is checked before any
 * API call. */
export async function getFindings(deps: ServerDeps, input: FindingsInput): Promise<FindingsOut> {
  const format = input.response_format ?? 'concise';
  const offset = input.offset ?? 0;

  if (format === 'detailed' && !input.agent && !input.run_id) {
    throw new ToolError(
      'response_format "detailed" needs agent or run_id — call devdigest_list_agents or pass the run_id from devdigest_run_agent_on_pr.',
    );
  }

  try {
    const repo = await resolveRepo(deps.api, input.repo);
    const pr = await resolvePr(deps.api, repo, input.pr);

    if (input.run_id) {
      return await findingsForRunId(deps, repo, pr, input.run_id, format, offset);
    }
    if (input.agent) {
      return await findingsForAgent(deps, repo, pr, input.agent, format, offset);
    }
    return await findingsForDefault(deps, repo, pr, format, offset);
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw toToolError(err, deps.apiUrl);
  }
}

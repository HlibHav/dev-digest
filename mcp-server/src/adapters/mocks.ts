import type {
  Repo,
  PrMeta,
  PrDetail,
  Agent,
  ReviewRunResponse,
  RunSummary,
  ReviewRecord,
  ConventionsPage,
} from '@devdigest/shared';
import { ApiError, type ApiClient } from '../ports/api-client.js';

/** Fixture data for one `FakeApiClient`. Every array uses the shared contract types, so a
 * red-first test seeds exactly what the real API would return. */
export type FakeSeed = {
  repos: Repo[];
  pullsByRepo: Record<string, PrMeta[]>;
  detailsByPr: Record<string, PrDetail>;
  agents: Agent[];
  startedRun: ReviewRunResponse;
  runsByPr: Record<string, RunSummary[]>;
  reviewsByPr: Record<string, ReviewRecord[]>;
  conventionsByRepo: Record<string, ConventionsPage>;
};

export type FakeApiClientOptions = {
  /** `runStatuses[runId]` is consumed one entry per `listRuns` call that returns that run;
   * the last entry repeats once exhausted. */
  runStatuses?: Record<string, string[]>;
  /** Makes the named method throw this `ApiError` instead of returning. */
  failWith?: Partial<Record<keyof ApiClient, ApiError>>;
};

/** The double for `ApiClient`, seeded per test. Records every call so a test can assert
 * call order (AC5's `getPullDetail` → `startReview` → `listRuns` → `listReviews` sequence). */
export class FakeApiClient implements ApiClient {
  readonly calls: { method: keyof ApiClient; args: unknown[] }[] = [];
  private readonly runStatusCallCount = new Map<string, number>();

  constructor(
    private readonly seed: FakeSeed,
    private readonly opts: FakeApiClientOptions = {},
  ) {}

  async listRepos(): Promise<Repo[]> {
    this.record('listRepos', []);
    return this.seed.repos;
  }

  async listPulls(repoId: string): Promise<PrMeta[]> {
    this.record('listPulls', [repoId]);
    return this.seed.pullsByRepo[repoId] ?? [];
  }

  async getPullDetail(prId: string): Promise<PrDetail> {
    this.record('getPullDetail', [prId]);
    const detail = this.seed.detailsByPr[prId];
    if (!detail) {
      throw new ApiError(`PR ${prId} not found`, {
        status: 404,
        code: 'not_found',
        method: 'GET',
        path: `/pulls/${prId}`,
      });
    }
    return detail;
  }

  async listAgents(): Promise<Agent[]> {
    this.record('listAgents', []);
    return this.seed.agents;
  }

  async startReview(prId: string, agentId: string): Promise<ReviewRunResponse> {
    this.record('startReview', [prId, agentId]);
    return this.seed.startedRun;
  }

  async listRuns(prId: string): Promise<RunSummary[]> {
    this.record('listRuns', [prId]);
    const runs = this.seed.runsByPr[prId] ?? [];
    return runs.map((run) => this.withNextStatus(run));
  }

  async listReviews(prId: string): Promise<ReviewRecord[]> {
    this.record('listReviews', [prId]);
    return this.seed.reviewsByPr[prId] ?? [];
  }

  async listConventions(repoId: string): Promise<ConventionsPage> {
    this.record('listConventions', [repoId]);
    return this.seed.conventionsByRepo[repoId] ?? { candidates: [], scan: null };
  }

  private record(method: keyof ApiClient, args: unknown[]): void {
    const err = this.opts.failWith?.[method];
    this.calls.push({ method, args });
    if (err) throw err;
  }

  private withNextStatus(run: RunSummary): RunSummary {
    const statuses = this.opts.runStatuses?.[run.run_id];
    if (!statuses || statuses.length === 0) return run;
    const callIndex = this.runStatusCallCount.get(run.run_id) ?? 0;
    this.runStatusCallCount.set(run.run_id, callIndex + 1);
    const status = statuses[Math.min(callIndex, statuses.length - 1)] ?? run.status;
    return { ...run, status };
  }
}

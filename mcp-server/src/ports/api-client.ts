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

/** The port every use case calls through. Only `adapters/http-api-client.ts` implements it
 * for real; `adapters/mocks.ts` holds the test double. */
export interface ApiClient {
  listRepos(): Promise<Repo[]>;
  listPulls(repoId: string): Promise<PrMeta[]>;
  getPullDetail(prId: string): Promise<PrDetail>;
  listAgents(): Promise<Agent[]>;
  startReview(prId: string, agentId: string): Promise<ReviewRunResponse>;
  listRuns(prId: string): Promise<RunSummary[]>;
  listReviews(prId: string): Promise<ReviewRecord[]>;
  listConventions(repoId: string): Promise<ConventionsPage>;
}

/** Raised by `HttpApiClient` (Step 1) and consumed by `toToolError` (Step 2). */
export class ApiError extends Error {
  status: number | null;
  code: string;
  method: string;
  path: string;

  constructor(
    message: string,
    opts: { status: number | null; code: string; method: string; path: string },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.method = opts.method;
    this.path = opts.path;
  }
}

/** A monotonic clock the application layer waits on, so tests can fake time. */
export type Clock = {
  now(): number;
  sleep(ms: number): Promise<void>;
};

/** What every use case receives instead of a Container (Step 3+). */
export type ServerDeps = {
  api: ApiClient;
  clock: Clock;
  waitMs: number;
  pollMs: number;
  apiUrl: string;
};

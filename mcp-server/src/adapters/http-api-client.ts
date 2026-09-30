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

type Shape = 'array' | 'object';

/** The only file that calls `fetch` for real. Talks to the already-running local DevDigest
 * API over plain HTTP/JSON; see `ports/api-client.ts` for the port and `adapters/mocks.ts`
 * for the test double. */
export class HttpApiClient implements ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async listRepos(): Promise<Repo[]> {
    return this.request<Repo[]>('GET', '/repos', 'array');
  }

  async listPulls(repoId: string): Promise<PrMeta[]> {
    return this.request<PrMeta[]>('GET', `/repos/${encodeURIComponent(repoId)}/pulls`, 'array');
  }

  async getPullDetail(prId: string): Promise<PrDetail> {
    return this.request<PrDetail>('GET', `/pulls/${encodeURIComponent(prId)}`, 'object');
  }

  async listAgents(): Promise<Agent[]> {
    return this.request<Agent[]>('GET', '/agents', 'array');
  }

  async startReview(prId: string, agentId: string): Promise<ReviewRunResponse> {
    return this.request<ReviewRunResponse>(
      'POST',
      `/pulls/${encodeURIComponent(prId)}/review`,
      'object',
      { agentId },
    );
  }

  async listRuns(prId: string): Promise<RunSummary[]> {
    return this.request<RunSummary[]>('GET', `/pulls/${encodeURIComponent(prId)}/runs`, 'array');
  }

  async listReviews(prId: string): Promise<ReviewRecord[]> {
    return this.request<ReviewRecord[]>(
      'GET',
      `/pulls/${encodeURIComponent(prId)}/reviews`,
      'array',
    );
  }

  async listConventions(repoId: string): Promise<ConventionsPage> {
    return this.request<ConventionsPage>(
      'GET',
      `/repos/${encodeURIComponent(repoId)}/conventions`,
      'object',
    );
  }

  private async request<T>(
    method: string,
    path: string,
    shape: Shape,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ApiError(err instanceof Error ? err.message : 'network error', {
        status: null,
        code: 'network_error',
        method,
        path,
      });
    }

    if (!response.ok) {
      const errBody = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      throw new ApiError(errBody?.error?.message ?? `HTTP ${response.status}`, {
        status: response.status,
        code: errBody?.error?.code ?? 'http_error',
        method,
        path,
      });
    }

    const data: unknown = await response.json();
    if (Array.isArray(data) !== (shape === 'array')) {
      throw new ApiError('Response shape did not match the endpoint contract.', {
        status: response.status,
        code: 'bad_response',
        method,
        path,
      });
    }
    return data as T;
  }
}

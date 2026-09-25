/**
 * Unit coverage for PullsService.refreshPullDetail — hand-built port doubles,
 * no container, no database, no network. Mirrors the shape of
 * test/intent-service.test.ts. Covers the behaviour [D6] extracted verbatim
 * from the previous inline `GET /pulls/:id` route (server/INSIGHTS.md,
 * 2026-09-25 session note): GitHub success persists + returns fresh detail;
 * GitHub failure falls back to what's already stored; a PR outside the
 * workspace 404s.
 */
import { describe, it, expect } from 'vitest';
import type { GitHubClient, PrDetail, RepoRef } from '@devdigest/shared';
import { PullsService, type PullsPorts } from '../src/modules/pulls/service.js';
import type { PullsRepository } from '../src/modules/pulls/repository.js';
import { NotFoundError } from '../src/platform/errors.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';

const WS = 'ws-1';

function pullRow(over: Record<string, unknown> = {}) {
  return {
    id: 'pr-1',
    workspaceId: WS,
    repoId: 'repo-1',
    number: 482,
    title: 'Add rate limiting',
    author: 'marisa.koch',
    branch: 'feat/rate-limit',
    base: 'main',
    headSha: 'a1b2c3d4',
    lastReviewedSha: null,
    additions: 5,
    deletions: 1,
    filesCount: 1,
    status: 'needs_review',
    body: 'stored body',
    openedAt: null,
    updatedAt: null,
    ...over,
  };
}

function repoRow(over: Record<string, unknown> = {}) {
  return {
    id: 'repo-1',
    workspaceId: WS,
    owner: 'acme',
    name: 'payments-api',
    fullName: 'acme/payments-api',
    defaultBranch: 'main',
    clonePath: null,
    lastPolledAt: null,
    createdBy: null,
    createdAt: null,
    ...over,
  };
}

interface Harness {
  service: PullsService;
  github: MockGitHubClient;
  replacedFiles: { prId: string; files: unknown[] }[];
  replacedCommits: { prId: string; commits: unknown[] }[];
  updatedDetail: { prId: string; values: unknown }[];
  logs: string[];
}

function harness(
  opts: {
    pull?: Record<string, unknown> | undefined;
    repo?: Record<string, unknown> | undefined;
    githubFails?: boolean;
    githubDetail?: Partial<PrDetail>;
    storedFiles?: { path: string; additions: number; deletions: number; patch: string | null }[];
    storedCommits?: { sha: string; message: string; author: string; committedAt: Date | null }[];
  } = {},
): Harness {
  const replacedFiles: Harness['replacedFiles'] = [];
  const replacedCommits: Harness['replacedCommits'] = [];
  const updatedDetail: Harness['updatedDetail'] = [];
  const logs: string[] = [];

  const pull = opts.pull === undefined ? pullRow() : opts.pull ? pullRow(opts.pull) : undefined;
  const repo = opts.repo === undefined ? repoRow() : opts.repo ? repoRow(opts.repo) : undefined;

  const repository = {
    getPull: async () => pull,
    getRepo: async () => repo,
    replaceFiles: async (prId: string, files: unknown[]) => {
      replacedFiles.push({ prId, files });
    },
    replaceCommits: async (prId: string, commits: unknown[]) => {
      replacedCommits.push({ prId, commits });
    },
    updateDetail: async (prId: string, values: unknown) => {
      updatedDetail.push({ prId, values });
    },
    getFiles: async () => opts.storedFiles ?? [],
    getCommits: async () => opts.storedCommits ?? [],
  } as unknown as PullsRepository;

  const github = new MockGitHubClient({ detail: opts.githubDetail });
  const failingGithub: GitHubClient = {
    ...github,
    getPullRequest: async (_repo: RepoRef, _n: number) => {
      throw new Error('GitHub unavailable');
    },
  };

  const ports: PullsPorts = {
    repo: repository,
    github: async () => (opts.githubFails ? failingGithub : github),
    log: (msg: string) => logs.push(msg),
  };

  return { service: new PullsService(ports), github, replacedFiles, replacedCommits, updatedDetail, logs };
}

describe('PullsService.refreshPullDetail — happy path', () => {
  it('persists the freshly fetched files/commits/body and returns the fresh detail', async () => {
    const h = harness();
    const detail = await h.service.refreshPullDetail(WS, 'pr-1');

    expect(h.replacedFiles).toHaveLength(1);
    expect(h.replacedFiles[0]!.prId).toBe('pr-1');
    expect(h.replacedCommits).toHaveLength(1);
    expect(h.replacedCommits[0]!.prId).toBe('pr-1');
    expect(h.updatedDetail).toHaveLength(1);
    expect(h.updatedDetail[0]!.values).toMatchObject({
      body: 'Add rate limiting. Closes #471.',
      additions: 247,
      deletions: 38,
      filesCount: 9,
    });

    // returned detail is the fresh GitHub payload, stamped with the DB id.
    expect(detail.id).toBe('pr-1');
    expect(detail.body).toBe('Add rate limiting. Closes #471.');
    expect(detail.files).toHaveLength(1);
    expect(detail.files[0]!.path).toBe('src/config.ts');
  });

  it('never logs on the GitHub-success path', async () => {
    const h = harness();
    await h.service.refreshPullDetail(WS, 'pr-1');
    expect(h.logs).toEqual([]);
  });
});

describe('PullsService.refreshPullDetail — GitHub failure falls back to the persisted row', () => {
  it('returns the stored pull/files/commits instead of throwing, and logs why', async () => {
    const h = harness({
      githubFails: true,
      pull: { body: 'stored body', additions: 10, deletions: 2, filesCount: 1 },
      storedFiles: [{ path: 'src/index.ts', additions: 10, deletions: 2, patch: '@@ stored @@' }],
      storedCommits: [
        { sha: 'deadbeef', message: 'stored commit', author: 'marisa.koch', committedAt: null },
      ],
    });

    const detail = await h.service.refreshPullDetail(WS, 'pr-1');

    expect(h.replacedFiles).toHaveLength(0);
    expect(h.replacedCommits).toHaveLength(0);
    expect(h.updatedDetail).toHaveLength(0);

    expect(detail.id).toBe('pr-1');
    expect(detail.body).toBe('stored body');
    expect(detail.additions).toBe(10);
    expect(detail.deletions).toBe(2);
    expect(detail.files_count).toBe(1);
    expect(detail.files).toEqual([
      { path: 'src/index.ts', additions: 10, deletions: 2, patch: '@@ stored @@' },
    ]);
    expect(detail.commits).toEqual([
      { sha: 'deadbeef', message: 'stored commit', author: 'marisa.koch', committed_at: null },
    ]);

    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toContain('GitHub PR detail refresh skipped');
    expect(h.logs[0]).toContain('GitHub unavailable');
  });

  it('falls back to a null body when the stored row has none', async () => {
    const h = harness({ githubFails: true, pull: { body: null } });
    const detail = await h.service.refreshPullDetail(WS, 'pr-1');
    expect(detail.body).toBeNull();
  });
});

describe('PullsService.refreshPullDetail — not found', () => {
  it('throws NotFoundError when the PR is not in this workspace', async () => {
    const h = harness({ pull: null });
    await expect(h.service.refreshPullDetail(WS, 'pr-404')).rejects.toThrow(NotFoundError);
    await expect(h.service.refreshPullDetail(WS, 'pr-404')).rejects.toThrow('Pull request not found');
  });

  it('throws NotFoundError when the PR references a repo that no longer exists', async () => {
    const h = harness({ repo: null });
    await expect(h.service.refreshPullDetail(WS, 'pr-1')).rejects.toThrow(NotFoundError);
    await expect(h.service.refreshPullDetail(WS, 'pr-1')).rejects.toThrow('Repo not found');
  });

  it('never calls GitHub or writes anything when the PR is not found', async () => {
    const h = harness({ pull: null });
    await expect(h.service.refreshPullDetail(WS, 'pr-404')).rejects.toThrow(NotFoundError);
    expect(h.replacedFiles).toHaveLength(0);
    expect(h.replacedCommits).toHaveLength(0);
    expect(h.updatedDetail).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import type { Repo, PrMeta, Agent } from '@devdigest/shared';
import { FakeApiClient, type FakeSeed } from '../src/adapters/mocks.js';
// AC2, AC3, AC4: resolveRepo/resolvePr/resolveAgent, from the not-yet-created app/resolve.ts.
import { resolveRepo, resolvePr, resolveAgent } from '../src/app/resolve.js';
import { ToolError } from '../src/app/errors.js';

function repo(overrides: Partial<Repo>): Repo {
  return {
    id: overrides.id ?? 'repo-1',
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

describe('resolveRepo', () => {
  it('resolves owner/name case-insensitively', async () => {
    const seed = emptySeed();
    seed.repos = [repo({ id: 'r1', full_name: 'Acme/Payments-Api' })];
    const api = new FakeApiClient(seed);
    const resolved = await resolveRepo(api, 'acme/payments-api');
    expect(resolved.id).toBe('r1');
  });

  it('unknown repo lists known repos (E1)', async () => {
    const seed = emptySeed();
    seed.repos = [
      repo({ id: 'r1', full_name: 'acme/payments-api' }),
      repo({ id: 'r2', full_name: 'acme/billing' }),
    ];
    const api = new FakeApiClient(seed);
    try {
      await resolveRepo(api, 'acme/unknown');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as Error).message).toBe(
        'Repo "acme/unknown" is not in DevDigest. Known repos: acme/payments-api, acme/billing. Add it in the DevDigest UI (Add repository), then retry.',
      );
    }
  });

  it('unknown repo with none known says none', async () => {
    const seed = emptySeed();
    const api = new FakeApiClient(seed);
    await expect(resolveRepo(api, 'acme/unknown')).rejects.toMatchObject({
      message:
        'Repo "acme/unknown" is not in DevDigest. Known repos: none. Add it in the DevDigest UI (Add repository), then retry.',
    });
  });

  it('unknown repo lists at most 10 known repos', async () => {
    const seed = emptySeed();
    seed.repos = Array.from({ length: 15 }, (_, i) => repo({ id: `r${i}`, full_name: `acme/repo-${i}` }));
    const api = new FakeApiClient(seed);
    try {
      await resolveRepo(api, 'acme/unknown');
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      const listed = message.split('Known repos: ')[1]!.split('. Add it')[0]!.split(', ');
      expect(listed).toHaveLength(10);
    }
  });
});

describe('resolvePr', () => {
  it('maps pr to the resolved repo pull id', async () => {
    const seed = emptySeed();
    const theRepo = repo({ id: 'r1', full_name: 'acme/payments-api' });
    seed.repos = [theRepo];
    seed.pullsByRepo['r1'] = [pr({ id: 'pull-42', number: 42 })];
    const api = new FakeApiClient(seed);
    const resolved = await resolvePr(api, theRepo, 42);
    expect(resolved.id).toBe('pull-42');
  });

  it('unknown PR number (E2)', async () => {
    const seed = emptySeed();
    const theRepo = repo({ id: 'r1', full_name: 'acme/payments-api' });
    seed.repos = [theRepo];
    seed.pullsByRepo['r1'] = [pr({ id: 'pull-42', number: 42 })];
    const api = new FakeApiClient(seed);
    await expect(resolvePr(api, theRepo, 999)).rejects.toMatchObject({
      message:
        'PR #999 is not imported for acme/payments-api. Check the number; DevDigest imports open PRs from GitHub when a GitHub token is set in Settings.',
    });
  });

  it('the same PR number in a different repo is not matched', async () => {
    const seed = emptySeed();
    const repoA = repo({ id: 'rA', full_name: 'acme/payments-api' });
    const repoB = repo({ id: 'rB', full_name: 'acme/billing' });
    seed.repos = [repoA, repoB];
    seed.pullsByRepo['rB'] = [pr({ id: 'pull-in-b', number: 42 })];
    // repoA has no PR #42 seeded.
    const api = new FakeApiClient(seed);
    await expect(resolvePr(api, repoA, 42)).rejects.toMatchObject({
      message:
        'PR #42 is not imported for acme/payments-api. Check the number; DevDigest imports open PRs from GitHub when a GitHub token is set in Settings.',
    });
  });
});

describe('resolveAgent', () => {
  it('agent by id before name', async () => {
    const seed = emptySeed();
    seed.agents = [agent({ id: 'agent-1', name: 'Security Reviewer' })];
    const api = new FakeApiClient(seed);
    const resolved = await resolveAgent(api, 'agent-1');
    expect(resolved.id).toBe('agent-1');
  });

  it('agent by exact case-insensitive name', async () => {
    const seed = emptySeed();
    seed.agents = [agent({ id: 'agent-1', name: 'Security Reviewer' })];
    const api = new FakeApiClient(seed);
    const resolved = await resolveAgent(api, 'security reviewer');
    expect(resolved.id).toBe('agent-1');
  });

  it('unknown agent (E3)', async () => {
    const seed = emptySeed();
    seed.agents = [agent({ id: 'agent-1', name: 'Security Reviewer' })];
    const api = new FakeApiClient(seed);
    await expect(resolveAgent(api, 'nope')).rejects.toMatchObject({
      message: 'Agent "nope" not found — call devdigest_list_agents for valid ids.',
    });
  });

  it('ambiguous agent name (E4)', async () => {
    const seed = emptySeed();
    seed.agents = [
      agent({ id: 'agent-1', name: 'Reviewer' }),
      agent({ id: 'agent-2', name: 'Reviewer' }),
    ];
    const api = new FakeApiClient(seed);
    await expect(resolveAgent(api, 'Reviewer')).rejects.toMatchObject({
      message: 'Agent name "Reviewer" matches 2 agents (agent-1, agent-2) — pass the id from devdigest_list_agents.',
    });
  });
});

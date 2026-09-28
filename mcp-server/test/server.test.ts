import { describe, it, expect } from 'vitest';
import { connectInProcess } from './support/in-process-client.js';
import { createServer } from '../src/server.js';
import { FakeApiClient, type FakeSeed } from '../src/adapters/mocks.js';
import type { Clock, ServerDeps } from '../src/ports/api-client.js';
import type { Agent } from '@devdigest/shared';
// AC18, AC19, AC20, AC22, AC12 (schema half). The output schemas come from the
// not-yet-created app/present.ts; their absence fails the whole file for the right reason
// (missing module) until Step 3/5 land.
import { ListAgentsOut } from '../src/app/present.js';

const TOOL_DESCRIPTIONS: Record<string, { title: string; description: string }> = {
  devdigest_list_agents: {
    title: 'List review agents',
    description:
      'List the reviewer agents configured in DevDigest: id, name, model and whether each is enabled. Call it first to get a valid agent for devdigest_run_agent_on_pr or devdigest_get_findings.',
  },
  devdigest_run_agent_on_pr: {
    title: 'Run agent on PR',
    description:
      'Run one DevDigest reviewer agent on a pull request, wait up to about 2 minutes and return its verdict and findings. Spends LLM credits (max 10 runs/min), so for existing results use devdigest_get_findings. On timeout returns status "running" with a run_id for devdigest_get_findings.',
  },
  devdigest_get_findings: {
    title: 'Get review findings',
    description:
      'Get the verdict and findings of finished DevDigest reviews on a pull request without starting a run. Defaults to the latest review per agent; narrow with agent or run_id. Use response_format "detailed" with agent or run_id for full rationales, and offset to page.',
  },
  devdigest_get_conventions: {
    title: 'Get repo conventions',
    description:
      "Get the coding conventions DevDigest extracted for a repo, accepted ones by default, each with the file and line that evidences it. Use them to check code against the team's house rules.",
  },
  devdigest_get_blast_radius: {
    title: 'Get blast radius',
    description:
      "Get a pull request's blast radius from DevDigest's code index: each changed symbol, its callers as file:line and the HTTP endpoints and cron jobs they reach. Call it before reviewing or merging.",
  },
};

const FIELD_DESCRIPTIONS: Record<string, string> = {
  repo: 'GitHub repo as owner/name, e.g. acme/payments-api',
  pr: 'Pull request number, e.g. 42',
  agent: 'Agent id or exact name from devdigest_list_agents',
  run_id: 'Run id from devdigest_run_agent_on_pr; omit for the latest reviews',
  response_format: 'concise (default): top findings, short text; detailed: full rationale, needs agent or run_id',
  offset: 'Findings to skip per review when paging; default 0',
  status: 'accepted (default), pending or all',
  files: 'Optional changed file paths to limit the analysis',
};

function sentenceCount(text: string): number {
  const cleaned = text.replace(/e\.g\./g, 'eg');
  const matches = cleaned.match(/[.!?]['"]?(?:\s|$)/g);
  return matches ? matches.length : 0;
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

async function setup(seed: FakeSeed) {
  const api = new FakeApiClient(seed);
  const deps: ServerDeps = { api, clock: noopClock(), waitMs: 110000, pollMs: 2000, apiUrl: 'http://localhost:3001' };
  const harness = await connectInProcess(() => createServer(deps));
  return { ...harness, api };
}

describe('tools/list', () => {
  it('lists exactly five tools with contract metadata', async () => {
    const { client, close } = await setup(emptySeed());
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        'devdigest_get_blast_radius',
        'devdigest_get_conventions',
        'devdigest_get_findings',
        'devdigest_list_agents',
        'devdigest_run_agent_on_pr',
      ]);
      for (const tool of tools) {
        expect(tool.outputSchema).toBeDefined();
      }
      const listAgents = tools.find((t) => t.name === 'devdigest_list_agents')!;
      expect(listAgents.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true, destructiveHint: false });
      const runAgent = tools.find((t) => t.name === 'devdigest_run_agent_on_pr')!;
      expect(runAgent.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: true });
      const getFindings = tools.find((t) => t.name === 'devdigest_get_findings')!;
      expect(getFindings.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
      const getConventions = tools.find((t) => t.name === 'devdigest_get_conventions')!;
      expect(getConventions.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
      const getBlastRadius = tools.find((t) => t.name === 'devdigest_get_blast_radius')!;
      expect(getBlastRadius.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    } finally {
      await close();
    }
  });

  it('tool and field descriptions match the plan verbatim', async () => {
    const { client, close } = await setup(emptySeed());
    try {
      const { tools } = await client.listTools();
      for (const [name, expected] of Object.entries(TOOL_DESCRIPTIONS)) {
        const tool = tools.find((t) => t.name === name);
        expect(tool, `tool ${name} exists`).toBeDefined();
        expect(tool!.title).toBe(expected.title);
        expect(tool!.description).toBe(expected.description);
      }
      for (const tool of tools) {
        const props = (tool.inputSchema as { properties?: Record<string, { description?: string }> })
          .properties ?? {};
        for (const [field, description] of Object.entries(FIELD_DESCRIPTIONS)) {
          if (field in props) {
            expect(props[field]!.description, `${tool.name}.${field}`).toBe(description);
          }
        }
      }
    } finally {
      await close();
    }
  });

  it('descriptions ≤300 chars and ≤3 sentences', async () => {
    const { client, close } = await setup(emptySeed());
    try {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.description!.length).toBeLessThanOrEqual(300);
        expect(sentenceCount(tool.description!)).toBeLessThanOrEqual(3);
      }
      // Sanity-check the counter itself against the plan's own verified table.
      expect(sentenceCount(TOOL_DESCRIPTIONS.devdigest_list_agents!.description)).toBe(2);
      expect(sentenceCount(TOOL_DESCRIPTIONS.devdigest_run_agent_on_pr!.description)).toBe(3);
      expect(sentenceCount(TOOL_DESCRIPTIONS.devdigest_get_findings!.description)).toBe(3);
      expect(sentenceCount(TOOL_DESCRIPTIONS.devdigest_get_conventions!.description)).toBe(2);
      expect(sentenceCount(TOOL_DESCRIPTIONS.devdigest_get_blast_radius!.description)).toBe(2);
    } finally {
      await close();
    }
  });

  it('no instructions and tools/list ≤10,240 bytes', async () => {
    const { client, instructions, close } = await setup(emptySeed());
    try {
      expect(instructions).toBeUndefined();
      const { tools } = await client.listTools();
      const bytes = Buffer.byteLength(JSON.stringify(tools), 'utf8');
      expect(bytes).toBeLessThanOrEqual(10240);
    } finally {
      await close();
    }
  });
});

describe('tool call results', () => {
  it('success mirrors structuredContent in text', async () => {
    const seed = emptySeed();
    seed.agents = [agent({ id: 'agent-1', name: 'Security Reviewer' })];
    const { client, close } = await setup(seed);
    try {
      const result = await client.callTool({ name: 'devdigest_list_agents', arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toBeDefined();
      expect(ListAgentsOut.safeParse(result.structuredContent).success).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect(content[0]!.text).toBe(JSON.stringify(result.structuredContent));
    } finally {
      await close();
    }
  });

  it('errors are isError tool results without structuredContent', async () => {
    const { client, close } = await setup(emptySeed());
    try {
      const result = await client.callTool({
        name: 'devdigest_get_findings',
        arguments: { repo: 'acme/unknown', pr: 42 },
      });
      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect(content[0]!.text).toBe(
        'Repo "acme/unknown" is not in DevDigest. Known repos: none. Add it in the DevDigest UI (Add repository), then retry.',
      );
      expect(result.structuredContent).toBeUndefined();
    } finally {
      await close();
    }
  });

  it('non-uuid run_id is rejected before any API call', async () => {
    const seed = emptySeed();
    const { client, api, close } = await setup(seed);
    try {
      let rejected = false;
      try {
        const result = await client.callTool({
          name: 'devdigest_get_findings',
          arguments: { repo: 'acme/payments-api', pr: 42, run_id: 'not-a-uuid' },
        });
        rejected = result.isError === true;
      } catch {
        rejected = true;
      }
      expect(rejected).toBe(true);
      expect(api.calls).toHaveLength(0);

      // Contrast: a syntactically valid UUID run_id does reach the API (proves the rejection
      // above is schema validation, not "the tool always makes zero calls").
      try {
        await client.callTool({
          name: 'devdigest_get_findings',
          arguments: { repo: 'acme/payments-api', pr: 42, run_id: '11111111-1111-1111-1111-111111111111' },
        });
      } catch {
        // Resolution failure (unknown repo) is expected here; only the call count matters.
      }
      expect(api.calls.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
});

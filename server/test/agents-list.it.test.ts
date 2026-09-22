import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-list] Docker not available — skipping integration tests.');
}

/**
 * The agent tile shows how many skills an agent has linked, so `GET /agents`
 * carries `skill_count` for every agent — counted from `agent_skills`, one
 * grouped query, zero for an agent with no links.
 */
d('GET /agents skill_count', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review the diff.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function createSkill(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: `${name} rule.`, type: 'custom', body: `# ${name}` },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it('counts the skills linked to each agent', async () => {
    const app = await makeApp();
    const linked = await createAgent(app, 'Counted Agent');
    const bare = await createAgent(app, 'Bare Agent');
    const a = await createSkill(app, 'count-skill-a');
    const b = await createSkill(app, 'count-skill-b');

    const link = await app.inject({
      method: 'POST',
      url: `/agents/${linked}/skills`,
      payload: { skill_ids: [a, b] },
    });
    expect(link.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: '/agents' });
    expect(res.statusCode).toBe(200);
    const byId = new Map((res.json() as Array<{ id: string; skill_count?: number }>).map((x) => [x.id, x]));
    expect(byId.get(linked)?.skill_count).toBe(2);
    expect(byId.get(bare)?.skill_count).toBe(0);
  });
});

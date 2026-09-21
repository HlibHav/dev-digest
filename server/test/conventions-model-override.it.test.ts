import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { EXTRACTION_SCHEMA_NAME } from '../src/modules/conventions/constants.js';
import { resolveFeatureModel } from '../src/modules/settings/feature-models.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions-model-override] Docker not available — skipping integration tests.');
}

/**
 * The conventions scan's model choice, end to end: an untouched workspace
 * runs on the registry's current default, and a workspace that has picked
 * its own model in Settings gets that one instead. `settings-models.it.test.ts`
 * already proves `resolveFeatureModel` in isolation; this proves the scan
 * itself actually uses whatever it resolves to.
 */

const SERVICE_TS = [
  "import type { Skill } from '@devdigest/shared';",
  '',
  'export class SkillsService {',
  '  constructor(private repo: SkillsRepository) {}',
  '}',
].join('\n');

function extraction(rule: string) {
  return {
    candidates: [
      {
        category: 'architecture',
        rule,
        evidence: {
          path: 'src/modules/skills/service.ts',
          line: 1,
          snippet: 'constructor(private repo: SkillsRepository) {}',
        },
        confidence: 0.9,
      },
    ],
  };
}

d('conventions: scan follows the resolved feature model (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repoId: string;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
    const [ws] = await pg.handle.db.select({ id: t.workspaces.id }).from(t.workspaces);
    workspaceId = ws!.id;
    // getConventionSamples ranks off `file_rank`, which only exists after an
    // index run. Seed one row so the sampler has something to return.
    await pg.handle.db.insert(t.fileRank).values({
      repoId,
      filePath: 'src/modules/skills/service.ts',
      pagerank: 0.9,
      hotness: 0,
      rank: 0.9,
      percentile: 99,
    });
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(rule: string) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: { 'src/modules/skills/service.ts': SERVICE_TS } }),
        github: new MockGitHubClient(),
        llm: {
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { [EXTRACTION_SCHEMA_NAME]: extraction(rule) },
          }),
        },
      },
    });
  }

  /** Enqueue a scan and wait for the job row to leave `queued`/`running`. */
  async function runScan(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(202);
    for (let i = 0; i < 60; i += 1) {
      const [job] = await pg.handle.db
        .select({ status: t.jobs.status })
        .from(t.jobs)
        .where(eq(t.jobs.id, res.json().job_id as string));
      if (job && job.status !== 'queued' && job.status !== 'running') return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('scan did not finish');
  }

  it('scans on the registry default when the workspace has not chosen a model', async () => {
    const app = await makeApp('A service takes the ports it calls.');
    expect(await resolveFeatureModel(app.container, workspaceId, 'conventions')).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-4.1-mini',
    });

    await runScan(app);

    const page = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(page.json().scan.status).toBe('done');
    expect(
      page.json().candidates.some((c: { rule: string }) => c.rule === 'A service takes the ports it calls.'),
    ).toBe(true);
    await app.close();
  });

  it('scans on the workspace override once one is saved in Settings', async () => {
    const app = await makeApp('Export one class per service file.');

    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { conventions: { provider: 'openrouter', model: 'anthropic/claude-4.5-haiku' } } },
    });
    expect(put.statusCode).toBe(200);
    expect(await resolveFeatureModel(app.container, workspaceId, 'conventions')).toEqual({
      provider: 'openrouter',
      model: 'anthropic/claude-4.5-haiku',
    });

    await runScan(app);

    const page = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(page.json().scan.status).toBe('done');
    expect(
      page.json().candidates.some((c: { rule: string }) => c.rule === 'Export one class per service file.'),
    ).toBe(true);
    await app.close();
  });
});

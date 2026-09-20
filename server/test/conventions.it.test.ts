import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { EXTRACTION_SCHEMA_NAME } from '../src/modules/conventions/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * The conventions extractor against a real Postgres.
 *
 * The rule under test that is easy to get wrong: a re-scan must not resurrect a
 * candidate the user rejected. That is a property of the DATA, so it is only
 * really proven here — a unit test with a fake repository would just be
 * asserting the fake.
 */

const SERVICE_TS = [
  "import type { Skill } from '@devdigest/shared';",
  '',
  'export class SkillsService {',
  '  constructor(private repo: SkillsRepository) {}',
  '}',
].join('\n');

function extraction(rules: { rule: string; snippet: string }[]) {
  return {
    candidates: rules.map((r, i) => ({
      category: i === 0 ? 'architecture' : 'naming',
      rule: r.rule,
      evidence: { path: 'src/modules/skills/service.ts', line: 1, snippet: r.snippet },
      confidence: 0.9 - i * 0.1,
    })),
  };
}

const RULE_A = { rule: 'A service takes the ports it calls.', snippet: 'constructor(private repo: SkillsRepository) {}' };
const RULE_B = { rule: 'Export one class per service file.', snippet: 'export class SkillsService {' };

d('conventions extract → triage → skill', () => {
  let pg: PgFixture;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
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

  function makeApp(rules = [RULE_A, RULE_B]) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: { 'src/modules/skills/service.ts': SERVICE_TS } }),
        github: new MockGitHubClient(),
        // Registered under EVERY provider id, not just the one the feature
        // defaults to today. `resolveFeatureModel` reads the default from the
        // shared registry, so changing that default would otherwise silently
        // route this test past the mock and into a real, paid API call.
        llm: Object.fromEntries(
          (['openai', 'anthropic', 'openrouter'] as const).map((id) => [
            id,
            new MockLLMProvider('openai', {
              structuredBySchema: { [EXTRACTION_SCHEMA_NAME]: extraction(rules) },
            }),
          ]),
        ),
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
      if (job && job.status !== 'queued' && job.status !== 'running') return res.json();
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('scan did not finish');
  }

  it('persists verified candidates and reports the scan', async () => {
    const app = await makeApp();
    await runScan(app);

    const page = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(page.statusCode).toBe(200);
    const { candidates, scan } = page.json();
    expect(candidates).toHaveLength(2);
    expect(scan.status).toBe('done');
    // The candidate carries evidence the UI turns into a GitHub link.
    expect(candidates[0]).toMatchObject({
      evidence_path: 'src/modules/skills/service.ts',
      status: 'pending',
    });
    expect(candidates[0].evidence_line).toEqual(expect.any(Number));
    await app.close();
  });

  it('survives a restart — the rows are in Postgres, not in memory', async () => {
    const app = await makeApp();
    const page = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(page.json().candidates.length).toBeGreaterThan(0);
    await app.close();
  });

  it('a rejected candidate does not come back after a re-scan', async () => {
    const app = await makeApp();
    const before = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    const victim = before.json().candidates.find((c: { rule: string }) => c.rule === RULE_B.rule);
    expect(victim).toBeDefined();

    const rejected = await app.inject({
      method: 'PATCH',
      url: `/conventions/${victim.id}`,
      payload: { status: 'rejected' },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().status).toBe('rejected');

    // The model proposes the SAME two rules again.
    await runScan(app);

    const after = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    const again = after.json().candidates.filter((c: { rule: string }) => c.rule === RULE_B.rule);
    expect(again).toHaveLength(1);
    expect(again[0].status).toBe('rejected');
    await app.close();
  });

  it('an inline edit persists and is not overwritten by a re-scan', async () => {
    const app = await makeApp();
    const before = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    const target = before.json().candidates.find((c: { rule: string }) => c.rule === RULE_A.rule);

    await app.inject({
      method: 'PATCH',
      url: `/conventions/${target.id}`,
      payload: { rule: 'A service takes the ports it calls, never the container.', status: 'accepted' },
    });

    await runScan(app);

    const after = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    const edited = after.json().candidates.find((c: { id: string }) => c.id === target.id);
    expect(edited.rule).toBe('A service takes the ports it calls, never the container.');
    expect(edited.status).toBe('accepted');
    await app.close();
  });

  it('builds one repo-conventions skill from accepted rows only', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: {},
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'repo-conventions', type: 'convention', source: 'extracted' });
    // The accepted rule is in; the rejected one is not.
    expect(skill.body).toContain('never the container');
    expect(skill.body).not.toContain(RULE_B.rule);

    const all = await app.inject({ method: 'GET', url: '/skills' });
    const matches = all.json().filter((s: { name: string }) => s.name === 'repo-conventions');
    expect(matches).toHaveLength(1);
    await app.close();
  });

  it('creating the skill twice updates it instead of duplicating it', async () => {
    const app = await makeApp();
    const second = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { body: '# Hand-edited body\n\n- One rule.' },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().version).toBe(2);

    const all = await app.inject({ method: 'GET', url: '/skills' });
    expect(all.json().filter((s: { name: string }) => s.name === 'repo-conventions')).toHaveLength(1);

    // The previous body is recoverable, which is what the Versioning tab shows.
    const versions = await app.inject({ method: 'GET', url: `/skills/${second.json().id}/versions` });
    expect(versions.json().length).toBeGreaterThanOrEqual(2);
    await app.close();
  });

  it('refuses to edit a candidate from another workspace', async () => {
    const app = await makeApp();
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other-tenant' })
      .returning({ id: t.workspaces.id });
    const [foreign] = await pg.handle.db
      .insert(t.conventions)
      .values({
        workspaceId: other!.id,
        repoId: null,
        rule: 'Foreign rule.',
        ruleHash: 'foreignhash',
        status: 'pending',
      })
      .returning({ id: t.conventions.id });

    const res = await app.inject({
      method: 'PATCH',
      url: `/conventions/${foreign!.id}`,
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(404);

    const [still] = await pg.handle.db
      .select({ status: t.conventions.status })
      .from(t.conventions)
      .where(and(eq(t.conventions.id, foreign!.id)));
    expect(still!.status).toBe('pending');
    await app.close();
  });
});

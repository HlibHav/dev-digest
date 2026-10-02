import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { ContextDocList, AgentContext, SkillContext } from '@devdigest/shared';

/**
 * Red-first for Project Context (docs/plans/2026-10-02-project-context.md),
 * AC-1, AC-3, AC-4, AC-5, AC-9, AC-12, AC-18, AC-41. Builds a real fixture clone
 * in a temp dir and points a repo row's `clone_path` at it; the real
 * `FsRepoDocs` adapter runs, so the symlink and exclusion rules are exercised
 * against a real filesystem.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('Project Context routes (Testcontainers pg + temp clone)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let tmp: string;
  let clone: string;
  let outside: string;
  let git: MockGitClient;
  let fetchSpy: number;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    tmp = await mkdtemp(join(tmpdir(), 'ctx-'));
    clone = join(tmp, 'clone');
    outside = join(tmp, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'x.md'), 'OUTSIDE SECRET');
    const files: Record<string, string> = {
      'specs/a.md': '# A spec',
      'docs/b.md': '# B doc',
      'README.md': '# readme',
      '.devdigest/specs/d.md': '# dotted spec',
      'node_modules/x/c.md': 'ignored',
      'src/vendor/e.md': 'ignored',
      'dist/f.md': 'ignored',
      '.github/g.md': 'ignored',
      'src/index.ts': 'export {}',
    };
    for (const [p, c] of Object.entries(files)) {
      await mkdir(join(clone, p, '..'), { recursive: true });
      await writeFile(join(clone, p), c);
    }
    // A directory symlink to outside, and a file symlink to outside.
    await symlink(outside, join(clone, 'docs', 'link'));
    await symlink(join(outside, 'x.md'), join(clone, 'specs', 'evil.md'));
    // SR-3: in-clone symlinks named .md whose targets are not docs.
    await mkdir(join(clone, '.git'), { recursive: true });
    await writeFile(join(clone, '.git', 'config'), '[core]\n\tsecret = 1\n');
    await mkdir(join(clone, 'node_modules'), { recursive: true });
    await writeFile(join(clone, 'node_modules', 'x.md'), '# vendored');
    await symlink(join('.git', 'config'), join(clone, 'notes.md'));
    await symlink(join('node_modules', 'x.md'), join(clone, 'vendored.md'));

    const name = `ctx-${randomUUID()}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'o', name, fullName: `o/${name}`, clonePath: clone })
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  async function app() {
    git = new MockGitClient({ diff: '' });
    fetchSpy = 0;
    const origFetch = git.fetchPullHead.bind(git);
    git.fetchPullHead = async (...args: Parameters<typeof origFetch>) => {
      fetchSpy++;
      return origFetch(...args);
    };
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git,
        llm: { openai: new MockLLMProvider('openai', { structured: {} }) },
      },
    });
  }

  async function makeAgent(wsId = workspaceId) {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId: wsId,
        name: `agent-${randomUUID()}`,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        systemPrompt: 'review',
      })
      .returning();
    return a!.id;
  }
  async function makeSkill(wsId = workspaceId) {
    const [s] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: wsId,
        name: `skill-${randomUUID()}`,
        description: '',
        type: 'custom',
        source: 'manual',
        body: 'body',
      })
      .returning();
    return s!.id;
  }

  it('AC-1: lists exactly the four non-excluded docs with size, category and tokens', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect(res.statusCode).toBe(200);
    const body = ContextDocList.parse(res.json());
    expect(body.cloned).toBe(true);
    expect(body.files.map((f) => f.path)).toEqual([
      '.devdigest/specs/d.md',
      'README.md',
      'docs/b.md',
      'specs/a.md',
    ]);
    const byPath = Object.fromEntries(body.files.map((f) => [f.path, f]));
    expect(byPath['specs/a.md']!.category).toBe('specs');
    expect(byPath['docs/b.md']!.category).toBe('docs');
    expect(byPath['README.md']!.category).toBe('other');
    for (const f of body.files) {
      expect(f.size).toBeGreaterThan(0);
      expect(f.tokens).toBeGreaterThan(0);
    }
  });

  it('lists and reads a .md over 1 MiB (no maximum doc size)', async () => {
    const a = await app();
    const big = '# big\n' + 'lorem ipsum dolor sit amet\n'.repeat(40000);
    await writeFile(join(clone, 'docs', 'big.md'), big);
    try {
      await a.inject({ method: 'POST', url: `/repos/${repoId}/context/reindex` });
      const list = ContextDocList.parse(
        (await a.inject({ method: 'GET', url: `/repos/${repoId}/context` })).json(),
      );
      expect(list.files.map((f) => f.path)).toContain('docs/big.md');
      const res = await a.inject({
        method: 'GET',
        url: `/repos/${repoId}/context/file?path=${encodeURIComponent('docs/big.md')}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().content).toBe(big);
    } finally {
      await rm(join(clone, 'docs', 'big.md'));
      await a.inject({ method: 'POST', url: `/repos/${repoId}/context/reindex` });
    }
  });

  it('AC-3: does not follow directory symlinks', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    const paths = ContextDocList.parse(res.json()).files.map((f) => f.path);
    expect(paths).not.toContain('docs/link/x.md');
  });

  it('AC-3: leaves out a .md symlink that resolves outside the clone', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    const paths = ContextDocList.parse(res.json()).files.map((f) => f.path);
    expect(paths).not.toContain('specs/evil.md');
    const file = await a.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=${encodeURIComponent('specs/evil.md')}`,
    });
    expect(file.statusCode).toBe(404);
  });

  it('SR-3: a .md symlink whose target is .git/config or under node_modules is neither listed nor readable', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    const paths = ContextDocList.parse(res.json()).files.map((f) => f.path);
    for (const p of ['notes.md', 'vendored.md']) {
      expect(paths).not.toContain(p);
      const file = await a.inject({
        method: 'GET',
        url: `/repos/${repoId}/context/file?path=${encodeURIComponent(p)}`,
      });
      expect(file.statusCode).toBe(404);
    }
  });

  it('AC-4: serves a listed doc and answers 404 for traversal and non-listed paths', async () => {
    const a = await app();
    const ok = await a.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=${encodeURIComponent('specs/a.md')}`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ path: 'specs/a.md', content: '# A spec' });
    for (const p of ['../../etc/passwd', 'src/index.ts', 'docs/link/x.md', 'node_modules/x/c.md']) {
      const res = await a.inject({
        method: 'GET',
        url: `/repos/${repoId}/context/file?path=${encodeURIComponent(p)}`,
      });
      expect(res.statusCode, p).toBe(404);
    }
  });

  it('AC-5: rescans the clone as it is on disk, without any git call', async () => {
    const a = await app();
    await a.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    await writeFile(join(clone, 'specs', 'new.md'), '# new');
    const res = await a.inject({ method: 'POST', url: `/repos/${repoId}/context/reindex` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'done', pct: 100 });
    const list = ContextDocList.parse(
      (await a.inject({ method: 'GET', url: `/repos/${repoId}/context` })).json(),
    );
    expect(list.files.map((f) => f.path)).toContain('specs/new.md');
    expect(git.cloned).toEqual([]);
    expect(git.syncs).toEqual([]);
    expect(fetchSpy).toBe(0);
    await rm(join(clone, 'specs', 'new.md'));
    await a.inject({ method: 'POST', url: `/repos/${repoId}/context/reindex` });
  });

  it('AC-9 / AC-41: used_by counts agents and skills, and drops when the owner is deleted', async () => {
    const a = await app();
    const [a1, a2, s1] = [await makeAgent(), await makeAgent(), await makeSkill()];
    for (const id of [a1, a2]) {
      const r = await a.inject({ method: 'PUT', url: `/agents/${id}/context`, payload: { paths: ['specs/a.md'] } });
      expect(r.statusCode).toBe(200);
    }
    await a.inject({ method: 'PUT', url: `/skills/${s1}/context`, payload: { paths: ['specs/a.md'] } });
    const used = async () =>
      ContextDocList.parse((await a.inject({ method: 'GET', url: `/repos/${repoId}/context` })).json())
        .files.find((f) => f.path === 'specs/a.md')!.used_by;
    expect(await used()).toEqual({ agents: 2, skills: 1 });

    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, a1));
    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, a2));
    await pg.handle.db.delete(t.skills).where(eq(t.skills.id, s1));
    expect(await used()).toEqual({ agents: 0, skills: 0 });
  });

  it('AC-12: an agent keeps the attached order across a reload; present and tokens follow the clone', async () => {
    const a = await app();
    const id = await makeAgent();
    await a.inject({
      method: 'PUT',
      url: `/agents/${id}/context`,
      payload: { paths: ['docs/b.md', 'specs/a.md', 'gone.md'] },
    });
    const res = await a.inject({ method: 'GET', url: `/agents/${id}/context?repo_id=${repoId}` });
    expect(res.statusCode).toBe(200);
    const ctx = AgentContext.parse(res.json());
    expect(ctx.attached.map((x) => [x.path, x.order, x.present])).toEqual([
      ['docs/b.md', 0, true],
      ['specs/a.md', 1, true],
      ['gone.md', 2, false],
    ]);
    expect(ctx.attached[2]!.tokens).toBe(0);
    // Reorder: replaces the whole list.
    await a.inject({ method: 'PUT', url: `/agents/${id}/context`, payload: { paths: ['specs/a.md', 'docs/b.md'] } });
    const again = AgentContext.parse(
      (await a.inject({ method: 'GET', url: `/agents/${id}/context?repo_id=${repoId}` })).json(),
    );
    expect(again.attached.map((x) => x.path)).toEqual(['specs/a.md', 'docs/b.md']);
  });

  it('AC-18: a skill keeps its order, previews its serialized block, and an agent inherits it', async () => {
    const a = await app();
    const sid = await makeSkill();
    const aid = await makeAgent();
    await pg.handle.db.insert(t.agentSkills).values({ agentId: aid, skillId: sid, order: 0 });
    await a.inject({ method: 'PUT', url: `/skills/${sid}/context`, payload: { paths: ['docs/b.md', 'specs/a.md'] } });
    await a.inject({ method: 'PUT', url: `/skills/${sid}/context`, payload: { paths: ['specs/a.md', 'docs/b.md'] } });
    const res = await a.inject({ method: 'GET', url: `/skills/${sid}/context?repo_id=${repoId}` });
    const ctx = SkillContext.parse(res.json());
    expect(ctx.attached.map((x) => x.path)).toEqual(['specs/a.md', 'docs/b.md']);
    expect(ctx.serialized).toContain('## Project context');
    expect(ctx.serialized).toContain('# A spec');

    const agentCtx = AgentContext.parse(
      (await a.inject({ method: 'GET', url: `/agents/${aid}/context?repo_id=${repoId}` })).json(),
    );
    expect(agentCtx.inherited.map((x) => [x.path, x.skill_id])).toEqual([
      ['specs/a.md', sid],
      ['docs/b.md', sid],
    ]);
  });

  it('rejects duplicate paths', async () => {
    const a = await app();
    const id = await makeAgent();
    const res = await a.inject({
      method: 'PUT',
      url: `/agents/${id}/context`,
      payload: { paths: ['specs/a.md', 'specs/a.md'] },
    });
    // The zod type provider answers request-validation failures with 422 in this app.
    expect(res.statusCode).toBe(422);
  });

  it('attachments are workspace-scoped', async () => {
    const a = await app();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${Date.now()}` })
      .returning();
    const foreignAgent = await makeAgent(otherWs!.id);
    const foreignSkill = await makeSkill(otherWs!.id);
    const put = await a.inject({
      method: 'PUT',
      url: `/agents/${foreignAgent}/context`,
      payload: { paths: ['specs/a.md'] },
    });
    expect(put.statusCode).toBe(404);
    const putSkill = await a.inject({
      method: 'PUT',
      url: `/skills/${foreignSkill}/context`,
      payload: { paths: ['specs/a.md'] },
    });
    expect(putSkill.statusCode).toBe(404);
    const get = await a.inject({ method: 'GET', url: `/agents/${foreignAgent}/context?repo_id=${repoId}` });
    expect(get.statusCode).toBe(404);
    expect(await pg.handle.db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, foreignAgent))).toEqual([]);
  });

  it('404s an unknown repo', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/repos/${randomUUID()}/context` });
    expect(res.statusCode).toBe(404);
  });
});

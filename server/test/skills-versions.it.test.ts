import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-versions] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD and its version history. Only the BODY is versioned — a name,
 * description or type edit changes the row without appending a snapshot,
 * because `skill_versions` stores nothing else.
 */
d('skills CRUD + /skills/:id/versions', () => {
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

  const createBody = {
    name: 'versioned-skill',
    description: 'Flag X.',
    type: 'rubric' as const,
    body: '# Rule\nFlag X.',
  };

  it('creates a skill with 201 and exactly one version holding its body', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: 'versioned-skill',
      type: 'rubric',
      source: 'manual',
      enabled: true,
      version: 1,
    });

    const id = created.json().id as string;
    const versions = await app.inject({ method: 'GET', url: `/skills/${id}/versions` });
    expect(versions.statusCode).toBe(200);
    expect(versions.json()).toHaveLength(1);
    expect(versions.json()[0]).toMatchObject({ skill_id: id, version: 1, body: createBody.body });
    await app.close();
  });

  it('a body edit bumps the version and keeps the old body readable', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: 'edited-skill' },
      })
    ).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: '# Rule\nFlag X and Y.' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const list = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(list.map((v: { version: number }) => v.version)).toEqual([2, 1]);

    const v1 = await app.inject({ method: 'GET', url: `/skills/${id}/versions/1` });
    expect(v1.json().body).toBe(createBody.body);
    const v2 = await app.inject({ method: 'GET', url: `/skills/${id}/versions/2` });
    expect(v2.json().body).toBe('# Rule\nFlag X and Y.');
    await app.close();
  });

  it('a name, description, type or enabled edit does NOT create a version', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: 'metadata-only' },
      })
    ).json().id as string;

    for (const payload of [
      { name: 'metadata-only-renamed' },
      { description: 'Flag X, loudly.' },
      { type: 'convention' as const },
      { enabled: false },
    ]) {
      const res = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload });
      expect(res.statusCode).toBe(200);
      expect(res.json().version).toBe(1);
    }

    const list = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(list).toHaveLength(1);
    await app.close();
  });

  it('deleting a skill removes it and its versions', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...createBody, name: 'doomed' } })
    ).json().id as string;

    const del = await app.inject({ method: 'DELETE', url: `/skills/${id}` });
    expect(del.statusCode).toBe(200);

    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    const rows = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, id));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('404s for an unknown skill and an unknown version; 422 for a malformed id', async () => {
    const app = await makeApp();
    const missing = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/skills/${missing}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${missing}/versions` })).statusCode,
    ).toBe(404);

    const id = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...createBody, name: 'four-oh-four' } })
    ).json().id as string;
    expect((await app.inject({ method: 'GET', url: `/skills/${id}/versions/99` })).statusCode).toBe(
      404,
    );
    // A non-uuid :id is rejected at the edge, not by the database.
    expect((await app.inject({ method: 'GET', url: '/skills/not-a-uuid' })).statusCode).toBe(422);
    await app.close();
  });

  it('does not read a skill across workspaces', async () => {
    const app = await makeApp();
    const repo = new SkillsRepository(pg.handle.db);
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${Date.now()}` })
      .returning();

    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'foreign-skill',
      type: 'custom',
      body: 'Not yours.',
    });

    // The default workspace must not see it through the API…
    expect((await app.inject({ method: 'GET', url: `/skills/${foreign.id}` })).statusCode).toBe(404);
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.map((s: { name: string }) => s.name)).not.toContain('foreign-skill');
    // …nor at the repository level.
    const defaultWs = (
      await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'))
    )[0]!;
    expect(await repo.getById(defaultWs.id, foreign.id)).toBeUndefined();
    await app.close();
  });

  it('answers 422, not 500, for a malformed or non-base64 upload', async () => {
    const app = await makeApp();

    // A truncated archive: fflate throws from deep inside, and the route must
    // still treat it as a bad upload.
    const truncated = Buffer.from(
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]),
    ).toString('base64');
    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'broken.zip', content_base64: truncated },
    });
    expect(bad.statusCode).toBe(422);

    // Not base64 at all — rejected by the schema at the edge, because
    // Buffer.from never throws on garbage.
    const garbage = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.md', content_base64: '!!! not base64 @@@' },
    });
    expect(garbage.statusCode).toBe(422);

    // Wrapped, padded base64 — what `base64 file` and `openssl base64` emit —
    // must be accepted. A one-pass regex rejects it, because the padding is no
    // longer at the end of the string.
    const wrapped = Buffer.from('# Wrapped\n\nA rule that survived line breaks.\n')
      .toString('base64')
      .replace(/(.{20})/g, '$1\n');
    expect(wrapped).toMatch(/=\n?$|\n/);
    const wrappedRes = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'wrapped.md', content_base64: `${wrapped}\n` },
    });
    expect(wrappedRes.statusCode).toBe(200);
    expect(wrappedRes.json().name).toBe('Wrapped');

    // A real markdown upload still previews, and still writes nothing.
    const ok = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: {
        filename: 'good.md',
        content_base64: Buffer.from('# Good\n\nA rule.\n').toString('base64'),
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().name).toBe('Good');
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.map((sk: { name: string }) => sk.name)).not.toContain('Good');
    await app.close();
  });

  it('rejects a skill with a blank body', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, name: 'blank', body: '   ' },
    });
    // zod accepts a non-empty string; the service rejects one that is only
    // whitespace once sanitised.
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

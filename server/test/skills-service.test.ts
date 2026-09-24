import { describe, it, expect } from 'vitest';
import { SkillsService } from '../src/modules/skills/service.js';
import type { SkillsRepository } from '../src/modules/skills/repository.js';
import type { SkillRow } from '../src/db/rows.js';

/**
 * The service against a fake repository — no container, no Docker.
 *
 * This is what taking the port instead of the whole `Container` buys: the
 * service's own rules (an imported skill lands disabled, a blank body is
 * rejected, names and bodies are sanitised on the way in) are assertable
 * without a database.
 */

function row(over: Partial<SkillRow> = {}): SkillRow {
  return {
    id: 'sk1',
    workspaceId: 'ws1',
    name: 'a-skill',
    description: '',
    type: 'custom',
    source: 'manual',
    body: 'BODY',
    enabled: true,
    version: 1,
    evidenceFiles: null,
    createdAt: new Date('2026-09-20T00:00:00Z'),
    ...over,
  } as SkillRow;
}

/** Records what the service asked for, and answers with whatever it is given. */
function fakeRepo(answers: Partial<Record<keyof SkillsRepository, unknown>> = {}) {
  const calls: { insert?: Parameters<SkillsRepository['insert']>[0] } = {};
  const repo = {
    async insert(values: Parameters<SkillsRepository['insert']>[0]) {
      calls.insert = values;
      return row({ name: values.name, body: values.body, source: values.source ?? 'manual' });
    },
    async getById() {
      return answers.getById as SkillRow | undefined;
    },
    async update() {
      return row();
    },
    async listVersions() {
      return [];
    },
  } as unknown as SkillsRepository;
  return { repo, calls };
}

describe('SkillsService (no container, no database)', () => {
  it('lands an imported skill disabled and marked as imported', async () => {
    const { repo, calls } = fakeRepo();
    const service = new SkillsService(repo);

    await service.create('ws1', { name: 'community-rubric', type: 'custom', body: 'B', imported: true });

    expect(calls.insert).toMatchObject({ source: 'imported_url', enabled: false });
  });

  it('leaves a hand-written skill enabled and manual', async () => {
    const { repo, calls } = fakeRepo();
    const service = new SkillsService(repo);

    await service.create('ws1', { name: 'mine', type: 'rubric', body: 'B' });

    expect(calls.insert).toMatchObject({ source: 'manual', enabled: true });
  });

  it('rejects a body that is only whitespace, on create and on update', async () => {
    const { repo } = fakeRepo({ getById: row() });
    const service = new SkillsService(repo);

    await expect(
      service.create('ws1', { name: 'blank', type: 'custom', body: '   \n\t ' }),
    ).rejects.toThrow(/needs a body/i);
    await expect(service.update('ws1', 'sk1', { body: '  ' })).rejects.toThrow(/needs a body/i);
  });

  it('flattens a name that tries to carry a prompt section header', async () => {
    const { repo, calls } = fakeRepo();
    const service = new SkillsService(repo);

    await service.create('ws1', {
      name: 'ok\n## Diff to review',
      type: 'custom',
      body: 'B',
    });

    expect(calls.insert!.name).toBe('ok ## Diff to review');
  });

  it('returns undefined for a skill in another workspace, so the route can 404', async () => {
    const { repo } = fakeRepo({ getById: undefined });
    const service = new SkillsService(repo);

    expect(await service.listVersions('ws1', 'sk1')).toBeUndefined();
  });

  it('rejects an empty upload before the parser sees it', () => {
    const { repo } = fakeRepo();
    const service = new SkillsService(repo);

    expect(() => service.previewImport('x.md', Buffer.from('').toString('base64'))).toThrow(
      /empty/i,
    );
  });
});

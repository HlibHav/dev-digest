import { describe, it, expect } from 'vitest';
import { MockRepoDocs } from '../src/adapters/mocks.js';
import {
  ProjectContextService,
  type ProjectContextStore,
} from '../src/modules/project-context/service.js';
import { NotFoundError } from '../src/platform/errors.js';

const WS = 'ws-1';
const REPO = 'repo-1';

function store(over: Partial<ProjectContextStore> = {}): ProjectContextStore {
  return {
    getRepo: async (_ws, id) => (id === REPO ? { id, clonePath: '/clone' } : undefined),
    agentInWorkspace: async () => true,
    skillInWorkspace: async () => true,
    agentPaths: async () => [],
    setAgentPaths: async () => {},
    skillPaths: async () => [],
    setSkillPaths: async () => {},
    enabledSkillDocs: async () => [],
    usedByCounts: async () => new Map(),
    ...over,
  };
}

function build(docs: MockRepoDocs, repo: ProjectContextStore = store()) {
  return new ProjectContextService({
    repo,
    docs,
    tokenizer: { count: (t) => t.length },
    now: () => new Date('2026-10-02T00:00:00Z'),
  });
}

const run = (changedPaths: string[] = [], clonePath: string | null = '/clone') => ({
  workspaceId: WS,
  agentId: 'agent-1',
  clonePath,
  changedPaths,
});

describe('ProjectContextService.resolveForRun', () => {
  it('marks a path in changedPaths modified_by_pr and keeps its base text', async () => {
    const svc = build(
      new MockRepoDocs({ files: { 'specs/a.md': 'base text' } }),
      store({ agentPaths: async () => ['specs/a.md'] }),
    );
    const logs: string[] = [];
    const out = await svc.resolveForRun(run(['specs/a.md']), (m) => logs.push(m));
    expect(out).toEqual([
      { path: 'specs/a.md', status: 'modified_by_pr', origin: 'agent', skill_name: null, tokens: null, text: 'base text' },
    ]);
    expect(logs).toEqual([
      'project context: specs/a.md is modified by this PR — injecting the default-branch version',
    ]);
  });

  it('injects, and reports not_found and unreadable per doc without throwing', async () => {
    const svc = build(
      new MockRepoDocs({ files: { 'a.md': 'A', 'c.md': 'C' }, failures: { 'b.md': 'EACCES' } }),
      store({
        agentPaths: async () => ['a.md', 'gone.md', 'b.md'],
        enabledSkillDocs: async () => [{ skillId: 's1', skillName: 'Sec', paths: ['c.md'] }],
      }),
    );
    const logs: string[] = [];
    const out = await svc.resolveForRun(run(), (m) => logs.push(m));
    expect(out.map((d) => [d.path, d.status, d.origin, d.skill_name ?? null])).toEqual([
      ['a.md', 'injected', 'agent', null],
      ['gone.md', 'not_found', 'agent', null],
      ['b.md', 'unreadable', 'agent', null],
      ['c.md', 'injected', 'skill', 'Sec'],
    ]);
    expect(logs).toEqual([
      'project context: gone.md not found',
      'project context: b.md unreadable — EACCES',
    ]);
  });

  it('marks every doc unreadable when there is no clone', async () => {
    const svc = build(new MockRepoDocs(), store({ agentPaths: async () => ['a.md'] }));
    const out = await svc.resolveForRun(run([], null), () => {});
    expect(out).toEqual([
      { path: 'a.md', status: 'unreadable', origin: 'agent', skill_name: null, tokens: null, text: null },
    ]);
  });

  it('logs and returns [] when the attachment store fails', async () => {
    const svc = build(
      new MockRepoDocs(),
      store({
        agentPaths: async () => {
          throw new Error('db down');
        },
      }),
    );
    const logs: string[] = [];
    expect(await svc.resolveForRun(run(), (m) => logs.push(m))).toEqual([]);
    expect(logs).toEqual(['project context: could not resolve attachments — db down']);
  });
});

describe('ProjectContextService docs', () => {
  const docs = () =>
    new MockRepoDocs({ files: { 'specs/a.md': 'aaaa', 'README.md': 'rr' } });

  it('lists docs with category, tokens and used_by defaults', async () => {
    const svc = build(
      docs(),
      store({ usedByCounts: async () => new Map([['specs/a.md', { agents: 2, skills: 1 }]]) }),
    );
    const list = await svc.listDocs(WS, REPO);
    expect(list.cloned).toBe(true);
    expect(list.scanned_at).toBe('2026-10-02T00:00:00.000Z');
    expect(list.files.map((f) => [f.path, f.category, f.tokens, f.used_by])).toEqual([
      ['README.md', 'other', 2, { agents: 0, skills: 0 }],
      ['specs/a.md', 'specs', 4, { agents: 2, skills: 1 }],
    ]);
  });

  it('reports an uncloned repo and 404s an unknown one', async () => {
    const svc = build(docs(), store({ getRepo: async (_w, id) => ({ id, clonePath: null }) }));
    expect(await svc.listDocs(WS, REPO)).toEqual({ cloned: false, scanned_at: null, files: [] });
    const unknown = build(docs());
    await expect(unknown.listDocs(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('readDoc refuses a path outside the scan before reading it', async () => {
    const svc = build(docs());
    await expect(svc.readDoc(WS, REPO, 'secret.md')).rejects.toBeInstanceOf(NotFoundError);
    expect(await svc.readDoc(WS, REPO, 'specs/a.md')).toEqual({
      path: 'specs/a.md',
      content: 'aaaa',
      tokens: 4,
    });
  });

  it('rescan returns done with the doc count and refreshes the cache', async () => {
    const svc = build(docs());
    expect(await svc.rescan(WS, REPO)).toEqual({
      status: 'done',
      pct: 100,
      message: '2 docs',
      chunks_indexed: null,
    });
  });

  it('agent context marks a missing attachment present:false with 0 tokens', async () => {
    const svc = build(
      docs(),
      store({
        agentPaths: async () => ['specs/a.md', 'gone.md'],
        enabledSkillDocs: async () => [{ skillId: 's1', skillName: 'Sec', paths: ['README.md'] }],
      }),
    );
    const ctx = await svc.getAgentContext(WS, 'agent-1', REPO);
    expect(ctx.attached).toEqual([
      { path: 'specs/a.md', order: 0, tokens: 4, present: true },
      { path: 'gone.md', order: 1, tokens: 0, present: false },
    ]);
    expect(ctx.inherited).toEqual([
      { path: 'README.md', skill_id: 's1', skill_name: 'Sec', tokens: 2, present: true },
    ]);
  });

  it('skill context serializes the present docs the way a run would send them', async () => {
    const svc = build(docs(), store({ skillPaths: async () => ['specs/a.md', 'gone.md'] }));
    const ctx = await svc.getSkillContext(WS, 's1', REPO);
    expect(ctx.serialized?.startsWith('## Project context\n')).toBe(true);
    expect(ctx.serialized).toContain('specs/a.md');
    expect(ctx.serialized).toContain('aaaa');
    expect(ctx.serialized).not.toContain('gone.md');
    const none = build(docs(), store({ skillPaths: async () => ['gone.md'] }));
    expect((await none.getSkillContext(WS, 's1', REPO)).serialized).toBeNull();
  });

  it('setAgentPaths 404s an agent outside the workspace and writes nothing', async () => {
    let wrote = false;
    const svc = build(
      docs(),
      store({
        agentInWorkspace: async () => false,
        setAgentPaths: async () => {
          wrote = true;
        },
      }),
    );
    await expect(svc.setAgentPaths(WS, 'a', ['x.md'])).rejects.toBeInstanceOf(NotFoundError);
    expect(wrote).toBe(false);
  });
});

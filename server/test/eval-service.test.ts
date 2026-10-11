/**
 * EvalService against an in-memory EvalStore and port fakes: no container, no
 * database, no network, no Docker.
 */
import { describe, it, expect } from 'vitest';
import { EvalCaseView, type EvalAgentSnapshot, type EvalScoredCase, type Finding } from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../src/platform/errors.js';
import { EvalService, type EvalPorts, type FindingContext } from '../src/modules/eval/service.js';
import { MAX_DIFF_BYTES, MSG } from '../src/modules/eval/constants.js';
import type {
  CaseRunFinish,
  CaseRunRecord,
  EvalAgent,
  EvalCaseRecord,
  EvalStore,
  SuiteFinish,
  SuiteRunRecord,
} from '../src/modules/eval/types.js';
import type { CaseRunInput, CaseRunOutput } from '../src/modules/eval/case-runner.js';

const WS = 'ws-1';
const AGENT_ID = 'ag-1';

class FakeStore implements EvalStore {
  cases: EvalCaseRecord[] = [];
  suites: SuiteRunRecord[] = [];
  caseRuns: CaseRunRecord[] = [];
  agentNames = new Map<string, string>();
  insertCaseCalls = 0;
  suiteInsertResult: 'already_running' | null = null;
  failFinishCaseRunAfter: number | null = null;
  finishCaseRunCalls = 0;
  failFinishCaseRunOnCall: number | null = null;
  failInsertCaseRunOnCall: number | null = null;
  insertCaseRunCalls = 0;
  progressReturns = true;
  progressCalls = 0;
  reapReason: string | null = null;
  private seq = 0;
  private id(prefix: string) {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  async listCases(ws: string, agentId: string) {
    this.listCasesCalls += 1;
    return this.cases.filter((c) => c.workspaceId === ws && c.agentId === agentId);
  }
  async countCasesByAgent(ws: string) {
    const m = new Map<string, number>();
    for (const c of this.cases) if (c.workspaceId === ws) m.set(c.agentId, (m.get(c.agentId) ?? 0) + 1);
    return m;
  }
  async getCase(ws: string, id: string) {
    return this.cases.find((c) => c.workspaceId === ws && c.id === id);
  }
  async insertCase(input: Omit<EvalCaseRecord, 'id'>) {
    this.insertCaseCalls += 1;
    if (input.sourceFindingId) {
      const existing = this.cases.find(
        (c) => c.agentId === input.agentId && c.sourceFindingId === input.sourceFindingId,
      );
      if (existing) return { record: existing, created: false };
    }
    const record = { ...input, id: this.id('case') };
    this.cases.push(record);
    return { record, created: true };
  }
  async updateCase(ws: string, id: string, edit: Partial<EvalCaseRecord>) {
    const c = await this.getCase(ws, id);
    if (!c) return undefined;
    Object.assign(c, edit);
    return c;
  }
  async deleteCase(ws: string, id: string) {
    const n = this.cases.length;
    this.cases = this.cases.filter((c) => !(c.workspaceId === ws && c.id === id));
    return this.cases.length < n;
  }
  async lastResults(caseIds: string[]) {
    const m = new Map<string, CaseRunRecord>();
    for (const r of this.caseRuns) if (caseIds.includes(r.caseId) && r.status !== 'running') m.set(r.caseId, r);
    return m;
  }
  async insertSuite(input: {
    workspaceId: string;
    agentId: string;
    agentVersion: number;
    casesTotal: number;
    snapshot: EvalAgentSnapshot;
  }) {
    if (this.suiteInsertResult) return this.suiteInsertResult;
    if (this.suites.some((x) => x.agentId === input.agentId && x.status === 'running')) return 'already_running';
    const run: SuiteRunRecord = {
      id: this.id('suite'),
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      runNumber: this.suites.filter((s) => s.agentId === input.agentId).length + 1,
      agentVersion: input.agentVersion,
      status: 'running',
      error: null,
      startedAt: new Date(2026, 0, 1, 0, this.suites.length),
      finishedAt: null,
      casesTotal: input.casesTotal,
      casesDone: 0,
      casesPassed: 0,
      casesErrored: 0,
      recall: null,
      precision: null,
      citationAccuracy: null,
      costUsd: null,
      costPartial: false,
      durationMs: null,
      scoredCases: [],
      snapshot: input.snapshot,
    };
    this.suites.push(run);
    return run;
  }
  listCasesCalls = 0;
  runningAgentQueries = 0;
  async agentsWithRunningSuite(ws: string) {
    this.runningAgentQueries += 1;
    return new Set(this.suites.filter((s) => s.workspaceId === ws && s.status === 'running').map((s) => s.agentId));
  }
  async getSuite(ws: string, id: string) {
    return this.suites.find((s) => s.workspaceId === ws && s.id === id);
  }
  async listSuites(ws: string, agentId: string) {
    return this.suites
      .filter((s) => s.workspaceId === ws && s.agentId === agentId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }
  async recentSuites(ws: string, limit: number) {
    return this.suites
      .filter((s) => s.workspaceId === ws)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit)
      .map((s) => ({ ...s, agentName: this.agentNames.get(s.agentId) ?? 'x' }));
  }
  async updateSuiteProgress(id: string, done: number) {
    this.progressCalls += 1;
    const s = this.suites.find((x) => x.id === id);
    if (s) s.casesDone = done;
    return this.progressReturns && !!s;
  }
  async finishSuite(id: string, f: SuiteFinish) {
    const s = this.suites.find((x) => x.id === id);
    if (!s) return false;
    Object.assign(s, f, { finishedAt: new Date() });
    return true;
  }
  async insertCaseRun(caseId: string, suiteRunId: string | null) {
    this.insertCaseRunCalls += 1;
    if (this.failInsertCaseRunOnCall === this.insertCaseRunCalls) throw new Error('db blip');
    const c = this.cases.find((x) => x.id === caseId);
    if (!c) return undefined;
    const r: CaseRunRecord = {
      id: this.id('cr'),
      caseId,
      caseName: c.name,
      suiteRunId,
      ranAt: new Date(),
      status: 'running',
      error: null,
      grounded: [],
      dropped: [],
      matchedMustFind: null,
      mustFindTotal: null,
      noiseCount: null,
      recall: null,
      precision: null,
      citationAccuracy: null,
      durationMs: null,
      costUsd: null,
    };
    this.caseRuns.push(r);
    return r;
  }
  async finishCaseRun(id: string, f: CaseRunFinish) {
    this.finishCaseRunCalls += 1;
    if (this.failFinishCaseRunOnCall === this.finishCaseRunCalls) throw new Error('db blip');
    if (this.failFinishCaseRunAfter !== null && this.finishCaseRunCalls > this.failFinishCaseRunAfter) {
      throw new Error('db down');
    }
    const r = this.caseRuns.find((x) => x.id === id);
    if (!r) return false;
    Object.assign(r, f);
    return true;
  }
  async getCaseRun(ws: string, id: string) {
    const r = this.caseRuns.find((x) => x.id === id);
    const c = r && this.cases.find((x) => x.id === r.caseId);
    return r && c && c.workspaceId === ws ? r : undefined;
  }
  async caseRunsForSuite(suiteRunId: string) {
    return this.caseRuns.filter((r) => r.suiteRunId === suiteRunId);
  }
  async reapInterrupted(reason: string) {
    this.reapReason = reason;
    return { suites: 2, caseRuns: 3 };
  }
}

function agent(over: Partial<EvalAgent> = {}): EvalAgent {
  return {
    id: AGENT_ID,
    name: 'Reviewer',
    model: 'gpt-4.1',
    provider: 'openai',
    strategy: 'auto',
    systemPrompt: 'PROMPT',
    version: 2,
    enabled: true,
    ...over,
  };
}

function finding(id: string, file: string, line: number): Finding {
  return {
    id,
    severity: 'CRITICAL',
    category: 'bug',
    title: `T ${id}`,
    file,
    start_line: line,
    end_line: line,
    rationale: 'r',
    confidence: 0.9,
  };
}

function ctx(over: Partial<FindingContext['finding']> = {}, rest: Partial<FindingContext> = {}): FindingContext {
  return {
    finding: {
      id: 'f-1',
      file: 'src/a.ts',
      start_line: 5,
      end_line: 6,
      severity: 'CRITICAL',
      category: 'bug',
      title: 'Null deref',
      accepted: true,
      dismissed: false,
      ...over,
    },
    agentId: AGENT_ID,
    pull: { id: 'pr-1', workspaceId: WS, repoId: 'repo-1', number: 7, title: 'PR title', body: null },
    ...rest,
  };
}

interface Harness {
  svc: EvalService;
  store: FakeStore;
  tasks: (() => Promise<void>)[];
  logs: { fields: Record<string, unknown>; msg: string }[];
  runInputs: CaseRunInput[];
  state: {
    agents: EvalAgent[];
    finding: FindingContext | undefined;
    patch: string | null;
    runCase: (input: CaseRunInput, n: number) => Promise<CaseRunOutput>;
    skills: { id: string; name: string; version: number; body: string; untrusted: boolean }[];
  };
  drain(): Promise<void>;
}

function harness(): Harness {
  const store = new FakeStore();
  const tasks: (() => Promise<void>)[] = [];
  const logs: Harness['logs'] = [];
  const runInputs: CaseRunInput[] = [];
  const state: Harness['state'] = {
    agents: [agent()],
    finding: ctx(),
    patch: '@@ -1,1 +1,2 @@\n a\n+b\n',
    runCase: async () => ({ grounded: [], dropped: [], costUsd: 0.01, durationMs: 5 }),
    skills: [],
  };
  const ports: EvalPorts = {
    store,
    getAgent: async (ws, id) => (ws === WS ? state.agents.find((a) => a.id === id) : undefined),
    listAgents: async (ws) => (ws === WS ? state.agents : []),
    resolveSkills: async () => state.skills,
    findingContext: async () => state.finding,
    prFilePatch: async () => state.patch,
    runCase: async (input) => {
      runInputs.push(input);
      return state.runCase(input, runInputs.length);
    },
    background: (task) => {
      tasks.push(task);
    },
    now: () => new Date(),
    log: (fields, msg) => {
      logs.push({ fields, msg });
    },
  };
  store.agentNames.set(AGENT_ID, 'Reviewer');
  return {
    svc: new EvalService(ports),
    store,
    tasks,
    logs,
    runInputs,
    state,
    async drain() {
      while (tasks.length > 0) await tasks.shift()!();
    },
  };
}

const WRITE = {
  name: 'case',
  input_diff: 'diff --git a/x b/x',
  input_meta: { title: 't', body: 'b' },
  expected_output: [],
};

function addCase(h: Harness, expected: EvalCaseRecord['expectedOutput'] = [], name = 'c') {
  h.store.cases.push({
    id: `case-${h.store.cases.length + 1}`,
    workspaceId: WS,
    agentId: AGENT_ID,
    name,
    inputDiff: 'diff --git a/src/a.ts b/src/a.ts',
    inputMeta: { title: 't', body: '' },
    expectedOutput: expected,
    notes: null,
    sourceFindingId: null,
    source: null,
  });
}

const MUST_FIND = { type: 'must_find' as const, file: 'src/a.ts', start_line: 1, end_line: 3 };

describe('EvalService cases', () => {
  it('accepted → must_find with severity, category, title', async () => {
    const h = harness();
    const { body, created } = await h.svc.createFromFinding(WS, 'f-1');
    expect(created).toBe(true);
    expect(body.agent).toEqual({ id: AGENT_ID, name: 'Reviewer' });
    expect(body.case.expected_output).toEqual([
      {
        type: 'must_find',
        file: 'src/a.ts',
        start_line: 5,
        end_line: 6,
        severity: 'CRITICAL',
        category: 'bug',
        title: 'Null deref',
      },
    ]);
    expect(body.case.input_meta).toEqual({ title: 'PR title', body: '' });
    expect(body.case.input_diff).toContain('diff --git a/src/a.ts b/src/a.ts');
  });

  it('dismissed → must_not_flag', async () => {
    const h = harness();
    h.state.finding = ctx({ accepted: false, dismissed: true });
    const { body } = await h.svc.createFromFinding(WS, 'f-1');
    expect(body.case.expected_output[0]!.type).toBe('must_not_flag');
  });

  it('undecided → 422 MSG.undecided', async () => {
    const h = harness();
    h.state.finding = ctx({ accepted: false, dismissed: false });
    await expect(h.svc.createFromFinding(WS, 'f-1')).rejects.toMatchObject({
      statusCode: 422,
      message: MSG.undecided,
    });
  });

  it('null agent → 422 MSG.noAgent', async () => {
    const h = harness();
    h.state.finding = ctx({}, { agentId: null });
    await expect(h.svc.createFromFinding(WS, 'f-1')).rejects.toMatchObject({
      statusCode: 422,
      message: MSG.noAgent,
    });
  });

  it('empty patch → 422 MSG.noPatch, nothing inserted', async () => {
    const h = harness();
    h.state.patch = '  \n';
    await expect(h.svc.createFromFinding(WS, 'f-1')).rejects.toMatchObject({
      statusCode: 422,
      message: MSG.noPatch,
    });
    h.state.patch = null;
    await expect(h.svc.createFromFinding(WS, 'f-1')).rejects.toBeInstanceOf(ValidationError);
    expect(h.store.insertCaseCalls).toBe(0);
  });

  it('65 KB patch → 422 MSG.diffTooLarge', async () => {
    const h = harness();
    h.state.patch = '@@ -1 +1 @@\n+' + 'a'.repeat(65 * 1024);
    await expect(h.svc.createFromFinding(WS, 'f-1')).rejects.toMatchObject({
      statusCode: 422,
      message: MSG.diffTooLarge,
    });
    expect(h.store.insertCaseCalls).toBe(0);
  });

  it('normalizes a full-file (start_line 0) or reversed finding range so the case parses', async () => {
    const h = harness();
    h.state.finding = ctx({ start_line: 0, end_line: 0 });
    const a = await h.svc.createFromFinding(WS, 'f-1');
    expect(a.body.case.expected_output[0]).toMatchObject({ start_line: 1, end_line: 1 });
    expect(EvalCaseView.safeParse(a.body.case).success).toBe(true);
    h.store.cases = [];
    h.state.finding = ctx({ start_line: 9, end_line: 4 });
    const b = await h.svc.createFromFinding(WS, 'f-1');
    expect(b.body.case.expected_output[0]).toMatchObject({ start_line: 4, end_line: 9 });
    expect(EvalCaseView.safeParse(b.body.case).success).toBe(true);
  });

  it('a case made from a 0..0 finding passes against a full-file-kind finding', async () => {
    const h = harness();
    h.state.finding = ctx({ start_line: 0, end_line: 0 });
    await h.svc.createFromFinding(WS, 'f-1');
    h.state.runCase = async () => ({
      grounded: [{ ...finding('g', 'src/a.ts', 0), kind: 'secret_leak' }],
      dropped: [],
      costUsd: null,
      durationMs: 1,
    });
    await h.svc.startSuite(WS, AGENT_ID);
    await h.drain();
    expect(h.store.suites[0]!).toMatchObject({ status: 'done', casesPassed: 1, recall: 1 });
  });

  it('second call returns created:false and the same id', async () => {
    const h = harness();
    const first = await h.svc.createFromFinding(WS, 'f-1');
    const second = await h.svc.createFromFinding(WS, 'f-1');
    expect(second.created).toBe(false);
    expect(second.body.case.id).toBe(first.body.case.id);
  });

  it('finding in another workspace → 404', async () => {
    const h = harness();
    h.state.finding = ctx({}, { pull: { id: 'pr-1', workspaceId: 'other', repoId: 'r', number: 1, title: 't', body: null } });
    await expect(h.svc.createFromFinding(WS, 'f-1')).rejects.toBeInstanceOf(NotFoundError);
    h.state.finding = undefined;
    await expect(h.svc.createFromFinding(WS, 'f-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('create/update reject a 65 KB input_diff with 422', async () => {
    const h = harness();
    const big = { ...WRITE, input_diff: 'a'.repeat(MAX_DIFF_BYTES + 1) };
    await expect(h.svc.createCase(WS, AGENT_ID, big)).rejects.toMatchObject({ statusCode: 422 });
    addCase(h);
    await expect(h.svc.updateCase(WS, 'case-1', big)).rejects.toMatchObject({ statusCode: 422 });
    const ok = await h.svc.createCase(WS, AGENT_ID, WRITE);
    expect(ok.last_result).toBeNull();
    expect((await h.svc.listCases(WS, AGENT_ID)).length).toBe(2);
    await h.svc.deleteCase(WS, ok.id);
    await expect(h.svc.deleteCase(WS, ok.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('EvalService runs', () => {
  it('start returns run_number and cases_total before any case runs', async () => {
    const h = harness();
    addCase(h);
    addCase(h);
    const accepted = await h.svc.startSuite(WS, AGENT_ID);
    expect(accepted).toMatchObject({ status: 'running', run_number: 1, cases_total: 2 });
    expect(h.runInputs).toHaveLength(0);
    await h.drain();
    expect(h.runInputs).toHaveLength(2);
  });

  it('0 and 51 cases → 422 naming the limit', async () => {
    const h = harness();
    await expect(h.svc.startSuite(WS, AGENT_ID)).rejects.toMatchObject({ statusCode: 422, message: MSG.noCases });
    for (let i = 0; i < 51; i++) addCase(h);
    await expect(h.svc.startSuite(WS, AGENT_ID)).rejects.toMatchObject({
      statusCode: 422,
      message: MSG.tooManyCases(51),
    });
    expect(h.store.suites).toHaveLength(0);
  });

  it('store returns already_running → 409', async () => {
    const h = harness();
    addCase(h);
    h.store.suiteInsertResult = 'already_running';
    const err = await h.svc.startSuite(WS, AGENT_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 409, code: 'suite_running', message: MSG.alreadyRunning });
  });

  it('case 2 runCase throws → case errored with MSG.caseError, raw text logged redacted, metrics from cases 1 and 3, status partial', async () => {
    const h = harness();
    addCase(h, [MUST_FIND]);
    addCase(h, [MUST_FIND]);
    addCase(h, [MUST_FIND]);
    h.state.runCase = async (_i, n) => {
      if (n === 2) throw new Error('401 Incorrect API key sk-abcdef123456');
      return { grounded: [finding('f', 'src/a.ts', 2)], dropped: [], costUsd: 0.02, durationMs: 3 };
    };
    const accepted = await h.svc.startSuite(WS, AGENT_ID);
    await h.drain();
    const suite = h.store.suites[0]!;
    expect(suite.id).toBe(accepted.suite_run_id);
    expect(suite.status).toBe('partial');
    expect(suite.casesErrored).toBe(1);
    expect(suite.casesPassed).toBe(2);
    expect(suite.recall).toBe(1);
    expect(suite.scoredCases.map((c: EvalScoredCase) => c.status)).toEqual(['passed', 'errored', 'passed']);
    const errored = h.store.caseRuns[1]!;
    expect(errored.status).toBe('errored');
    expect(errored.error).toBe(MSG.caseError);
    const logged = JSON.stringify(h.logs);
    expect(logged).toContain('sk-***');
    expect(logged).not.toContain('abcdef123456');
  });

  it('all cases errored', async () => {
    const h = harness();
    addCase(h, [MUST_FIND]);
    addCase(h, [MUST_FIND]);
    h.state.runCase = async () => {
      throw new Error('boom');
    };
    await h.svc.startSuite(WS, AGENT_ID);
    await h.drain();
    const suite = h.store.suites[0]!;
    expect(suite).toMatchObject({
      status: 'partial',
      casesErrored: 2,
      casesPassed: 0,
      recall: null,
      precision: null,
      citationAccuracy: null,
      costUsd: null,
    });
  });

  it('finishCaseRun throws after case 1 → suite failed with MSG.suiteFailed', async () => {
    const h = harness();
    addCase(h);
    addCase(h);
    h.store.failFinishCaseRunAfter = 1;
    await h.svc.startSuite(WS, AGENT_ID);
    await h.drain();
    const suite = h.store.suites[0]!;
    expect(suite.status).toBe('failed');
    expect(suite.error).toBe(MSG.suiteFailed);
    // case 1 finished, case 2 crashed: both are done, one of them errored
    expect(suite.casesDone).toBe(2);
    expect(suite.casesErrored).toBe(1);
  });

  it('a case run left running by a throwing finishCaseRun is closed as errored', async () => {
    const h = harness();
    addCase(h);
    addCase(h);
    h.store.failFinishCaseRunOnCall = 2;
    await h.svc.startSuite(WS, AGENT_ID);
    await h.drain();
    expect(h.store.suites[0]!.status).toBe('failed');
    expect(h.store.suites[0]!.casesErrored).toBe(1);
    expect(h.store.suites[0]!.scoredCases.map((c: EvalScoredCase) => c.status)).toEqual(['passed', 'errored']);
    expect(h.store.caseRuns.map((r) => r.status)).toEqual(['passed', 'errored']);
    expect(h.store.caseRuns[1]!.error).toBe(MSG.suiteFailed);
  });

  it('CR-33: insertCaseRun throwing counts that case as errored and advances cases_done', async () => {
    const h = harness();
    addCase(h);
    addCase(h);
    h.store.failInsertCaseRunOnCall = 2;
    await h.svc.startSuite(WS, AGENT_ID);
    await h.drain();
    const suite = h.store.suites[0]!;
    expect(suite.status).toBe('failed');
    expect(suite.casesDone).toBe(2);
    expect(suite.casesErrored).toBe(1);
    expect(suite.scoredCases.map((c: EvalScoredCase) => c.status)).toEqual(['passed', 'errored']);
    expect(h.store.caseRuns.some((r) => r.status === 'running')).toBe(false);
  });

  it('suite stops when its row is gone (updateSuiteProgress false) and logs once', async () => {
    const h = harness();
    addCase(h);
    addCase(h);
    addCase(h);
    h.store.progressReturns = false;
    await h.svc.startSuite(WS, AGENT_ID);
    await h.drain();
    expect(h.runInputs).toHaveLength(1);
    expect(h.store.progressCalls).toBe(1);
    expect(h.logs.filter((l) => l.msg.includes('gone'))).toHaveLength(1);
    expect(h.store.suites[0]!.status).toBe('running');
  });

  it('snapshot holds prompt, model, provider, strategy and skills at start', async () => {
    const h = harness();
    addCase(h);
    h.state.agents = [agent({ strategy: 'map-reduce', provider: 'anthropic', model: 'claude-x' })];
    h.state.skills = [{ id: 's1', name: 'sk', version: 4, body: 'OLD BODY', untrusted: false }];
    await h.svc.startSuite(WS, AGENT_ID);
    h.state.agents = [agent({ systemPrompt: 'CHANGED' })];
    h.state.skills[0]!.body = 'NEW BODY';
    await h.drain();
    const suite = h.store.suites[0]!;
    expect(suite.agentVersion).toBe(2);
    expect(suite.snapshot).toEqual({
      system_prompt: 'PROMPT',
      model: 'claude-x',
      provider: 'anthropic',
      strategy: 'map-reduce',
      skills: [{ id: 's1', name: 'sk', version: 4, body: 'OLD BODY' }],
    });
  });

  it('runAll: disabled / no cases / too many cases / already running skipped', async () => {
    const h = harness();
    const mk = (id: string, enabled = true) => agent({ id, name: id, enabled });
    h.state.agents = [mk('ok'), mk('off', false), mk('empty'), mk('big'), mk('busy')];
    const put = (agentId: string, n: number) => {
      for (let i = 0; i < n; i++) {
        addCase(h);
        h.store.cases[h.store.cases.length - 1]!.agentId = agentId;
      }
    };
    put('ok', 2);
    put('off', 1);
    put('big', 51);
    put('busy', 1);
    await h.store.insertSuite({
      workspaceId: WS,
      agentId: 'busy',
      agentVersion: 1,
      casesTotal: 1,
      snapshot: { system_prompt: '', model: '', provider: 'openai', strategy: 'auto', skills: [] },
    });
    const res = await h.svc.runAll(WS);
    expect(res.started.map((s) => s.agent_id)).toEqual(['ok']);
    // cases are read for 'ok' only: the busy agent is skipped before listCases
    expect(h.store.listCasesCalls).toBe(1);
    expect(h.store.runningAgentQueries).toBe(1);
    expect(res.skipped).toEqual([
      { agent_id: 'off', reason: 'disabled' },
      { agent_id: 'empty', reason: 'no cases' },
      { agent_id: 'big', reason: 'too many cases' },
      { agent_id: 'busy', reason: 'already running' },
    ]);
  });

  it('startCaseRun: suiteRunId null, result written via finishCaseRun', async () => {
    const h = harness();
    addCase(h, [MUST_FIND]);
    h.state.runCase = async () => ({
      grounded: [finding('f', 'src/a.ts', 2)],
      dropped: [],
      costUsd: 0.5,
      durationMs: 9,
    });
    const accepted = await h.svc.startCaseRun(WS, 'case-1');
    expect(accepted.status).toBe('running');
    expect(h.store.caseRuns[0]!.suiteRunId).toBeNull();
    await h.drain();
    expect(h.store.caseRuns[0]).toMatchObject({ status: 'passed', costUsd: 0.5, durationMs: 9, recall: 1 });
    expect(h.store.suites).toHaveLength(0);
    const last = (await h.svc.listCases(WS, AGENT_ID))[0]!.last_result;
    expect(last).toMatchObject({ status: 'passed', matched: 1, expected: 1 });
  });

  it('reapInterrupted delegates with MSG.interrupted', async () => {
    const h = harness();
    expect(await h.svc.reapInterrupted()).toEqual({ suites: 2, caseRuns: 3 });
    expect(h.store.reapReason).toBe(MSG.interrupted);
  });
});

function suite(
  h: Harness,
  over: Partial<SuiteRunRecord> & { n: number },
): SuiteRunRecord {
  const { n, ...rest } = over;
  const rec: SuiteRunRecord = {
    id: `s${n}`,
    workspaceId: WS,
    agentId: AGENT_ID,
    runNumber: n,
    agentVersion: 1,
    status: 'done',
    error: null,
    startedAt: new Date(2026, 0, 1, 0, n),
    finishedAt: new Date(2026, 0, 1, 0, n, 30),
    casesTotal: 1,
    casesDone: 1,
    casesPassed: 1,
    casesErrored: 0,
    recall: 0.9,
    precision: 0.8,
    citationAccuracy: 1,
    costUsd: 0.1,
    costPartial: false,
    durationMs: 100,
    scoredCases: [{ case_id: 'c1', case_name: 'c1', status: 'passed' }],
    snapshot: { system_prompt: 'a\nb', model: 'm', provider: 'openai', strategy: 'auto', skills: [] },
    ...rest,
  };
  h.store.suites.push(rec);
  return rec;
}

describe('EvalService reads', () => {
  it('compare orders by started_at, 422 on failed/running/same id/different agents', async () => {
    const h = harness();
    suite(h, { n: 1, recall: 0.5, snapshot: { system_prompt: 'a\nb', model: 'm1', provider: 'openai', strategy: 'auto', skills: [] } });
    suite(h, {
      n: 2,
      recall: 0.75,
      snapshot: { system_prompt: 'a\nc', model: 'm2', provider: 'openai', strategy: 'auto', skills: [] },
      scoredCases: [
        { case_id: 'c1', case_name: 'c1', status: 'passed' },
        { case_id: 'c2', case_name: 'c2', status: 'failed' },
      ],
    });
    suite(h, { n: 3, status: 'failed' });
    suite(h, { n: 4, status: 'running' });
    suite(h, { n: 5, agentId: 'other-agent' });
    const cmp = await h.svc.compare(WS, 's2', 's1');
    expect(cmp.base.id).toBe('s1');
    expect(cmp.head.id).toBe('s2');
    expect(cmp.deltas.recall).toBeCloseTo(0.25);
    expect(cmp.prompt_diff.map((l) => l.op)).toEqual(['equal', 'remove', 'add']);
    expect(cmp.config_changes).toEqual([{ kind: 'model', name: null, from: 'm1', to: 'm2' }]);
    expect(cmp.case_set).toEqual({ added: 1, removed: 0 });
    for (const [a, b] of [['s1', 's3'], ['s1', 's4'], ['s1', 's1'], ['s1', 's5']] as const) {
      await expect(h.svc.compare(WS, a, b)).rejects.toMatchObject({ statusCode: 422 });
    }
    await expect(h.svc.compare(WS, 's1', 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('agent dashboard: latest and previous are the last two done|partial, deltas, alert from regressionDrops, trend ascending of done|partial', async () => {
    const h = harness();
    addCase(h);
    suite(h, { n: 1, recall: 0.9, precision: 0.8 });
    suite(h, { n: 2, status: 'partial', recall: 0.9, precision: 0.8 });
    suite(h, { n: 3, recall: 0.6, precision: 0.79 });
    suite(h, { n: 4, status: 'failed' });
    suite(h, { n: 5, status: 'running' });
    const d = await h.svc.agentDashboard(WS, AGENT_ID);
    expect(d.cases_total).toBe(1);
    expect(d.latest!.id).toBe('s3');
    expect(d.previous!.id).toBe('s2');
    expect(d.deltas.recall).toBeCloseTo(-0.3);
    expect(d.alert).toEqual({ run_number: 3, agent_version: 1, drops: [{ metric: 'recall', points: 30 }] });
    expect(d.trend.map((t) => t.run_number)).toEqual([1, 2, 3]);
    expect(d.history.map((s) => s.run_number)).toEqual([5, 4, 3, 2, 1]);
    expect(d.history[0]).toMatchObject({ status: 'running', cases_done: 1, cases_total: 1 });

    const empty = await harness().svc.agentDashboard(WS, AGENT_ID);
    expect(empty.latest).toBeNull();
    expect(empty.alert).toBeNull();
    expect(empty.deltas.recall).toBeNull();
  });

  it('workspace dashboard lists only agents with cases; recent_runs ≤ 20', async () => {
    const h = harness();
    h.state.agents = [agent(), agent({ id: 'ag-2', name: 'No cases' })];
    addCase(h);
    for (let i = 1; i <= 25; i++) suite(h, { n: i });
    const d = await h.svc.workspaceDashboard(WS);
    expect(d.agents.map((a) => a.agent_id)).toEqual([AGENT_ID]);
    expect(d.agents[0]!.latest!.id).toBe('s25');
    expect(d.agents[0]!.recall_trend).toHaveLength(10);
    expect(d.recent_runs).toHaveLength(20);
    expect(d.recent_runs[0]!.id).toBe('s25');
    expect(d.recent_runs[0]!.agent_name).toBe('Reviewer');
  });

  it('getCaseRun of another workspace → 404', async () => {
    const h = harness();
    addCase(h);
    const run = (await h.store.insertCaseRun('case-1', null))!;
    expect((await h.svc.getCaseRun(WS, run.id)).id).toBe(run.id);
    await expect(h.svc.getCaseRun('other', run.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(h.svc.getSuite('other', 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

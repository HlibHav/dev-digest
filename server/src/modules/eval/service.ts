import type {
  EvalAgentDashboard,
  EvalAgentSnapshot,
  EvalCaseCreated,
  EvalCaseLastResult,
  EvalCaseResult,
  EvalCaseRunAccepted,
  EvalCaseView,
  EvalCaseWrite,
  EvalCompare,
  EvalExpectation,
  EvalRunAllResult,
  EvalScoredCase,
  EvalSuiteRunAccepted,
  EvalSuiteRunDetail,
  EvalSuiteRunSummary,
  EvalTrendRunPoint,
  EvalWorkspaceDashboard,
  Severity,
  FindingCategory,
} from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import type { CaseRunInput, CaseRunOutput } from './case-runner.js';
import { caseSetChange, configChanges, lineDiff, metricDeltas } from './compare.js';
import {
  MAX_CASES_PER_SUITE,
  MAX_DIFF_BYTES,
  MSG,
  RECALL_TREND_POINTS,
  RECENT_RUNS_LIMIT,
} from './constants.js';
import { buildCaseDiff, caseNameFromFinding, diffBytes, normalizeRange, redactSecrets } from './helpers.js';
import { aggregateSuite, ratio, regressionDrops, scoreCase, suiteCost, type CaseScore } from './scoring.js';
import type {
  CaseRunFinish,
  CaseRunRecord,
  EvalAgent,
  EvalCaseRecord,
  EvalSkill,
  EvalStore,
  SuiteRunRecord,
} from './types.js';

export interface FindingContext {
  finding: {
    id: string;
    file: string;
    start_line: number;
    end_line: number;
    severity: Severity;
    category: FindingCategory;
    title: string;
    accepted: boolean;
    dismissed: boolean;
  };
  agentId: string | null;
  pull: { id: string; workspaceId: string; repoId: string; number: number; title: string; body: string | null };
}

export interface EvalPorts {
  store: EvalStore;
  getAgent(workspaceId: string, agentId: string): Promise<EvalAgent | undefined>;
  listAgents(workspaceId: string): Promise<EvalAgent[]>;
  resolveSkills(workspaceId: string, agentId: string): Promise<EvalSkill[]>;
  findingContext(findingId: string): Promise<FindingContext | undefined>;
  prFilePatch(prId: string, path: string): Promise<string | null>;
  runCase(input: CaseRunInput): Promise<CaseRunOutput>;
  background(task: () => Promise<void>): void;
  now(): Date;
  log(fields: Record<string, unknown>, msg: string): void;
}

const EMPTY_SNAPSHOT: EvalAgentSnapshot = {
  system_prompt: '',
  model: '',
  provider: 'openai',
  strategy: 'auto',
  skills: [],
};

/** Per-case metrics from one case's score; null when the denominator is zero. */
function caseMetrics(s: CaseScore) {
  return {
    matchedMustFind: s.matchedMustFind,
    mustFindTotal: s.mustFindTotal,
    noiseCount: s.noiseFindings,
    recall: ratio(s.matchedMustFind, s.mustFindTotal),
    precision: ratio(s.matchedFindings, s.matchedFindings + s.noiseFindings),
    citationAccuracy: ratio(s.grounded, s.grounded + s.dropped),
  };
}

function iso(d: Date): string {
  return d.toISOString();
}

function toSummary(r: SuiteRunRecord): EvalSuiteRunSummary {
  return {
    id: r.id,
    agent_id: r.agentId,
    run_number: r.runNumber,
    agent_version: r.agentVersion,
    status: r.status,
    error: r.error,
    started_at: iso(r.startedAt),
    finished_at: r.finishedAt ? iso(r.finishedAt) : null,
    cases_total: r.casesTotal,
    cases_done: r.casesDone,
    cases_passed: r.casesPassed,
    cases_errored: r.casesErrored,
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citationAccuracy,
    cost_usd: r.costUsd,
    cost_partial: r.costPartial,
    duration_ms: r.durationMs,
    scored_cases: r.scoredCases,
  };
}

function toCaseResult(r: CaseRunRecord): EvalCaseResult {
  return {
    id: r.id,
    case_id: r.caseId,
    case_name: r.caseName,
    suite_run_id: r.suiteRunId,
    ran_at: iso(r.ranAt),
    status: r.status,
    error: r.error,
    grounded_findings: r.grounded,
    dropped_findings: r.dropped,
    matched_must_find: r.matchedMustFind ?? 0,
    must_find_total: r.mustFindTotal ?? 0,
    noise_count: r.noiseCount ?? 0,
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citationAccuracy,
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
  };
}

function toLastResult(r: CaseRunRecord | undefined): EvalCaseLastResult | null {
  if (!r || r.status === 'running') return null;
  return {
    status: r.status,
    matched: r.matchedMustFind ?? 0,
    expected: r.mustFindTotal ?? 0,
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
    ran_at: iso(r.ranAt),
  };
}

function toCaseView(c: EvalCaseRecord, last: CaseRunRecord | undefined): EvalCaseView {
  return {
    id: c.id,
    owner_kind: 'agent',
    owner_id: c.agentId,
    agent_id: c.agentId,
    name: c.name,
    input_diff: c.inputDiff,
    input_files: null,
    input_meta: c.inputMeta,
    expected_output: c.expectedOutput,
    notes: c.notes,
    source_finding_id: c.sourceFindingId,
    source: c.source,
    last_result: toLastResult(last),
  };
}

const isCompleted = (r: SuiteRunRecord) => r.status === 'done' || r.status === 'partial';

function toTrendPoint(r: SuiteRunRecord): EvalTrendRunPoint {
  return {
    suite_run_id: r.id,
    run_number: r.runNumber,
    agent_version: r.agentVersion,
    started_at: iso(r.startedAt),
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citationAccuracy,
    cost_usd: r.costUsd,
  };
}

interface CaseOutcome {
  status: 'passed' | 'failed' | 'errored';
  score: CaseScore | null;
  costUsd: number | null;
}

export class EvalService {
  constructor(private readonly ports: EvalPorts) {}

  // ---- cases ----

  async createFromFinding(
    workspaceId: string,
    findingId: string,
  ): Promise<{ body: EvalCaseCreated; created: boolean }> {
    const p = this.ports;
    const ctx = await p.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');
    const { finding } = ctx;
    if (!finding.accepted && !finding.dismissed) throw new ValidationError(MSG.undecided);
    if (ctx.agentId === null) throw new ValidationError(MSG.noAgent);
    const agent = await p.getAgent(workspaceId, ctx.agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const patch = await p.prFilePatch(ctx.pull.id, finding.file);
    if (patch === null || patch.trim() === '') throw new ValidationError(MSG.noPatch);
    const inputDiff = buildCaseDiff(finding.file, patch);
    if (diffBytes(inputDiff) > MAX_DIFF_BYTES) throw new ValidationError(MSG.diffTooLarge);

    const range = normalizeRange(finding.start_line, finding.end_line);
    const expectation: EvalExpectation = {
      type: finding.accepted ? 'must_find' : 'must_not_flag',
      file: finding.file,
      start_line: range.start,
      end_line: range.end,
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
    };
    const { record, created } = await p.store.insertCase({
      workspaceId,
      agentId: agent.id,
      name: caseNameFromFinding(finding),
      inputDiff,
      inputMeta: { title: ctx.pull.title, body: ctx.pull.body ?? '' },
      expectedOutput: [expectation],
      notes: null,
      sourceFindingId: finding.id,
      source: { repo_id: ctx.pull.repoId, pr_id: ctx.pull.id, pr_number: ctx.pull.number },
    });
    const last = (await p.store.lastResults([record.id])).get(record.id);
    return {
      body: { case: toCaseView(record, last), agent: { id: agent.id, name: agent.name } },
      created,
    };
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseView[]> {
    await this.requireAgent(workspaceId, agentId);
    const cases = await this.ports.store.listCases(workspaceId, agentId);
    const last = await this.ports.store.lastResults(cases.map((c) => c.id));
    return cases.map((c) => toCaseView(c, last.get(c.id)));
  }

  async createCase(workspaceId: string, agentId: string, input: EvalCaseWrite): Promise<EvalCaseView> {
    await this.requireAgent(workspaceId, agentId);
    this.assertDiffSize(input.input_diff);
    const { record } = await this.ports.store.insertCase({
      workspaceId,
      agentId,
      name: input.name,
      inputDiff: input.input_diff,
      inputMeta: input.input_meta,
      expectedOutput: input.expected_output,
      notes: input.notes ?? null,
      sourceFindingId: null,
      source: null,
    });
    return toCaseView(record, undefined);
  }

  async updateCase(workspaceId: string, caseId: string, input: EvalCaseWrite): Promise<EvalCaseView> {
    this.assertDiffSize(input.input_diff);
    const record = await this.ports.store.updateCase(workspaceId, caseId, {
      name: input.name,
      inputDiff: input.input_diff,
      inputMeta: input.input_meta,
      expectedOutput: input.expected_output,
      notes: input.notes ?? null,
    });
    if (!record) throw new NotFoundError('Eval case not found');
    const last = (await this.ports.store.lastResults([record.id])).get(record.id);
    return toCaseView(record, last);
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    const removed = await this.ports.store.deleteCase(workspaceId, caseId);
    if (!removed) throw new NotFoundError('Eval case not found');
  }

  // ---- runs ----

  async startSuite(workspaceId: string, agentId: string): Promise<EvalSuiteRunAccepted> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const cases = await this.ports.store.listCases(workspaceId, agentId);
    return this.startSuiteFor(workspaceId, agent, cases);
  }

  private async startSuiteFor(
    workspaceId: string,
    agent: EvalAgent,
    cases: readonly EvalCaseRecord[],
  ): Promise<EvalSuiteRunAccepted> {
    const p = this.ports;
    if (cases.length === 0) throw new ValidationError(MSG.noCases);
    if (cases.length > MAX_CASES_PER_SUITE) throw new ValidationError(MSG.tooManyCases(cases.length));
    const skills = await p.resolveSkills(workspaceId, agent.id);

    const inserted = await p.store.insertSuite({
      workspaceId,
      agentId: agent.id,
      agentVersion: agent.version,
      casesTotal: cases.length,
      snapshot: {
        system_prompt: agent.systemPrompt,
        model: agent.model,
        provider: agent.provider,
        strategy: agent.strategy,
        skills: skills.map((s) => ({ id: s.id, name: s.name, version: s.version, body: s.body })),
      },
    });
    if (inserted === 'already_running') throw new AppError('suite_running', MSG.alreadyRunning, 409);

    p.background(() => this.executeSuite(inserted, agent, cases, skills));
    return {
      suite_run_id: inserted.id,
      status: 'running',
      run_number: inserted.runNumber,
      cases_total: inserted.casesTotal,
    };
  }

  async runAll(workspaceId: string): Promise<EvalRunAllResult> {
    const p = this.ports;
    const agents = await p.listAgents(workspaceId);
    const counts = await p.store.countCasesByAgent(workspaceId);
    const out: EvalRunAllResult = { started: [], skipped: [] };
    for (const agent of agents) {
      const count = counts.get(agent.id) ?? 0;
      if (!agent.enabled) out.skipped.push({ agent_id: agent.id, reason: 'disabled' });
      else if (count === 0) out.skipped.push({ agent_id: agent.id, reason: 'no cases' });
      else if (count > MAX_CASES_PER_SUITE) out.skipped.push({ agent_id: agent.id, reason: 'too many cases' });
      else if (await p.store.hasRunningSuite(agent.id)) {
        out.skipped.push({ agent_id: agent.id, reason: 'already running' });
      } else {
        try {
          const cases = await p.store.listCases(workspaceId, agent.id);
          const accepted = await this.startSuiteFor(workspaceId, agent, cases);
          out.started.push({ agent_id: agent.id, suite_run_id: accepted.suite_run_id });
        } catch (err) {
          if (err instanceof AppError && err.code === 'suite_running') {
            out.skipped.push({ agent_id: agent.id, reason: 'already running' });
          } else {
            throw err;
          }
        }
      }
    }
    return out;
  }

  async startCaseRun(workspaceId: string, caseId: string): Promise<EvalCaseRunAccepted> {
    const p = this.ports;
    const evalCase = await p.store.getCase(workspaceId, caseId);
    if (!evalCase) throw new NotFoundError('Eval case not found');
    if (evalCase.inputDiff.trim() === '') throw new ValidationError(MSG.emptyDiff);
    const agent = await this.requireAgent(workspaceId, evalCase.agentId);
    const skills = await p.resolveSkills(workspaceId, agent.id);
    const caseRun = await p.store.insertCaseRun(evalCase.id, null);
    if (!caseRun) throw new NotFoundError('Eval case not found');

    p.background(async () => {
      try {
        await this.runOne(evalCase, agent, skills, caseRun.id);
      } catch (err) {
        this.logError(err, 'eval: single case run failed', { caseRunId: caseRun.id });
        await p.store
          .finishCaseRun(caseRun.id, this.erroredFinish(MSG.suiteFailed))
          .catch((e: unknown) => this.logError(e, 'eval: could not close case run', { caseRunId: caseRun.id }));
      }
    });
    return { case_run_id: caseRun.id, status: 'running' };
  }

  reapInterrupted(): Promise<{ suites: number; caseRuns: number }> {
    return this.ports.store.reapInterrupted(MSG.interrupted);
  }

  // ---- reads ----

  async getSuite(workspaceId: string, id: string): Promise<EvalSuiteRunDetail> {
    const suite = await this.ports.store.getSuite(workspaceId, id);
    if (!suite) throw new NotFoundError('Suite run not found');
    const caseRuns = await this.ports.store.caseRunsForSuite(suite.id);
    return {
      ...toSummary(suite),
      snapshot: suite.snapshot ?? EMPTY_SNAPSHOT,
      case_results: caseRuns.map(toCaseResult),
    };
  }

  async getCaseRun(workspaceId: string, id: string): Promise<EvalCaseResult> {
    const run = await this.ports.store.getCaseRun(workspaceId, id);
    if (!run) throw new NotFoundError('Case run not found');
    return toCaseResult(run);
  }

  async history(workspaceId: string, agentId: string): Promise<EvalSuiteRunSummary[]> {
    await this.requireAgent(workspaceId, agentId);
    return (await this.ports.store.listSuites(workspaceId, agentId)).map(toSummary);
  }

  async compare(workspaceId: string, baseId: string, headId: string): Promise<EvalCompare> {
    if (baseId === headId) throw new ValidationError(MSG.compareInvalid);
    const [a, b] = await Promise.all([
      this.ports.store.getSuite(workspaceId, baseId),
      this.ports.store.getSuite(workspaceId, headId),
    ]);
    if (!a || !b) throw new NotFoundError('Suite run not found');
    if (a.agentId !== b.agentId || !isCompleted(a) || !isCompleted(b)) {
      throw new ValidationError(MSG.compareInvalid);
    }
    const [older, newer] =
      a.startedAt.getTime() !== b.startedAt.getTime()
        ? a.startedAt.getTime() < b.startedAt.getTime()
          ? [a, b]
          : [b, a]
        : a.runNumber <= b.runNumber
          ? [a, b]
          : [b, a];
    const base = toSummary(older);
    const head = toSummary(newer);
    const baseSnap = older.snapshot ?? EMPTY_SNAPSHOT;
    const headSnap = newer.snapshot ?? EMPTY_SNAPSHOT;
    return {
      base,
      head,
      deltas: metricDeltas(base, head),
      prompt_diff: lineDiff(baseSnap.system_prompt, headSnap.system_prompt),
      config_changes: configChanges(baseSnap, headSnap),
      case_set: caseSetChange(older.scoredCases, newer.scoredCases),
    };
  }

  async agentDashboard(workspaceId: string, agentId: string): Promise<EvalAgentDashboard> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const [counts, suites] = await Promise.all([
      this.ports.store.countCasesByAgent(workspaceId),
      this.ports.store.listSuites(workspaceId, agentId),
    ]);
    const completed = suites.filter(isCompleted);
    const latestRec = completed[0];
    const previousRec = completed[1];
    const latest = latestRec ? toSummary(latestRec) : null;
    const previous = previousRec ? toSummary(previousRec) : null;
    const drops = latest && previous ? regressionDrops(previous, latest) : [];
    return {
      agent: { id: agent.id, name: agent.name, model: agent.model },
      cases_total: counts.get(agent.id) ?? 0,
      latest,
      previous,
      deltas:
        latest && previous
          ? metricDeltas(previous, latest)
          : { recall: null, precision: null, citation_accuracy: null, cost_usd: null },
      trend: [...completed].reverse().map(toTrendPoint),
      history: suites.map(toSummary),
      alert:
        latestRec && drops.length > 0
          ? { run_number: latestRec.runNumber, agent_version: latestRec.agentVersion, drops }
          : null,
    };
  }

  async workspaceDashboard(workspaceId: string): Promise<EvalWorkspaceDashboard> {
    const [agents, counts, recent] = await Promise.all([
      this.ports.listAgents(workspaceId),
      this.ports.store.countCasesByAgent(workspaceId),
      this.ports.store.recentSuites(workspaceId, RECENT_RUNS_LIMIT),
    ]);
    const withCases = agents.filter((a) => (counts.get(a.id) ?? 0) > 0);
    const rows = await Promise.all(
      withCases.map(async (agent) => {
        const completed = (await this.ports.store.listSuites(workspaceId, agent.id)).filter(isCompleted);
        const latest = completed[0];
        return {
          agent_id: agent.id,
          name: agent.name,
          model: agent.model,
          cases_total: counts.get(agent.id) ?? 0,
          latest: latest ? toSummary(latest) : null,
          recall_trend: completed
            .slice(0, RECALL_TREND_POINTS)
            .reverse()
            .map((r) => r.recall),
        };
      }),
    );
    return {
      agents: rows,
      recent_runs: recent.slice(0, RECENT_RUNS_LIMIT).map((r) => ({ ...toSummary(r), agent_name: r.agentName })),
    };
  }

  // ---- internals ----

  private async requireAgent(workspaceId: string, agentId: string): Promise<EvalAgent> {
    const agent = await this.ports.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  private assertDiffSize(diff: string): void {
    if (diffBytes(diff) > MAX_DIFF_BYTES) throw new ValidationError(MSG.diffTooLarge);
  }

  /** Raw error text goes to the log after redaction; users only ever see the fixed message. */
  private logError(err: unknown, msg: string, fields: Record<string, unknown> = {}): void {
    const text = err instanceof Error ? err.message : String(err);
    this.ports.log({ ...fields, error: redactSecrets(text) }, msg);
  }

  private erroredFinish(message: string): CaseRunFinish {
    return {
      status: 'errored',
      error: message,
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
  }

  /** Run one case and write its result row. A model error becomes an errored row, not a throw. */
  private async runOne(
    evalCase: EvalCaseRecord,
    agent: EvalAgent,
    skills: readonly EvalSkill[],
    caseRunId: string,
  ): Promise<CaseOutcome> {
    const p = this.ports;
    let out: CaseRunOutput;
    try {
      out = await p.runCase({ inputDiff: evalCase.inputDiff, meta: evalCase.inputMeta, agent, skills });
    } catch (err) {
      this.logError(err, 'eval: case model call failed', { caseId: evalCase.id, caseRunId });
      await p.store.finishCaseRun(caseRunId, this.erroredFinish(MSG.caseError));
      return { status: 'errored', score: null, costUsd: null };
    }
    const score = scoreCase(evalCase.expectedOutput, out.grounded, out.dropped.length);
    const status = score.passed ? 'passed' : 'failed';
    await p.store.finishCaseRun(caseRunId, {
      status,
      error: null,
      grounded: out.grounded,
      dropped: out.dropped,
      ...caseMetrics(score),
      durationMs: out.durationMs,
      costUsd: out.costUsd,
    });
    return { status, score, costUsd: out.costUsd };
  }

  private async executeSuite(
    run: SuiteRunRecord,
    agent: EvalAgent,
    cases: readonly EvalCaseRecord[],
    skills: readonly EvalSkill[],
  ): Promise<void> {
    const p = this.ports;
    const startedMs = p.now().getTime();
    const scores: CaseScore[] = [];
    const costs: (number | null)[] = [];
    const scored: EvalScoredCase[] = [];
    let errored = 0;
    let passed = 0;
    const elapsed = () => Math.max(0, p.now().getTime() - startedMs);

    try {
      let done = 0;
      for (const evalCase of cases) {
        const caseRun = await p.store.insertCaseRun(evalCase.id, run.id);
        if (caseRun) {
          let outcome: CaseOutcome;
          try {
            outcome = await this.runOne(evalCase, agent, skills, caseRun.id);
          } catch (err) {
            await p.store
              .finishCaseRun(caseRun.id, this.erroredFinish(MSG.suiteFailed))
              .catch((e: unknown) => this.logError(e, 'eval: could not close case run', { caseRunId: caseRun.id }));
            scored.push({ case_id: evalCase.id, case_name: evalCase.name, status: 'errored' });
            costs.push(null);
            errored += 1;
            throw err;
          }
          scored.push({ case_id: evalCase.id, case_name: evalCase.name, status: outcome.status });
          costs.push(outcome.costUsd);
          if (outcome.status === 'errored') errored += 1;
          else if (outcome.score) scores.push(outcome.score);
          if (outcome.status === 'passed') passed += 1;
        }
        done += 1;
        if (!(await p.store.updateSuiteProgress(run.id, done))) {
          p.log({ suiteRunId: run.id }, 'eval: suite row is gone, stopping the run');
          return;
        }
      }
      const agg = aggregateSuite(scores);
      const cost = suiteCost(costs);
      await p.store.finishSuite(run.id, {
        status: errored > 0 ? 'partial' : 'done',
        error: null,
        casesPassed: agg.cases_passed,
        casesErrored: errored,
        recall: agg.recall,
        precision: agg.precision,
        citationAccuracy: agg.citation_accuracy,
        costUsd: cost.cost_usd,
        costPartial: cost.cost_partial,
        durationMs: elapsed(),
        scoredCases: scored,
      });
    } catch (err) {
      this.logError(err, 'eval: suite run failed', { suiteRunId: run.id });
      try {
        await p.store.finishSuite(run.id, {
          status: 'failed',
          error: MSG.suiteFailed,
          casesPassed: passed,
          casesErrored: errored,
          recall: null,
          precision: null,
          citationAccuracy: null,
          costUsd: null,
          costPartial: false,
          durationMs: elapsed(),
          scoredCases: scored,
        });
      } catch (finishErr) {
        this.logError(finishErr, 'eval: could not mark suite run failed', { suiteRunId: run.id });
      }
    }
  }
}

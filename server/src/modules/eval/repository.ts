import type { Db } from '../../db/client.js';
import { CaseRepo } from './repository/case.repo.js';
import { CaseRunRepo } from './repository/case-run.repo.js';
import { SuiteRunRepo } from './repository/suite-run.repo.js';
import type {
  CaseRunFinish,
  CaseRunRecord,
  EvalCaseEdit,
  EvalCaseRecord,
  EvalStore,
  NewEvalCase,
  NewSuiteRun,
  SuiteFinish,
  SuiteRunRecord,
} from './types.js';

/** Drizzle implementation of the eval persistence port; delegates to the entity repos. */
export class EvalRepository implements EvalStore {
  private cases: CaseRepo;
  private suites: SuiteRunRepo;
  private caseRuns: CaseRunRepo;

  constructor(db: Db) {
    this.cases = new CaseRepo(db);
    this.suites = new SuiteRunRepo(db);
    this.caseRuns = new CaseRunRepo(db);
  }

  listCases(workspaceId: string, agentId: string): Promise<EvalCaseRecord[]> {
    return this.cases.list(workspaceId, agentId);
  }
  countCasesByAgent(workspaceId: string): Promise<Map<string, number>> {
    return this.cases.countByAgent(workspaceId);
  }
  getCase(workspaceId: string, caseId: string): Promise<EvalCaseRecord | undefined> {
    return this.cases.get(workspaceId, caseId);
  }
  insertCase(input: NewEvalCase): Promise<{ record: EvalCaseRecord; created: boolean }> {
    return this.cases.insert(input);
  }
  updateCase(workspaceId: string, caseId: string, edit: EvalCaseEdit): Promise<EvalCaseRecord | undefined> {
    return this.cases.update(workspaceId, caseId, edit);
  }
  deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    return this.cases.delete(workspaceId, caseId);
  }
  lastResults(caseIds: string[]): Promise<Map<string, CaseRunRecord>> {
    return this.caseRuns.lastResults(caseIds);
  }
  insertSuite(input: NewSuiteRun): Promise<SuiteRunRecord | 'already_running'> {
    return this.suites.insert(input);
  }
  agentsWithRunningSuite(workspaceId: string): Promise<Set<string>> {
    return this.suites.agentsWithRunning(workspaceId);
  }
  getSuite(workspaceId: string, id: string): Promise<SuiteRunRecord | undefined> {
    return this.suites.get(workspaceId, id);
  }
  listSuites(workspaceId: string, agentId: string): Promise<SuiteRunRecord[]> {
    return this.suites.list(workspaceId, agentId);
  }
  recentSuites(workspaceId: string, limit: number): Promise<(SuiteRunRecord & { agentName: string })[]> {
    return this.suites.recent(workspaceId, limit);
  }
  updateSuiteProgress(id: string, casesDone: number): Promise<boolean> {
    return this.suites.updateProgress(id, casesDone);
  }
  finishSuite(id: string, f: SuiteFinish): Promise<boolean> {
    return this.suites.finish(id, f);
  }
  insertCaseRun(caseId: string, suiteRunId: string | null): Promise<CaseRunRecord | undefined> {
    return this.caseRuns.insert(caseId, suiteRunId);
  }
  finishCaseRun(id: string, f: CaseRunFinish): Promise<boolean> {
    return this.caseRuns.finish(id, f);
  }
  getCaseRun(workspaceId: string, id: string): Promise<CaseRunRecord | undefined> {
    return this.caseRuns.get(workspaceId, id);
  }
  caseRunsForSuite(suiteRunId: string): Promise<CaseRunRecord[]> {
    return this.caseRuns.forSuite(suiteRunId);
  }
  async reapInterrupted(reason: string): Promise<{ suites: number; caseRuns: number }> {
    const suites = await this.suites.reapRunning(reason);
    const caseRuns = await this.caseRuns.reapRunning(reason);
    return { suites, caseRuns };
  }
}

import type {
  EvalAgentSnapshot,
  EvalCaseMeta,
  EvalCaseResultStatus,
  EvalCaseSource,
  EvalDroppedFinding,
  EvalExpectation,
  EvalScoredCase,
  EvalSuiteStatus,
  Finding,
  Provider,
} from '@devdigest/shared';

/** Agent data the eval service needs, read through a container repo in wiring. */
export interface EvalAgent {
  id: string;
  name: string;
  model: string;
  provider: Provider;
  strategy: 'auto' | 'single-pass' | 'map-reduce';
  systemPrompt: string;
  version: number;
  enabled: boolean;
}

export interface EvalSkill {
  id: string;
  name: string;
  version: number;
  body: string;
  untrusted: boolean;
}

export interface EvalCaseRecord {
  id: string;
  workspaceId: string;
  agentId: string;
  name: string;
  inputDiff: string;
  inputMeta: EvalCaseMeta;
  expectedOutput: EvalExpectation[];
  notes: string | null;
  sourceFindingId: string | null;
  source: EvalCaseSource | null;
}

export interface CaseRunRecord {
  id: string;
  caseId: string;
  caseName: string;
  suiteRunId: string | null;
  ranAt: Date;
  status: EvalCaseResultStatus;
  error: string | null;
  grounded: Finding[];
  dropped: EvalDroppedFinding[];
  matchedMustFind: number | null;
  mustFindTotal: number | null;
  noiseCount: number | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
}

export interface SuiteRunRecord {
  id: string;
  workspaceId: string;
  agentId: string;
  runNumber: number;
  agentVersion: number;
  status: EvalSuiteStatus;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  casesTotal: number;
  casesDone: number;
  casesPassed: number;
  casesErrored: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
  costPartial: boolean;
  durationMs: number | null;
  scoredCases: EvalScoredCase[];
  snapshot: EvalAgentSnapshot | null;
}

export type NewEvalCase = Omit<EvalCaseRecord, 'id'>;
export type EvalCaseEdit = Pick<EvalCaseRecord, 'name' | 'inputDiff' | 'inputMeta' | 'expectedOutput' | 'notes'>;

export interface NewSuiteRun {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  casesTotal: number;
  snapshot: EvalAgentSnapshot;
}

export interface SuiteFinish {
  status: 'done' | 'partial' | 'failed';
  error: string | null;
  casesPassed: number;
  casesErrored: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
  costPartial: boolean;
  durationMs: number | null;
  scoredCases: EvalScoredCase[];
}

export interface CaseRunFinish {
  status: 'passed' | 'failed' | 'errored';
  error: string | null;
  grounded: Finding[];
  dropped: EvalDroppedFinding[];
  matchedMustFind: number | null;
  mustFindTotal: number | null;
  noiseCount: number | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
}

/** Persistence port of the eval module; the Drizzle repository implements it. */
export interface EvalStore {
  listCases(workspaceId: string, agentId: string): Promise<EvalCaseRecord[]>;
  countCasesByAgent(workspaceId: string): Promise<Map<string, number>>;
  getCase(workspaceId: string, caseId: string): Promise<EvalCaseRecord | undefined>;
  insertCase(input: NewEvalCase): Promise<{ record: EvalCaseRecord; created: boolean }>;
  updateCase(workspaceId: string, caseId: string, edit: EvalCaseEdit): Promise<EvalCaseRecord | undefined>;
  deleteCase(workspaceId: string, caseId: string): Promise<boolean>;
  lastResults(caseIds: string[]): Promise<Map<string, CaseRunRecord>>;
  insertSuite(input: NewSuiteRun): Promise<SuiteRunRecord | 'already_running'>;
  hasRunningSuite(agentId: string): Promise<boolean>;
  getSuite(workspaceId: string, id: string): Promise<SuiteRunRecord | undefined>;
  listSuites(workspaceId: string, agentId: string): Promise<SuiteRunRecord[]>;
  recentSuites(workspaceId: string, limit: number): Promise<(SuiteRunRecord & { agentName: string })[]>;
  updateSuiteProgress(id: string, casesDone: number): Promise<boolean>;
  finishSuite(id: string, f: SuiteFinish): Promise<boolean>;
  insertCaseRun(caseId: string, suiteRunId: string | null): Promise<CaseRunRecord | undefined>;
  finishCaseRun(id: string, f: CaseRunFinish): Promise<boolean>;
  getCaseRun(workspaceId: string, id: string): Promise<CaseRunRecord | undefined>;
  caseRunsForSuite(suiteRunId: string): Promise<CaseRunRecord[]>;
  reapInterrupted(reason: string): Promise<{ suites: number; caseRuns: number }>;
}

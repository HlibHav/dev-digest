import {
  type CloneScan,
  type CloneScanOptions,
  type CloneScanner,
  type FeatureModelChoice,
  type LLMProvider,
  type OnboardingFailureReason,
  type OnboardingGenerateAccepted,
  type OnboardingLlmMeta,
  type OnboardingTour,
  type OnboardingView,
  type RepoRef,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { LLM_DEADLINE_MS, MAX_ROUTES, SCHEMA_NAME } from './constants.js';
import {
  buildModelInput,
  buildSkeleton,
  detectStack,
  formatGenerationLog,
  mergeTour,
  parseStoredTour,
  renderModelInput,
  toIndexStatus,
  type OnboardingFacts,
  type RankedFileRow,
} from './helpers.js';
import { OnboardingLlmOutput } from './llm-schema.js';

/**
 * Onboarding tour service.
 *
 *   collect facts (CODE)  →  one structured call (MODEL)  →  merge (CODE)  →  store
 *
 * The model only writes prose over lists that code already chose; `mergeTour`
 * drops anything it invents. `generate` never throws: a tour that cannot be
 * written becomes a skeleton, and a skeleton never replaces a stored LLM tour.
 *
 * Generation runs in-process through the `background` port with a per-instance
 * in-flight set (ADR 2026-10-03-onboarding-tour-architecture, S1): a restart
 * drops the set, so nothing reads `generating` forever.
 */

export interface OnboardingRepoBasics {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
}

export interface OnboardingStore {
  getRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoBasics | undefined>;
  readTour(repoId: string): Promise<unknown | undefined>;
  saveTour(repoId: string, tour: OnboardingTour, generatedAt: Date): Promise<'saved' | 'repo_gone'>;
}

export interface OnboardingIndexPort {
  enabled: boolean;
  state(repoId: string): Promise<{
    status: 'full' | 'partial' | 'degraded' | 'failed';
    filesIndexed: number;
    lastIndexedSha: string;
  }>;
  ranked(repoId: string): Promise<RankedFileRow[]>;
  chains(repoId: string): Promise<string[][]>;
  routes(repoId: string, limit: number): Promise<string[]>;
}

export interface OnboardingLog {
  info(line: string): void;
  error(line: string): void;
}

export interface OnboardingPorts {
  repo: OnboardingStore;
  index: OnboardingIndexPort;
  clone: CloneScanner;
  cloneOpts: CloneScanOptions;
  headSha(ref: RepoRef): Promise<string>;
  resolveModel(workspaceId: string): Promise<FeatureModelChoice>;
  llm(provider: FeatureModelChoice['provider']): Promise<LLMProvider>;
  systemPrompt(): Promise<string>;
  deadline<T>(p: Promise<T>, ms: number): Promise<T>;
  background(task: () => Promise<void>): void;
  now(): Date;
  log: OnboardingLog;
}

type Outcome = 'complete' | 'partial' | OnboardingFailureReason;
type Draft = { tour: OnboardingTour; outcome: Outcome; llm: OnboardingLlmMeta };

const NO_CALLS: OnboardingLlmMeta = { calls: 0 };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isTimeout = (e: unknown) => e instanceof Error && e.name === 'TimeoutError';

export class OnboardingService {
  private inFlight = new Set<string>();

  constructor(private ports: OnboardingPorts) {}

  async read(workspaceId: string, repoId: string): Promise<OnboardingView> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const tour = parseStoredTour(await this.ports.repo.readTour(repoId));
    let indexCommitSha: string | null = null;
    try {
      indexCommitSha = (await this.ports.index.state(repoId)).lastIndexedSha || null;
    } catch {
      indexCommitSha = null;
    }
    return {
      cloned: repo.clonePath !== null,
      state: this.inFlight.has(repoId) ? 'generating' : tour ? 'ready' : 'none',
      repo_full_name: repo.fullName,
      index_commit_sha: indexCommitSha,
      tour,
    };
  }

  async start(workspaceId: string, repoId: string): Promise<OnboardingGenerateAccepted> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (repo.clonePath === null) throw new AppError('not_cloned', "This repository isn't cloned yet", 409);
    if (this.inFlight.has(repoId)) {
      throw new AppError('already_generating', 'A generation is already running', 409);
    }
    this.inFlight.add(repoId);
    this.ports.background(() => this.generate(workspaceId, repoId));
    return { state: 'generating' };
  }

  /** Never throws. Logs exactly one `formatGenerationLog` line, however it ends. */
  async generate(workspaceId: string, repoId: string): Promise<void> {
    const started = Date.now();
    let repoName = repoId;
    let outcome: Outcome = 'error';
    let llm: OnboardingLlmMeta = NO_CALLS;
    try {
      const repo = await this.ports.repo.getRepo(workspaceId, repoId);
      if (repo?.clonePath) {
        repoName = repo.fullName;
        const draft = await this.draft(workspaceId, repo, repo.clonePath);
        llm = draft.llm;
        outcome = (await this.store(repoId, draft)) === 'saved' ? draft.outcome : 'error';
      }
    } catch (e) {
      outcome = 'error';
      this.ports.log.error(`onboarding: generation failed for ${repoName} — ${errText(e)}`);
    } finally {
      this.inFlight.delete(repoId);
      this.ports.log.info(formatGenerationLog({ repo: repoName, llm, outcome, durationMs: Date.now() - started }));
    }
  }

  // ---- internals ----

  private async requireRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoBasics> {
    const repo = await this.ports.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  /** (a) collect, (b) unavailable index, (c) the one model call. */
  private async draft(workspaceId: string, repo: OnboardingRepoBasics, clonePath: string): Promise<Draft> {
    const { ports } = this;
    const collected: {
      scan: CloneScan | null;
      lastIndexedSha: string;
      status: Parameters<typeof toIndexStatus>[0]['state'];
      ranked: RankedFileRow[];
      chains: string[][];
      routes: string[];
    } = { scan: null, lastIndexedSha: '', status: null, ranked: [], chains: [], routes: [] };

    const facts = (commitSha: string): OnboardingFacts => {
      const scan = collected.scan;
      const index = scan
        ? toIndexStatus({ sourceFiles: scan.sourceFiles, flagOn: ports.index.enabled, state: collected.status })
        : { status: 'unavailable' as const, filesIndexed: 0, filesTotal: 0 };
      return {
        repoFullName: repo.fullName,
        commitSha,
        index,
        rankingAvailable: collected.ranked.length > 0,
        stack: scan ? detectStack(scan) : [],
        folders: (scan?.topLevel ?? []).filter((e) => e.kind === 'dir').map((e) => ({ name: e.name, files: e.files })),
        rootFiles: scan?.rootFiles ?? [],
        scripts: scan?.packageScripts ?? {},
        readme: scan?.readme ?? null,
        routes: collected.routes,
        ranked: collected.ranked,
        criticalChains: collected.chains,
      };
    };

    let commitSha = '';
    try {
      collected.scan = await ports.clone.scan(clonePath, ports.cloneOpts);
      const state = await ports.index.state(repo.id);
      collected.status = state;
      collected.lastIndexedSha = state.lastIndexedSha;
      collected.ranked = await ports.index.ranked(repo.id);
      collected.chains = await ports.index.chains(repo.id);
      collected.routes = await ports.index.routes(repo.id, MAX_ROUTES);
      commitSha = state.lastIndexedSha || (await ports.headSha({ owner: repo.owner, name: repo.name }).catch(() => '')) || '';
    } catch (e) {
      ports.log.error(`onboarding: fact collection failed for ${repo.fullName} — ${errText(e)}`);
      const f = facts(collected.lastIndexedSha);
      return this.skeleton(f, 'error', NO_CALLS);
    }

    const f = facts(commitSha);
    if (f.index.status === 'unavailable') return this.skeleton(f, 'index_unavailable', NO_CALLS);
    return this.callModel(workspaceId, f, clonePath);
  }

  private skeleton(f: OnboardingFacts, reason: OnboardingFailureReason, llm: OnboardingLlmMeta): Draft {
    return { tour: buildSkeleton(f, reason, llm, this.ports.now()), outcome: reason, llm };
  }

  private async callModel(workspaceId: string, f: OnboardingFacts, clonePath: string): Promise<Draft> {
    const { ports } = this;
    let choice: FeatureModelChoice;
    let provider: LLMProvider;
    let system: string;
    try {
      choice = await ports.resolveModel(workspaceId);
      provider = await ports.llm(choice.provider);
      system = await ports.systemPrompt();
    } catch (e) {
      ports.log.error(`onboarding: model setup failed for ${f.repoFullName} — ${errText(e)}`);
      return this.skeleton(f, 'llm_failed', NO_CALLS);
    }

    const input = buildModelInput(f);
    const base = { calls: 1 as const, provider: choice.provider, model: choice.model };
    const began = Date.now();
    try {
      const result = await ports.deadline(
        provider.completeStructured({
          model: choice.model,
          schema: OnboardingLlmOutput,
          schemaName: SCHEMA_NAME,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: renderModelInput(input) },
          ],
          timeoutMs: LLM_DEADLINE_MS,
          maxRetries: 0,
        }),
        LLM_DEADLINE_MS,
      );
      const llm: OnboardingLlmMeta = {
        ...base,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: result.costUsd,
        duration_ms: Date.now() - began,
      };
      const parsed = OnboardingLlmOutput.safeParse(result.data);
      if (!parsed.success) {
        ports.log.error(`onboarding: model output rejected for ${f.repoFullName}`);
        return this.skeleton(f, 'llm_failed', llm);
      }
      const taskPaths = [...new Set(parsed.data.first_tasks.map((t) => t.path))];
      const found = await Promise.all(
        taskPaths.map((p) => ports.clone.exists(clonePath, p).catch(() => false)),
      );
      const existing = new Set(taskPaths.filter((_, i) => found[i]));
      return {
        tour: mergeTour(f, parsed.data, existing, llm, ports.now()),
        outcome: f.index.status === 'partial' ? 'partial' : 'complete',
        llm,
      };
    } catch (e) {
      const timedOut = isTimeout(e);
      ports.log.error(`onboarding: model call ${timedOut ? 'timed out' : 'failed'} for ${f.repoFullName} — ${errText(e)}`);
      const llm: OnboardingLlmMeta = {
        ...base,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        duration_ms: Date.now() - began,
      };
      return this.skeleton(f, timedOut ? 'timed_out' : 'llm_failed', llm);
    }
  }

  /**
   * (d) A skeleton never replaces a stored LLM tour: that tour is kept as it
   * was, with `last_failure` recording why this attempt produced nothing.
   * (e) A repo deleted mid-generation persists nothing.
   */
  private async store(repoId: string, draft: Draft): Promise<'saved' | 'repo_gone'> {
    const { repo } = this.ports;
    if (draft.tour.source === 'skeleton') {
      const stored = parseStoredTour(await repo.readTour(repoId));
      if (stored?.source === 'llm') {
        const reason = draft.tour.skeleton_reason;
        const kept: OnboardingTour = {
          ...stored,
          last_failure: { reason: reason ?? 'error', at: this.ports.now().toISOString(), llm: draft.llm },
        };
        return repo.saveTour(repoId, kept, new Date(stored.generated_at));
      }
    }
    return repo.saveTour(repoId, { ...draft.tour, last_failure: null }, new Date(draft.tour.generated_at));
  }
}

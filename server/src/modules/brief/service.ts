import type {
  BlastRadius,
  FeatureModelChoice,
  IssueMeta,
  LLMProvider,
  PrBrief,
  PrBriefResult,
  PrDetail,
  RepoRef,
  SmartDiffRole,
} from '@devdigest/shared';
import { PrBrief as PrBriefSchema } from '@devdigest/shared';
import { ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { loadPromptTemplate, renderPrompt } from '../../platform/prompts.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { BRIEF_MAX_ISSUES, BRIEF_MAX_SPEC_CHARS, BRIEF_MAX_TEXT_CHARS, BRIEF_SCHEMA_NAME } from './constants.js';
import { buildValidationContext, computeMissingInputs, normalizeAnswer, parseNewSideRanges } from './helpers.js';
import { fitToBudget, type BriefFileFact, type BriefInputs } from './prompt.js';
import { PrBriefModelAnswer } from './schemas.js';

// Read the template once at import, so a generation never waits on the disk inside its deadline.
await loadPromptTemplate('brief.system.md');

/** Fields of the one structured log line a generation writes. */
export interface BriefLogFields {
  prId: string;
  model: string | null;
  attempts: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  /** Tokens of the system prompt plus the user message, by our own count. */
  inputTokens: number | null;
  truncatedInputs: string[];
  droppedRisks: number;
  droppedFocus: number;
  /** Agent docs that could not be read, and the like. Never PR text. */
  notes: string[];
  outcome: 'ok' | 'failed';
}

/**
 * Ports. A new service takes what it calls, not the container
 * (onion-architecture skill, step 5). Functions of other modules arrive here
 * from `wiring.ts`.
 */
export interface BriefPorts {
  getPull(workspaceId: string, prId: string): Promise<{ id: string; repoId: string; headSha: string } | undefined>;
  getRepo(repoId: string): Promise<{ owner: string; name: string; clonePath: string | null } | undefined>;
  /** Refreshes from GitHub and returns the one snapshot of head, body, files and patches. */
  refreshPullDetail(workspaceId: string, prId: string): Promise<PrDetail>;
  /** The raw stored `pr_brief.json`; never parsed by the repository or the service. */
  getStored(prId: string): Promise<unknown | undefined>;
  save(prId: string, brief: PrBrief): Promise<void>;
  getIntent(prId: string): Promise<{ intent: string; inScope: string[]; outOfScope: string[] } | undefined>;
  getBlast(workspaceId: string, prId: string): Promise<BlastRadius | undefined>;
  getIssue(ref: RepoRef, n: number): Promise<IssueMeta>;
  agentIds(workspaceId: string): Promise<string[]>;
  resolveAgentDocs(
    input: { workspaceId: string; agentId: string; clonePath: string | null },
    log: (message: string) => void,
  ): Promise<{ path: string; text: string }[]>;
  resolveModel(workspaceId: string): Promise<FeatureModelChoice>;
  llm(provider: FeatureModelChoice['provider']): Promise<LLMProvider>;
  count(text: string): number;
  classifyFile(path: string): SmartDiffRole;
  parseLinkedIssues(body: string, repo: { owner: string; name: string }, cap: number): number[];
  sanitize(text: string, max: number): string;
  now(): Date;
  log(fields: BriefLogFields, message: string): void;
  limits: { deadlineMs: number };
}

/** The title is never shortened; this only strips invisible characters from a text GitHub already caps. */
const TITLE_SANITIZE_CHARS = 1000;

/**
 * Builds the PR brief: one structured model call over facts about the PR (no
 * diff text), validated and trimmed in code before anything is stored.
 */
export class BriefService {
  private inflight = new Map<string, Promise<PrBriefResult>>();

  constructor(private ports: BriefPorts) {}

  /** `GET` — the stored brief with `stale` computed from the PR's current head. Never parsed here. */
  async get(workspaceId: string, prId: string): Promise<PrBriefResult | null> {
    const pull = await this.ports.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const stored = await this.ports.getStored(prId);
    if (stored === undefined || stored === null) return null;
    const headSha = (stored as { head_sha?: unknown }).head_sha;
    return { ...(stored as object), stale: headSha !== pull.headSha } as PrBriefResult;
  }

  /**
   * `POST` — generate and store a fresh brief. One generation per PR at a time:
   * a second call while one is running gets the first one's result.
   */
  async generate(workspaceId: string, prId: string): Promise<PrBriefResult> {
    const pull = await this.ports.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const running = this.inflight.get(prId);
    if (running) return running;

    const job = this.run(workspaceId, pull).finally(() => this.inflight.delete(prId));
    this.inflight.set(prId, job);
    return job;
  }

  private async run(workspaceId: string, pull: { id: string; repoId: string }): Promise<PrBriefResult> {
    const { ports } = this;
    const log: BriefLogFields = {
      prId: pull.id,
      model: null,
      attempts: null,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
      inputTokens: null,
      truncatedInputs: [],
      droppedRisks: 0,
      droppedFocus: 0,
      notes: [],
      outcome: 'failed',
    };
    // Set when the deadline passes, so a late finish never writes the stored brief.
    const state = { expired: false };

    try {
      const result = await withTimeout(this.generateInner(workspaceId, pull, log, state), ports.limits.deadlineMs);
      log.outcome = 'ok';
      return result;
    } catch (err) {
      if (err instanceof TimeoutError) {
        state.expired = true;
        throw new ExternalServiceError(`Couldn't generate the PR brief: no answer within ${Math.round(ports.limits.deadlineMs / 1000)}s`);
      }
      throw err;
    } finally {
      ports.log({ ...log }, log.outcome === 'ok' ? 'brief: generated' : 'brief: failed');
    }
  }

  private async generateInner(
    workspaceId: string,
    pull: { id: string; repoId: string },
    log: BriefLogFields,
    state: { expired: boolean },
  ): Promise<PrBriefResult> {
    const { ports } = this;

    // One snapshot of head, body, files and patches; the validation below uses all of it.
    const detail = await ports.refreshPullDetail(workspaceId, pull.id);
    const repo = await ports.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    const storedIntent = await ports.getIntent(pull.id);
    const intent = storedIntent
      ? { intent: storedIntent.intent, in_scope: storedIntent.inScope, out_of_scope: storedIntent.outOfScope }
      : null;

    let blast: BlastRadius | null = null;
    try {
      blast = (await ports.getBlast(workspaceId, pull.id)) ?? null;
    } catch {
      blast = null;
    }

    const body = detail.body ?? '';
    let issue: BriefInputs['issue'] = null;
    const [issueNumber] = ports.parseLinkedIssues(body, repo, BRIEF_MAX_ISSUES);
    if (issueNumber !== undefined) {
      try {
        const meta = await ports.getIssue({ owner: repo.owner, name: repo.name }, issueNumber);
        issue = {
          number: meta.number,
          title: ports.sanitize(meta.title, TITLE_SANITIZE_CHARS),
          body: ports.sanitize(meta.body ?? '', BRIEF_MAX_TEXT_CHARS),
        };
      } catch {
        issue = null;
      }
    }

    // Docs of every agent, in agent order; the first occurrence of a path wins.
    const specs: { path: string; text: string }[] = [];
    const seen = new Set<string>();
    for (const agentId of await ports.agentIds(workspaceId)) {
      const docs = await ports.resolveAgentDocs({ workspaceId, agentId, clonePath: repo.clonePath }, (m) => log.notes.push(m));
      for (const doc of docs) {
        if (seen.has(doc.path)) continue;
        seen.add(doc.path);
        specs.push({ path: doc.path, text: ports.sanitize(doc.text, BRIEF_MAX_SPEC_CHARS) });
      }
    }

    const choice = await ports.resolveModel(workspaceId);
    log.model = `${choice.provider}/${choice.model}`;

    const files = detail.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions, ranges: parseNewSideRanges(f.patch ?? null) }));
    const facts: BriefFileFact[] = files.map((f) => ({ ...f, role: ports.classifyFile(f.path) }));
    const description = body.trim() === '' ? null : ports.sanitize(body, BRIEF_MAX_TEXT_CHARS);
    const inputs: BriefInputs = {
      title: ports.sanitize(detail.title, TITLE_SANITIZE_CHARS),
      description,
      intent,
      blast,
      issue,
      specs,
      files: facts,
    };

    const system = await renderPrompt('brief.system.md', {});
    const fit = fitToBudget(inputs, system, (text) => ports.count(text));
    log.inputTokens = fit.tokens;
    log.truncatedInputs = fit.truncated;

    // Resolved outside the try below: a missing key is a ConfigError (500), not a 502.
    const llm = await ports.llm(choice.provider);

    let result;
    try {
      result = await llm.completeStructured<PrBriefModelAnswer>({
        model: choice.model,
        schema: PrBriefModelAnswer,
        schemaName: BRIEF_SCHEMA_NAME,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: fit.user },
        ],
        timeoutMs: ports.limits.deadlineMs,
        maxRetries: 0,
      });
    } catch (err) {
      throw new ExternalServiceError(`Couldn't generate the PR brief: ${(err as Error).message}`);
    }
    log.attempts = result.attempts;
    log.tokensIn = result.tokensIn;
    log.tokensOut = result.tokensOut;
    log.costUsd = result.costUsd ?? null;

    const normalized = normalizeAnswer(result.data, buildValidationContext(files, blast));
    log.droppedRisks = normalized.droppedRisks;
    log.droppedFocus = normalized.droppedFocus;

    const parsed = PrBriefSchema.safeParse({
      summary: normalized.summary,
      intent,
      blast,
      risks: { risks: normalized.risks },
      review_focus: normalized.review_focus,
      history: null,
      head_sha: detail.head_sha,
      generated_at: ports.now().toISOString(),
      model: log.model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd ?? null,
      missing_inputs: computeMissingInputs({
        intent,
        blast,
        issueFound: issue !== null,
        specsRead: specs.length,
        description,
      }),
      truncated_inputs: fit.truncated,
    });
    if (!parsed.success) throw new ExternalServiceError("Couldn't generate the PR brief: the answer did not fit the brief contract");

    if (state.expired) throw new ExternalServiceError("Couldn't generate the PR brief: the deadline passed");
    await ports.save(pull.id, parsed.data);
    return { ...parsed.data, stale: false };
  }
}

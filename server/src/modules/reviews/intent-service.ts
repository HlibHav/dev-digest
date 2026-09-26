import type {
  FeatureModelChoice,
  IntentChangeType,
  IssueMeta,
  LLMProvider,
  PrDetail,
  PrIntentRecord,
  RepoRef,
  UnifiedDiff,
} from '@devdigest/shared';
import { withTimeout } from '../../platform/resilience.js';
import { ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import type { PromptIntent } from '@devdigest/reviewer-core';
import type { PullRow } from './repository.js';
import {
  INTENT_DATAMARK,
  INTENT_MAX_BODY_CHARS,
  INTENT_MAX_BRANCH_CHARS,
  INTENT_MAX_COMMITS,
  INTENT_MAX_COMMIT_CHARS,
  INTENT_MAX_DOCS,
  INTENT_MAX_DOC_CHARS,
  INTENT_MAX_ISSUES,
  INTENT_MAX_ISSUE_CHARS,
  INTENT_MAX_PATHS,
  INTENT_MAX_PATH_CHARS,
  INTENT_MAX_TICKETS,
  INTENT_MAX_TITLE_CHARS,
  INTENT_SCHEMA_NAME,
  INTENT_PROMPT_VERSION,
  INTENT_TIMEOUT_MS,
  INTENT_TOTAL_BUDGET_MS,
} from './intent-constants.js';
import {
  PrIntentExtraction,
  computeConfidence,
  docFromAddedPatch,
  intentInputHash,
  parseLinkedDocs,
  parseLinkedIssues,
  parseTicketKeys,
  renderIntentSources,
  sanitizeSourceText,
  toPromptIntent,
  type StoredIntent,
} from './intent-helpers.js';

/** A stored `pr_intent` row, in the shape the service reads/writes. */
export interface PersistedIntent extends StoredIntent {
  model: string | null;
  headSha: string | null;
  inputHash: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  updatedAt: string | null;
}

export interface IntentDeriveInput {
  workspaceId: string;
  pull: PullRow;
  /** Just the two fields intent derivation needs — never the full db row
      (application code imports no `src/db/**`; see onion-architecture). */
  repo: { owner: string; name: string };
  diff: UnifiedDiff;
}

/**
 * Ports. A new service takes what it calls, not the container
 * (onion-architecture skill, step 5).
 */
export interface IntentPorts {
  getPull(workspaceId: string, prId: string): Promise<PullRow | undefined>;
  getIntent(prId: string): Promise<PersistedIntent | undefined>;
  saveIntent(prId: string, record: PersistedIntent): Promise<void>;
  /** [D6] — reuses the SAME refresh-from-GitHub logic `GET /pulls/:id` uses. */
  refreshPullDetail(workspaceId: string, prId: string): Promise<PrDetail>;
  listCommits(prId: string): Promise<{ message: string }[]>;
  listPrFiles(prId: string): Promise<{ path: string; patch: string | null }[]>;
  /** Owner/name of the PR's repo — the manual re-derive has no run to take it from. */
  getRepo(repoId: string): Promise<{ owner: string; name: string } | undefined>;
  /** The PR's unified diff, the same loader a review run uses. */
  loadDiff(workspaceId: string, pull: PullRow): Promise<UnifiedDiff>;
  getIssue(ref: RepoRef, n: number): Promise<IssueMeta>;
  /** Reads from the local clone (default branch) — [D2] option A/B. */
  readRepoFile(ref: RepoRef, path: string): Promise<string>;
  resolveModel(workspaceId: string): Promise<FeatureModelChoice>;
  llm(provider: FeatureModelChoice['provider']): Promise<LLMProvider>;
}

/** The subset `run-executor.ts` depends on — narrows the surface it can call. */
export type IntentDeriver = Pick<IntentService, 'derive'>;

/** Knobs for one derivation. A review run passes none of them. */
export interface IntentDeriveOptions {
  /** Skip the `input_hash` cache and call the model (manual re-derive). */
  force?: boolean;
  /** The caller already refreshed the PR from GitHub; don't do it again. */
  refreshed?: boolean;
}

/**
 * Derives a PR's intent (title/description/linked issues/plan docs/branch/
 * commits/paths → one cheap-model call), cached per PR by `input_hash`.
 * `derive` NEVER throws — every failure is caught and logged, and the caller
 * (run-executor) proceeds without intent. See `.claude/rules/review-runs.md`:
 * no new throw point between `loadDiff` and the agent loop.
 */
export class IntentService {
  constructor(private ports: IntentPorts) {}

  async derive(
    input: IntentDeriveInput,
    log: (msg: string) => void,
    opts: IntentDeriveOptions = {},
  ): Promise<{ intent: PromptIntent; costUsd: number } | null> {
    try {
      return await withTimeout(this.deriveInner(input, log, opts), INTENT_TOTAL_BUDGET_MS);
    } catch (err) {
      log(`intent: failed — ${(err as Error).message}; continuing without intent`);
      return null;
    }
  }

  private async deriveInner(
    input: IntentDeriveInput,
    log: (msg: string) => void,
    opts: IntentDeriveOptions,
  ): Promise<{ intent: PromptIntent; costUsd: number } | null> {
    const { workspaceId, pull, repo, diff } = input;
    const repoRef: RepoRef = { owner: repo.owner, name: repo.name };

    // 0. [D6] refresh from GitHub when the stored body is empty.
    let body = pull.body ?? '';
    if (!body.trim() && !opts.refreshed) {
      try {
        const detail = await this.ports.refreshPullDetail(workspaceId, pull.id);
        body = detail.body ?? '';
        log('intent: refreshed PR detail from GitHub');
      } catch (err) {
        log(`intent: PR detail refresh failed — ${(err as Error).message}`);
      }
    }

    // a. collectSources (code only).
    const sanitizedTitle = sanitizeSourceText(pull.title, INTENT_MAX_TITLE_CHARS);
    const sanitizedBody = sanitizeSourceText(body, INTENT_MAX_BODY_CHARS);

    const issueNumbers = parseLinkedIssues(body, repoRef, INTENT_MAX_ISSUES);
    const issues: { number: number; title: string; body: string }[] = [];
    for (const n of issueNumbers) {
      try {
        const issue = await this.ports.getIssue(repoRef, n);
        issues.push({
          number: n,
          title: sanitizeSourceText(issue.title, INTENT_MAX_TITLE_CHARS),
          body: sanitizeSourceText(issue.body ?? '', INTENT_MAX_ISSUE_CHARS),
        });
      } catch {
        log(`intent: skipped link "#${n}" — not found`);
      }
    }

    const ticketKeys = parseTicketKeys(body, pull.branch, INTENT_MAX_TICKETS);

    const { links: docLinks, skipped: skippedDocs } = parseLinkedDocs(body, repoRef, INTENT_MAX_DOCS);
    for (const s of skippedDocs) log(`intent: skipped link "${s.raw}" — ${s.reason}`);

    const prFiles = await this.ports.listPrFiles(pull.id);
    const docs: { path: string; content: string }[] = [];
    for (const link of docLinks) {
      const addedFile = prFiles.find((f) => f.path === link.path);
      let content = addedFile ? docFromAddedPatch(addedFile.patch) : null;
      if (content === null) {
        try {
          content = await this.ports.readRepoFile(repoRef, link.path);
          log(`intent: doc ${link.path} resolved from base branch`);
        } catch {
          log(`intent: skipped link "${link.raw}" — not found`);
          continue;
        }
      }
      docs.push({ path: link.path, content: sanitizeSourceText(content, INTENT_MAX_DOC_CHARS) });
    }

    const commitRows = await this.ports.listCommits(pull.id);
    const commitSubjects = commitRows
      .map((c) => sanitizeSourceText(c.message.split('\n')[0]!.trim(), INTENT_MAX_COMMIT_CHARS))
      .filter((s) => s.length > 0)
      .slice(0, INTENT_MAX_COMMITS);

    const branch = sanitizeSourceText(pull.branch, INTENT_MAX_BRANCH_CHARS);
    const paths = diff.files
      .slice(0, INTENT_MAX_PATHS)
      .map((f) => sanitizeSourceText(f.path, INTENT_MAX_PATH_CHARS));

    const sources = [
      { kind: 'title' as const, ref: 'title', used: true, note: null },
      {
        kind: 'description' as const,
        ref: 'description',
        used: sanitizedBody.trim().length > 0,
        note: null,
      },
      ...issues.map((i) => ({ kind: 'issue' as const, ref: `#${i.number}`, used: true, note: null })),
      ...ticketKeys.map((k) => ({ kind: 'ticket_ref' as const, ref: k, used: true, note: null })),
      ...docs.map((d) => ({ kind: 'plan_doc' as const, ref: d.path, used: true, note: null })),
      { kind: 'branch' as const, ref: branch, used: branch.length > 0, note: null },
      {
        kind: 'commits' as const,
        ref: `${commitSubjects.length} commit(s)`,
        used: commitSubjects.length > 0,
        note: null,
      },
      { kind: 'paths' as const, ref: `${paths.length} path(s)`, used: paths.length > 0, note: null },
    ];

    const missing = sources.filter((s) => !s.used).map((s) => s.kind);
    const present = [
      'title',
      sanitizedBody.trim() ? `description (${sanitizedBody.length} chars)` : null,
      ...issues.map((i) => `issue #${i.number}`),
      ...docs.map((d) => `plan doc ${d.path}`),
    ].filter((s): s is string => Boolean(s));
    log(
      `intent: sources — ${present.join(', ')}${missing.length > 0 ? `; missing: ${missing.join(', ')}` : ''}`,
    );

    // b. confidence — CODE, never the model.
    const confidence = computeConfidence(sanitizedBody, sources);

    // c. resolve the model.
    const choice = await this.ports.resolveModel(workspaceId);

    // d. cache check — input_hash includes the model id + prompt version + all source texts.
    const userMessage = renderIntentSources({
      title: sanitizedTitle,
      description: sanitizedBody || null,
      issues,
      docs,
      branch,
      commits: commitSubjects,
      paths,
    });
    const inputHash = intentInputHash(choice.model, INTENT_PROMPT_VERSION, sanitizedTitle, sanitizedBody, userMessage);

    const cached = await this.ports.getIntent(pull.id);
    if (!opts.force && cached && cached.inputHash === inputHash) {
      log(`intent: cached (inputs unchanged since ${pull.headSha.slice(0, 7)})`);
      return { intent: toPromptIntent(cached), costUsd: 0 };
    }

    // e. the model call, bounded by our own deadline; maxRetries: 0 (never bill twice).
    const llm = await this.ports.llm(choice.provider);
    const systemPrompt = await renderPrompt('intent.system.md', { datamark: INTENT_DATAMARK });
    const start = Date.now();
    const result = await llm.completeStructured<PrIntentExtraction>({
      model: choice.model,
      schema: PrIntentExtraction,
      schemaName: INTENT_SCHEMA_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      timeoutMs: INTENT_TIMEOUT_MS,
      maxRetries: 0,
    });
    const ms = Date.now() - start;

    const record: PersistedIntent = {
      intent: result.data.intent,
      inScope: result.data.in_scope,
      outOfScope: result.data.out_of_scope,
      changeType: result.data.change_type,
      confidence,
      sources,
      model: `${choice.provider}/${choice.model}`,
      headSha: pull.headSha,
      inputHash,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      updatedAt: new Date().toISOString(),
    };

    // f. persist.
    await this.ports.saveIntent(pull.id, record);

    log(
      `intent: classified by ${choice.provider}/${choice.model} in ${(ms / 1000).toFixed(1)}s — ` +
        `change_type=${record.changeType}, confidence=${confidence}, tokens ${result.tokensIn}/${result.tokensOut}, ` +
        `$${(result.costUsd ?? 0).toFixed(4)}`,
    );

    // g. return the review-facing shape + what it cost.
    return { intent: toPromptIntent(record), costUsd: result.costUsd ?? 0 };
  }

  /**
   * `POST /pulls/:id/intent` — re-derive on demand after the PR changed.
   * Unlike a review run it always refreshes the PR from GitHub first (body,
   * files, commits — falling back to what is stored when GitHub is
   * unreachable) and always calls the model (`force`), because the user asked
   * for a fresh answer. Returns `null` when the PR is not in this workspace;
   * throws `ExternalServiceError` when the derivation itself fails, so the
   * caller never gets the old record back as if it were new.
   */
  async rederive(
    workspaceId: string,
    prId: string,
    log: (msg: string) => void,
  ): Promise<PrIntentRecord | null> {
    const stored = await this.ports.getPull(workspaceId, prId);
    if (!stored) return null;

    await this.ports.refreshPullDetail(workspaceId, prId);
    log('intent: refreshed PR detail before re-deriving');
    const pull = (await this.ports.getPull(workspaceId, prId)) ?? stored;

    const repo = await this.ports.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    const diff = await this.ports.loadDiff(workspaceId, pull);

    let failure: string | null = null;
    const outcome = await this.derive(
      { workspaceId, pull, repo, diff },
      (msg) => {
        if (msg.startsWith('intent: failed')) failure = msg;
        log(msg);
      },
      { force: true, refreshed: true },
    );
    if (!outcome) {
      const reason = (failure ?? 'intent: failed — unknown error')
        .replace(/^intent: failed — /, '')
        .replace(/; continuing without intent$/, '');
      throw new ExternalServiceError(`Couldn't derive the PR intent: ${reason}`);
    }
    return this.getForPull(workspaceId, prId);
  }

  /** `GET /pulls/:id/intent` — 404 (via the route) when not derived, or when
      the PR isn't in this workspace. */
  async getForPull(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const pull = await this.ports.getPull(workspaceId, prId);
    if (!pull) return null;
    const row = await this.ports.getIntent(prId);
    if (!row) return null;
    return {
      pr_id: prId,
      intent: row.intent,
      in_scope: row.inScope,
      out_of_scope: row.outOfScope,
      // Our own write, always an IntentChangeType value; the DB column is
      // plain text (see server/src/db/schema/reviews.ts).
      change_type: row.changeType as IntentChangeType | null,
      confidence: row.confidence,
      sources: row.sources,
      model: row.model,
      head_sha: row.headSha,
      updated_at: row.updatedAt,
    };
  }
}

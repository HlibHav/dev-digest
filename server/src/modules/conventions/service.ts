import { randomUUID } from 'node:crypto';
import type {
  ConventionCandidate,
  ConventionsPage,
  ConventionStatus,
  FeatureModelChoice,
  LLMProvider,
  RepoRef,
  Skill,
} from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { withTimeout } from '../../platform/resilience.js';
import type { ConventionsRepository } from './repository.js';
import {
  ExtractionResult,
  buildSkillBody,
  pickConfigPaths,
  renderSamples,
  ruleHash,
  toCandidateDto,
  truncateSample,
  verifyCandidates,
  type ConventionRow,
  type SampleFile,
} from './helpers.js';
import {
  CONFIG_SAMPLE_PATHS,
  CONVENTIONS_SKILL_NAME,
  EXTRACTION_SCHEMA_NAME,
  EXTRACTION_TIMEOUT_MS,
  EXTRACTION_TOTAL_BUDGET_MS,
  MAX_CANDIDATES,
  SAMPLE_FILE_COUNT,
} from './constants.js';

/**
 * Conventions service — scan a repo for house rules, let a maintainer triage
 * them, and assemble the approved ones into one skill.
 *
 * The shape of the pipeline is deliberate and is the point of the feature:
 *
 *   sample (CODE)  →  extract (MODEL)  →  verify (CODE)  →  triage (HUMAN)
 *
 * The model sits in the middle only. It never decides which files are read, and
 * nothing it claims about a file is trusted until the claim is checked against
 * the file's actual bytes.
 */

export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
}

/** Ports. A new service takes what it calls, not the container. */
export interface ConventionsPorts {
  repo: ConventionsRepository;
  /** Top-ranked source files for this repo, junk-filtered. Paths only. */
  sampleFiles(repoId: string, n: number): Promise<string[]>;
  getRepoBasics(repoId: string): Promise<RepoBasics | null>;
  readRepoFile(ref: RepoRef, path: string): Promise<string>;
  resolveModel(workspaceId: string): Promise<FeatureModelChoice>;
  llm(provider: FeatureModelChoice['provider']): Promise<LLMProvider>;
  /** Create-or-update the single `repo-conventions` skill. */
  upsertSkill(
    workspaceId: string,
    input: { name: string; description: string; body: string; evidenceFiles: string[] },
  ): Promise<Skill>;
  log?(message: string): void;
}

export class ConventionsService {
  constructor(private ports: ConventionsPorts) {}

  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionsPage> {
    const rows = await this.ports.repo.listForRepo(workspaceId, repoId);
    const scan = await this.ports.repo.latestScan(workspaceId, repoId);
    return {
      candidates: rows.map(toCandidateDto),
      scan: scan
        ? {
            job_id: scan.jobId,
            status: scan.status,
            error: scan.error,
            finished_at: scan.finishedAt ? scan.finishedAt.toISOString() : null,
          }
        : null,
    };
  }

  /**
   * Collect the files the model will see. No model call happens here, by
   * design: config files are declared conventions, and the ranked sample comes
   * from the static index. Both are deterministic.
   */
  async collectSamples(repoId: string): Promise<{ samples: SampleFile[]; basics: RepoBasics }> {
    const basics = await this.ports.getRepoBasics(repoId);
    if (!basics) throw new NotFoundError('Repo not found');
    const ref: RepoRef = { owner: basics.owner, name: basics.name };

    // 1. Config files: probe each declared path; a miss just means the repo
    //    doesn't use that tool.
    const foundConfigs: string[] = [];
    const contents = new Map<string, string>();
    for (const path of CONFIG_SAMPLE_PATHS) {
      const text = await this.readIfPresent(ref, path);
      if (text !== null) {
        foundConfigs.push(path);
        contents.set(path, text);
      }
    }

    // 2. Top-ranked source files from the static index.
    const ranked = await this.ports.sampleFiles(repoId, SAMPLE_FILE_COUNT);
    if (ranked.length === 0 && foundConfigs.length === 0) {
      throw new ValidationError(
        'Nothing to sample — index this repo first (Repo intel → resync), then scan again.',
        { repo_id: repoId },
      );
    }

    const samples: SampleFile[] = [];
    for (const path of pickConfigPaths(foundConfigs)) {
      samples.push({ path, content: truncateSample(contents.get(path) ?? '') });
    }
    for (const path of ranked) {
      const text = await this.readIfPresent(ref, path);
      if (text !== null) samples.push({ path, content: truncateSample(text) });
    }
    return { samples, basics };
  }

  /**
   * Read a repo file, or null if it isn't usable as evidence.
   *
   * A missing file throws in the real git adapter but comes back as an empty
   * string from some implementations, and an empty file demonstrates no
   * convention either way — so blank content counts as absent rather than as a
   * sample that would pad the prompt with nothing.
   */
  private async readIfPresent(ref: RepoRef, path: string): Promise<string | null> {
    const text = await this.ports.readRepoFile(ref, path).catch(() => null);
    if (text === null || text.trim().length === 0) return null;
    return text;
  }

  /**
   * Run one scan: sample, extract, verify, persist.
   *
   * Idempotent per `scanId` — a re-run of the same job writes nothing a second
   * time, so a JobRunner retry cannot pay for the same extraction twice.
   */
  async runScan(workspaceId: string, repoId: string, scanId: string): Promise<number> {
    if ((await this.ports.repo.countForScan(scanId)) > 0) {
      this.ports.log?.(`conventions: scan ${scanId} already wrote rows — skipping`);
      return 0;
    }

    const { samples, basics } = await this.collectSamples(repoId);
    this.ports.log?.(`conventions: sampled ${samples.length} files (no model involved)`);

    const choice = await this.ports.resolveModel(workspaceId);
    const llm = await this.ports.llm(choice.provider);
    const rendered = renderSamples(samples);
    this.ports.log?.(
      `conventions: prompt carries ${rendered.length} chars of sampled code`,
    );
    const prompt = await renderPrompt('conventions.system.md', {
      samples: rendered,
      repoFullName: basics.fullName,
      maxCandidates: String(MAX_CANDIDATES),
    });

    // Two nested budgets on purpose. `timeoutMs` bounds one ATTEMPT, and the
    // providers apply it inside their own retry loop, so it cannot bound the
    // call; `withTimeout` bounds the whole thing at a deadline that lands
    // before JobRunner's 120s. `maxRetries: 0` keeps one slow extraction from
    // being silently billed twice.
    const result = await withTimeout(
      llm.completeStructured<ExtractionResult>({
        model: choice.model,
        schema: ExtractionResult,
        schemaName: EXTRACTION_SCHEMA_NAME,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Extract the conventions of this repository.' },
        ],
        timeoutMs: EXTRACTION_TIMEOUT_MS,
        maxRetries: 0,
      }),
      EXTRACTION_TOTAL_BUDGET_MS,
    );

    const verified = verifyCandidates(result.data.candidates ?? [], samples);
    this.ports.log?.(
      `conventions: ${result.data.candidates?.length ?? 0} proposed, ${verified.length} survived evidence checks`,
    );

    // Only now is anything destroyed, and only the undecided rows.
    await this.ports.repo.deletePending(workspaceId, repoId);
    return this.ports.repo.insertCandidates(workspaceId, repoId, scanId, verified);
  }

  /** Accept, reject, or edit one candidate. */
  async patch(
    workspaceId: string,
    id: string,
    patch: { status?: ConventionStatus; rule?: string; category?: string },
  ): Promise<ConventionCandidate | undefined> {
    const rule = patch.rule?.trim();
    if (patch.rule !== undefined && !rule) throw new ValidationError('A convention needs a rule');
    const row = await this.ports.repo.update(workspaceId, id, {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(rule !== undefined ? { rule, ruleHash: ruleHash(rule) } : {}),
      ...(patch.category !== undefined ? { category: patch.category.trim() } : {}),
    });
    return row ? toCandidateDto(row) : undefined;
  }

  /** The body the create-skill modal opens with, so the user edits real text. */
  async previewSkillBody(workspaceId: string, repoId: string): Promise<string> {
    const basics = await this.ports.getRepoBasics(repoId);
    if (!basics) throw new NotFoundError('Repo not found');
    const accepted = await this.ports.repo.listByStatus(workspaceId, repoId, 'accepted');
    return buildSkillBody(accepted, basics.fullName);
  }

  /**
   * Assemble accepted candidates into the `repo-conventions` skill.
   *
   * Rejected and still-pending rows are never read here — that is the whole
   * point of the triage step.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: { name?: string; description?: string; body?: string },
  ): Promise<Skill> {
    const basics = await this.ports.getRepoBasics(repoId);
    if (!basics) throw new NotFoundError('Repo not found');
    const accepted: ConventionRow[] = await this.ports.repo.listByStatus(
      workspaceId,
      repoId,
      'accepted',
    );
    if (accepted.length === 0) {
      throw new ValidationError('Accept at least one convention before creating a skill');
    }

    const body = input.body?.trim() || buildSkillBody(accepted, basics.fullName);
    const evidenceFiles = [
      ...new Set(accepted.map((c) => c.evidencePath).filter((p): p is string => !!p)),
    ];

    return this.ports.upsertSkill(workspaceId, {
      name: input.name?.trim() || CONVENTIONS_SKILL_NAME,
      description:
        input.description?.trim() ||
        `Conventions extracted from ${basics.fullName} and approved by a maintainer.`,
      body,
      evidenceFiles,
    });
  }

  /** A fresh id for one scan, shared by the job payload and the written rows. */
  static newScanId(): string {
    return randomUUID();
  }
}

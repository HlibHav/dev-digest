import type {
  AgentContext,
  ContextAttachmentsInput,
  ContextDocContent,
  ContextDocList,
  ContextUsedBy,
  IndexStatus,
  RepoDocs,
  SkillContext,
  SpecDocSnapshot,
} from '@devdigest/shared';
import { renderProjectContextBlock } from '@devdigest/reviewer-core';
import { NotFoundError } from '../../platform/errors.js';
import { buildEffectiveDocList, categorizeDocPath } from './helpers.js';

/**
 * project-context service. Takes the ports it uses (onion step 5): a store for
 * the attachments, the docs adapter, a token counter and a clock. It runs no git
 * command: the docs are whatever the clone holds right now.
 */

export interface ProjectContextStore {
  getRepo(workspaceId: string, repoId: string): Promise<{ id: string; clonePath: string | null } | undefined>;
  agentInWorkspace(workspaceId: string, agentId: string): Promise<boolean>;
  skillInWorkspace(workspaceId: string, skillId: string): Promise<boolean>;
  agentPaths(agentId: string): Promise<string[]>;
  setAgentPaths(agentId: string, paths: string[]): Promise<void>;
  skillPaths(skillId: string): Promise<string[]>;
  setSkillPaths(skillId: string, paths: string[]): Promise<void>;
  enabledSkillDocs(
    workspaceId: string,
    agentId: string,
  ): Promise<{ skillId: string; skillName: string; paths: string[] }[]>;
  usedByCounts(workspaceId: string): Promise<Map<string, ContextUsedBy>>;
}

export interface ProjectContextPorts {
  repo: ProjectContextStore;
  docs: RepoDocs;
  tokenizer: { count(text: string): number };
  now: () => Date;
}

export interface ResolveForRunInput {
  workspaceId: string;
  agentId: string;
  clonePath: string | null;
  changedPaths: readonly string[];
}

interface ScanEntry {
  path: string;
  size: number;
  tokens: number;
}
interface ScanCache {
  scannedAt: Date;
  entries: ScanEntry[];
}

const NO_USE: ContextUsedBy = { agents: 0, skills: 0 };
const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export class ProjectContextService {
  /** Per-repo scan, filled on first read and replaced by `rescan`. */
  private scans = new Map<string, ScanCache>();

  constructor(private ports: ProjectContextPorts) {}

  async listDocs(workspaceId: string, repoId: string): Promise<ContextDocList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) return { cloned: false, scanned_at: null, files: [] };
    const scan = await this.scanFor(repoId, repo.clonePath);
    const usedBy = await this.ports.repo.usedByCounts(workspaceId);
    return {
      cloned: true,
      scanned_at: scan.scannedAt.toISOString(),
      files: scan.entries.map((e) => ({
        path: e.path,
        size: e.size,
        category: categorizeDocPath(e.path),
        tokens: e.tokens,
        used_by: usedBy.get(e.path) ?? NO_USE,
      })),
    };
  }

  async rescan(workspaceId: string, repoId: string): Promise<IndexStatus> {
    const repo = await this.requireRepo(workspaceId, repoId);
    this.scans.delete(repoId);
    const count = repo.clonePath ? (await this.scanFor(repoId, repo.clonePath)).entries.length : 0;
    return { status: 'done', pct: 100, message: `${count} docs`, chunks_indexed: null };
  }

  async readDoc(workspaceId: string, repoId: string, path: string): Promise<ContextDocContent> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new NotFoundError('Doc not found');
    const scan = await this.scanFor(repoId, repo.clonePath);
    const entry = scan.entries.find((e) => e.path === path);
    if (!entry) throw new NotFoundError('Doc not found');
    const content = await this.ports.docs.read(repo.clonePath, path);
    if (content === null) throw new NotFoundError('Doc not found');
    return { path, content, tokens: entry.tokens };
  }

  async getAgentContext(workspaceId: string, agentId: string, repoId: string): Promise<AgentContext> {
    const repo = await this.requireRepo(workspaceId, repoId);
    await this.requireAgent(workspaceId, agentId);
    const known = await this.knownTokens(repoId, repo.clonePath);
    const [own, skillDocs] = await Promise.all([
      this.ports.repo.agentPaths(agentId),
      this.ports.repo.enabledSkillDocs(workspaceId, agentId),
    ]);
    return {
      attached: own.map((path, order) => ({
        path,
        order,
        tokens: known.get(path) ?? 0,
        present: known.has(path),
      })),
      inherited: skillDocs.flatMap((s) =>
        s.paths.map((path) => ({
          path,
          skill_id: s.skillId,
          skill_name: s.skillName,
          tokens: known.get(path) ?? 0,
          present: known.has(path),
        })),
      ),
    };
  }

  async setAgentPaths(
    workspaceId: string,
    agentId: string,
    paths: string[],
  ): Promise<ContextAttachmentsInput> {
    await this.requireAgent(workspaceId, agentId);
    await this.ports.repo.setAgentPaths(agentId, paths);
    return { paths };
  }

  async getSkillContext(workspaceId: string, skillId: string, repoId: string): Promise<SkillContext> {
    const repo = await this.requireRepo(workspaceId, repoId);
    await this.requireSkill(workspaceId, skillId);
    const known = await this.knownTokens(repoId, repo.clonePath);
    const paths = await this.ports.repo.skillPaths(skillId);
    const attached = paths.map((path, order) => ({
      path,
      order,
      tokens: known.get(path) ?? 0,
      present: known.has(path),
    }));

    const specs: { path: string; text: string }[] = [];
    for (const a of attached) {
      if (!a.present || !repo.clonePath) continue;
      const text = await this.ports.docs.read(repo.clonePath, a.path);
      if (text !== null) specs.push({ path: a.path, text });
    }
    // The same renderer a run uses, so the preview cannot drift from what is sent.
    const rendered = renderProjectContextBlock(specs);
    return {
      attached,
      serialized: rendered ? `## Project context\n${rendered.block}` : null,
    };
  }

  async setSkillPaths(
    workspaceId: string,
    skillId: string,
    paths: string[],
  ): Promise<ContextAttachmentsInput> {
    await this.requireSkill(workspaceId, skillId);
    await this.ports.repo.setSkillPaths(skillId, paths);
    return { paths };
  }

  /**
   * The docs one run injects, each with its status. Never throws: a failure of
   * the attachment store loses the context, not the review.
   */
  async resolveForRun(
    input: ResolveForRunInput,
    log: (msg: string) => void,
  ): Promise<SpecDocSnapshot[]> {
    let effective;
    try {
      const [own, skillDocs] = await Promise.all([
        this.ports.repo.agentPaths(input.agentId),
        this.ports.repo.enabledSkillDocs(input.workspaceId, input.agentId),
      ]);
      effective = buildEffectiveDocList(own, skillDocs);
    } catch (err) {
      log(`project context: could not resolve attachments — ${errMessage(err)}`);
      return [];
    }

    const changed = new Set(input.changedPaths);
    const out: SpecDocSnapshot[] = [];
    for (const doc of effective) {
      const base = { path: doc.path, origin: doc.origin, skill_name: doc.skillName, tokens: null };
      if (!input.clonePath) {
        out.push({ ...base, status: 'unreadable', text: null });
        continue;
      }
      let text: string | null;
      try {
        text = await this.ports.docs.read(input.clonePath, doc.path);
      } catch (err) {
        log(`project context: ${doc.path} unreadable — ${errMessage(err)}`);
        out.push({ ...base, status: 'unreadable', text: null });
        continue;
      }
      if (text === null) {
        log(`project context: ${doc.path} not found`);
        out.push({ ...base, status: 'not_found', text: null });
        continue;
      }
      if (changed.has(doc.path)) {
        log(`project context: ${doc.path} is modified by this PR — injecting the default-branch version`);
        out.push({ ...base, status: 'modified_by_pr', text });
        continue;
      }
      out.push({ ...base, status: 'injected', text });
    }
    return out;
  }

  // ---------------------------------------------------------------- internals

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.ports.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  private async requireAgent(workspaceId: string, agentId: string) {
    if (!(await this.ports.repo.agentInWorkspace(workspaceId, agentId))) {
      throw new NotFoundError('Agent not found');
    }
  }

  private async requireSkill(workspaceId: string, skillId: string) {
    if (!(await this.ports.repo.skillInWorkspace(workspaceId, skillId))) {
      throw new NotFoundError('Skill not found');
    }
  }

  private async scanFor(repoId: string, clonePath: string): Promise<ScanCache> {
    const cached = this.scans.get(repoId);
    if (cached) return cached;
    const listed = await this.ports.docs.list(clonePath);
    const scan: ScanCache = {
      scannedAt: this.ports.now(),
      entries: listed.map((d) => ({
        path: d.path,
        size: d.size,
        tokens: this.ports.tokenizer.count(d.content),
      })),
    };
    this.scans.set(repoId, scan);
    return scan;
  }

  /** path → tokens for the repo's current docs; empty when there is no clone. */
  private async knownTokens(repoId: string, clonePath: string | null): Promise<Map<string, number>> {
    if (!clonePath) return new Map();
    const scan = await this.scanFor(repoId, clonePath);
    return new Map(scan.entries.map((e) => [e.path, e.tokens]));
  }
}

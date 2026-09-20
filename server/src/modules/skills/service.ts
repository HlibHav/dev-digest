import type { Skill, SkillType } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import type { SkillsRepository } from './repository.js';
import {
  toSkillDto,
  toSkillVersionDto,
  sanitizeSkillBody,
  sanitizeSkillDescription,
  sanitizeSkillName,
  type SkillVersionDto,
} from './helpers.js';
import {
  EXTRACTED_SKILL_SOURCE,
  IMPORT_MAX_UPLOAD_BYTES,
  IMPORTED_SKILL_SOURCE,
} from './constants.js';
import { parseSkillUpload, type SkillImportPreview } from './import.js';

/**
 * Skills service. A skill is text and nothing else: it has no tools, reads no
 * files and executes nothing. Its entire effect on a review is the characters
 * it contributes to the assembled prompt.
 *
 * Import is parse-and-preview only — `previewImport` writes nothing, so the row
 * appears only when the user confirms and the client calls `create`.
 */

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  /** Set by the import flow; a hand-written skill is always `manual`. */
  imported?: boolean;
  evidence_files?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  /**
   * Takes the one port it calls, not the whole `Container`.
   *
   * The older services take the container and build their own repository from
   * `container.db`; `.claude/rules/onion-boundaries.md` grandfathers those and
   * asks new code for the ports instead, so the service can be unit-tested
   * against a fake repository with no container in sight.
   */
  constructor(private repo: SkillsRepository) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const [rows, counts] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.agentCounts(workspaceId),
    ]);
    return rows.map((row) => toSkillDto(row, counts.get(row.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    const counts = await this.repo.agentCounts(workspaceId);
    return toSkillDto(row, counts.get(row.id) ?? 0);
  }

  /**
   * Create a skill. An imported skill lands disabled and marked as imported, so
   * it cannot reach a prompt before someone reads it — and when it does, its
   * body is delimiter-wrapped (see `../decisions/2026-09-20-skill-trust-model.md`).
   */
  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const body = sanitizeSkillBody(input.body);
    if (body.length === 0) throw new ValidationError('A skill needs a body');

    const row = await this.repo.insert({
      workspaceId,
      name: sanitizeSkillName(input.name),
      description: sanitizeSkillDescription(input.description ?? ''),
      type: input.type,
      source: input.imported ? IMPORTED_SKILL_SOURCE : 'manual',
      body,
      enabled: input.imported ? false : (input.enabled ?? true),
      ...(input.evidence_files !== undefined ? { evidenceFiles: input.evidence_files } : {}),
    });
    return toSkillDto(row);
  }

  /**
   * Create-or-update a skill this app generated itself, keyed by name.
   *
   * The conventions extractor calls this every time the user presses "Create
   * skill". `skills` has no unique constraint on (workspace_id, name), so a
   * plain `create` would leave a second `repo-conventions` behind the first
   * time someone accepts another candidate and creates again. Updating instead
   * keeps exactly one skill and — because the body changed — bumps its version
   * and snapshots the previous one, which is what fills the Versioning tab.
   *
   * `source` is `extracted`, not `imported_url`: this body is ours, assembled
   * from snippets already proven to exist in the repo, so it is trusted text
   * and lands enabled.
   */
  async upsertExtracted(
    workspaceId: string,
    input: { name: string; description: string; body: string; evidenceFiles?: string[] },
  ): Promise<Skill> {
    const body = sanitizeSkillBody(input.body);
    if (body.length === 0) throw new ValidationError('A skill needs a body');
    const name = sanitizeSkillName(input.name);
    const description = sanitizeSkillDescription(input.description);

    const existing = await this.repo.getByName(workspaceId, name);
    if (existing) {
      const row = await this.repo.update(workspaceId, existing.id, {
        description,
        body,
        ...(input.evidenceFiles !== undefined ? { evidenceFiles: input.evidenceFiles } : {}),
      });
      // `update` returns undefined only if the row vanished between the two
      // statements; falling back to the row we read keeps the caller typed.
      return toSkillDto(row ?? existing);
    }

    const row = await this.repo.insert({
      workspaceId,
      name,
      description,
      type: 'convention',
      source: EXTRACTED_SKILL_SOURCE,
      body,
      enabled: true,
      ...(input.evidenceFiles !== undefined ? { evidenceFiles: input.evidenceFiles } : {}),
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    if (patch.body !== undefined && sanitizeSkillBody(patch.body).length === 0) {
      throw new ValidationError('A skill needs a body');
    }
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: sanitizeSkillName(patch.name) } : {}),
      ...(patch.description !== undefined
        ? { description: sanitizeSkillDescription(patch.description) }
        : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: sanitizeSkillBody(patch.body) } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Body history for a skill, newest first. Workspace-scoped: returns undefined
   * when the skill isn't in this workspace (the route maps that to 404) so
   * snapshots can't be read across tenants.
   */
  async listVersions(
    workspaceId: string,
    skillId: string,
  ): Promise<SkillVersionDto[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  async getVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersionDto | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(skillId, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /**
   * Parse an uploaded markdown file or archive into a preview. Nothing is
   * written: the user confirms what they see, and the client posts it to
   * `create` with `imported: true`.
   */
  previewImport(filename: string, contentBase64: string): SkillImportPreview {
    // The base64 SHAPE is the route schema's job: `Buffer.from(…, 'base64')`
    // never throws, it just drops characters outside the alphabet, so a
    // try/catch here would be unreachable and the check has to happen at the
    // edge. What is left to guard is what the bytes turn out to be.
    const bytes = new Uint8Array(Buffer.from(contentBase64, 'base64'));
    if (bytes.byteLength === 0) throw new ValidationError('Upload is empty');
    if (bytes.byteLength > IMPORT_MAX_UPLOAD_BYTES) {
      throw new ValidationError(`Upload is larger than ${IMPORT_MAX_UPLOAD_BYTES} bytes`);
    }
    return parseSkillUpload(filename, bytes);
  }
}

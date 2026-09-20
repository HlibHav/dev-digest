import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { MAX_SKILL_DESCRIPTION_CHARS, MAX_SKILL_NAME_CHARS } from './constants.js';

/**
 * Pure helpers for the skills module — row ⇄ DTO mapping, the version-bump rule
 * and prompt-safe normalisation. No I/O. The trust classification
 * (`isSkillUntrusted`) is a contract-level fact and lives in `@devdigest/shared`,
 * because the client badges the same sources as needing vetting.
 */

/** Control characters that must never reach a prompt (C0 + DEL, keeping \n and \t). */
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
/** Every C0 control including \n and \t — used where the value must stay one line. */
const CONTROL_CHARS_AND_BREAKS = /[\x00-\x1f\x7f]+/g;

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow, agentCount?: number): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    // Omitted rather than 0 when the caller didn't ask for it, so a single-skill
    // read never claims "linked to no agents" on the strength of not counting.
    ...(agentCount !== undefined ? { agent_count: agentCount } : {}),
  };
}

/** A single immutable body snapshot. Module-local: there is no shared contract. */
export interface SkillVersionDto {
  skill_id: string;
  version: number;
  body: string;
  created_at: string;
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersionDto {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * True when a patch changes the skill's body.
 *
 * Only the body is versioned, because `skill_versions` stores only
 * `(skill_id, version, body, created_at)` — a name, description or type edit
 * therefore neither bumps `skills.version` nor leaves a snapshot. That is a
 * deliberate divergence from `agents`, where any config field bumps the version;
 * changing it would need a migration. Don't "fix" it here.
 */
export function isBodyChange(existing: Pick<SkillRow, 'body'>, patch: { body?: string }): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

/**
 * Normalize a skill name: one line, no control characters, capped.
 *
 * The name reaches the assembled prompt as a heading, so a newline in it could
 * forge a section header (`## Diff to review`) and change what the model thinks
 * it is reading. Collapsing whitespace here is prompt integrity, not cosmetics.
 */
export function sanitizeSkillName(raw: string): string {
  return raw.replace(CONTROL_CHARS_AND_BREAKS, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SKILL_NAME_CHARS);
}

/** Same treatment for a description, which is the skill's interface line. */
export function sanitizeSkillDescription(raw: string): string {
  return raw
    .replace(CONTROL_CHARS_AND_BREAKS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SKILL_DESCRIPTION_CHARS);
}

/**
 * Normalize a skill body: normalize CRLF, drop control characters other than
 * newline and tab, trim the tail. The body is prompt text, so anything that
 * cannot be printed has no business in it.
 */
export function sanitizeSkillBody(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trimEnd();
}

import type { SkillSource, SkillType } from '@devdigest/shared';

/** Constants for the skills module. */

/** Initial version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Type a skill gets when neither the caller nor the imported file says otherwise. */
export const DEFAULT_SKILL_TYPE: SkillType = 'custom';

/** Source recorded for a skill that came in through the import flow. */
export const IMPORTED_SKILL_SOURCE: SkillSource = 'imported_url';

/** Hard caps for the import endpoint. */
export const IMPORT_MAX_UPLOAD_BYTES = 1_000_000;
/** A single skill body never legitimately exceeds this. Also the zip-bomb gate. */
export const IMPORT_MAX_BODY_BYTES = 512 * 1024;
/** Entries an archive may contain before we stop listing them in the preview. */
export const IMPORT_MAX_ENTRIES = 200;

/** Longest name we accept; longer ones are truncated by `sanitizeSkillName`. */
export const MAX_SKILL_NAME_CHARS = 120;
/** Longest description we accept. */
export const MAX_SKILL_DESCRIPTION_CHARS = 500;

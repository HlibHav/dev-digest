/* Literals for convention extraction. Sampling limits live here so the pure
   helpers stay free of magic numbers and a test can import the same values. */

/** Job kind registered on the shared JobRunner. */
export const CONVENTIONS_JOB_KIND = 'conventions-extract';

/** The single skill approved candidates are assembled into. */
export const CONVENTIONS_SKILL_NAME = 'repo-conventions';

/** `schemaName` the LLM adapter keys structured fixtures on. */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/** How many ranked source files to sample. Fixed by the lesson brief. */
export const SAMPLE_FILE_COUNT = 12;

/** Per-file budget. A sampled file is evidence, not the whole story — the first
    N lines carry the imports, naming and error handling a convention lives in. */
export const SAMPLE_MAX_LINES = 120;
export const SAMPLE_MAX_CHARS = 6_000;

/** Whole-prompt ceiling for the sampled text, in tokens. */
export const SAMPLE_TOKEN_BUDGET = 40_000;

/** Config files are read verbatim — they ARE the declared conventions. Matched
    against the repo root only, in this order. */
export const CONFIG_SAMPLE_PATHS: readonly string[] = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.cjs',
  'tsconfig.json',
  'tsconfig.base.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
  'prettier.config.mjs',
  '.editorconfig',
] as const;

/** Below this the model is guessing; the row is written but the UI can grey it. */
export const MIN_CONFIDENCE = 0.3;

/** Upper bound on rows one scan may write, so a runaway response can't flood the table. */
export const MAX_CANDIDATES = 40;

/** Our own ceiling on the model call, kept under JobRunner's 120s timeout so a
    slow extraction fails HERE — where it is not retried — instead of being
    retried twice at full price. */
export const EXTRACTION_TIMEOUT_MS = 90_000;

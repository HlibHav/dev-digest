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
    N lines carry the imports, naming and error handling a convention lives in.
    Kept small on purpose: 12 files at 6k characters took a cheap model past the
    120s job window, and a scan that times out teaches nothing. */
export const SAMPLE_MAX_LINES = 70;
export const SAMPLE_MAX_CHARS = 2_800;

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

/** Per-ATTEMPT ceiling handed to the provider. Note the providers apply their
    `timeoutMs` inside their own retry loop (`adapters/llm/openai.ts:108`), so
    this alone does not bound the call — see the total budget below. */
export const EXTRACTION_TIMEOUT_MS = 70_000;

/**
 * Ceiling on the WHOLE model call, enforced by us.
 *
 * JobRunner times out at 120s and then RETHROWS, which both re-runs the handler
 * and — since nothing awaits `job.done` — would otherwise take the process down
 * with an unhandled rejection. Failing at our own deadline first keeps the
 * failure ours: recorded on the job row, paid for once.
 */
export const EXTRACTION_TOTAL_BUDGET_MS = 100_000;

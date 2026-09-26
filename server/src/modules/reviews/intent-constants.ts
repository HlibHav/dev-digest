/* Literals for PR intent derivation. Sampling caps, budgets and the datamark
   character live here so the pure helpers (`intent-helpers.ts`) stay free of
   magic numbers and a test can import the same values. */

/** `schemaName` the LLM adapter keys structured fixtures on. */
export const INTENT_SCHEMA_NAME = 'PrIntentExtraction';

/**
 * Bumped whenever the intent prompt (system template or `renderIntentSources`
 * shape) changes meaningfully — included in the cache key (`input_hash`) so a
 * prompt change invalidates every cached intent instead of silently reusing a
 * classification made under the old wording. [D7]
 */
export const INTENT_PROMPT_VERSION = 'v3';

/**
 * Whitespace runs in every untrusted source sent to the intent model are
 * replaced with this marker before the text is wrapped — a lightweight
 * "datamarking" defense that makes injected instructions harder to parse as
 * instructions while the model can still read the marked text.
 */
export const INTENT_DATAMARK = 'ˆ'; // ˆ

/** A body shorter than this (after sanitising) is not "meaningful" for confidence. */
export const INTENT_MIN_BODY_CHARS = 200;

/** Extensions treated as a plan/spec "doc" — [D2]/acceptance criterion 4. */
export const INTENT_DOC_EXTENSIONS: readonly string[] = ['.md', '.mdx', '.txt', '.rst'];

// ---- Data sources: read order + per-source caps (see the plan's table) ----
export const INTENT_MAX_TITLE_CHARS = 300;
export const INTENT_MAX_BODY_CHARS = 6000;
export const INTENT_MAX_ISSUES = 3;
export const INTENT_MAX_ISSUE_CHARS = 4000;
export const INTENT_MAX_TICKETS = 5;
export const INTENT_MAX_DOCS = 3;
export const INTENT_MAX_DOC_CHARS = 8000;
export const INTENT_MAX_BRANCH_CHARS = 200;
export const INTENT_MAX_COMMITS = 20;
/** Per-subject cap — a commit subject is untrusted text like any other source
    and must be sanitised + capped before it reaches the prompt. */
export const INTENT_MAX_COMMIT_CHARS = 200;
export const INTENT_MAX_PATHS = 50;
/** Per-path cap — a path is sanitised like any other untrusted source. */
export const INTENT_MAX_PATH_CHARS = 300;

/** Per-ATTEMPT ceiling handed to the provider (see conventions/constants.ts for why
    this alone does not bound the call — providers apply it inside their own retry loop). */
export const INTENT_TIMEOUT_MS = 20_000;

/** Ceiling on the WHOLE derive() call (sources + the model call), enforced by us. */
export const INTENT_TOTAL_BUDGET_MS = 30_000;

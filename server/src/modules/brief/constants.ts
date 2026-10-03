/* Literals for the PR Brief. Caps, budgets and the schema name live here so the
   pure helpers stay free of magic numbers and a test can import the same values. */

/** `schemaName` the LLM adapter keys structured fixtures on. */
export const BRIEF_SCHEMA_NAME = 'PrBriefModelAnswer';

/** Stored-contract caps; the model's answer is cut to them in code (AC-22). */
export const BRIEF_MAX_RISKS = 5;
export const BRIEF_MAX_FOCUS = 6;

/** Stored-contract text limits; longer model text is cut, not rejected (AC-22a). */
export const BRIEF_MAX_SUMMARY_CHARS = 1200;
export const BRIEF_MAX_RISK_TITLE_CHARS = 160;
export const BRIEF_MAX_RISK_EXPLANATION_CHARS = 800;
export const BRIEF_MAX_FOCUS_REASON_CHARS = 300;

/** System prompt plus user message, counted with the bounded tokenizer (AC-14). */
export const BRIEF_TOKEN_BUDGET = 8000;

/** One generation, input assembly included (AC-31). */
export const BRIEF_DEADLINE_MS = 60_000;

/** Linked issues are looked up for the first parsed reference only. */
export const BRIEF_MAX_ISSUES = 1;

/** Character cap handed to the sanitiser for the PR body, the issue body and each spec. */
export const BRIEF_MAX_TEXT_CHARS = 20_000;

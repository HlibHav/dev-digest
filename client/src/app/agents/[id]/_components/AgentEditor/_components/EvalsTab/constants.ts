/** Query parameter that opens a case in the editor (`?tab=evals&case=<id>`). */
export const CASE_PARAM = "case";

/** Shapes that look like a credential; masked in previews until the user reveals them (AC-44). */
export const SECRET_PATTERNS: readonly RegExp[] = [
  /sk_(?:live|test)_[A-Za-z0-9]{6,}/g,
  /gh[pousr]_[A-Za-z0-9]{6,}/g,
  /AKIA[0-9A-Z]{8,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
];

/** What a masked credential is replaced with. */
export const MASK = "••••";

/** CSS-var colour per last-run status. */
export const STATUS_COLOR = {
  passed: "var(--ok)",
  failed: "var(--crit)",
  errored: "var(--warn)",
  running: "var(--accent)",
  neverRun: "var(--text-muted)",
} as const;

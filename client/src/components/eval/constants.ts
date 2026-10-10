/** Shared eval constants: colour tokens and the polling-free display rules. */

/** A null metric reads as an em dash, never as 0% or 100% (AC-23). */
export const NONE = "—";

/** Deltas below half a point (or half a cent) are shown as flat. */
export const FLAT_PTS = 0.005;
export const FLAT_USD = 0.005;

export const DELTA_COLOR = {
  good: "var(--ok)",
  bad: "var(--crit)",
  neutral: "var(--text-muted)",
} as const;

/** Constants for the DiffViewer. */
import type { SmartDiffRole } from "@/lib/types";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Role → CSS-var colour token for the RoleGroup header square. Reuses
 *  existing tokens — no new palette. */
export const ROLE_COLOR_VAR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  tests: "var(--sugg)",
  wiring: "var(--warn)",
  docs: "var(--info)",
  boilerplate: "var(--text-muted)",
};

/** Roles whose RoleGroup starts collapsed. Client-local: it only needs to
 *  name its own five role keys, not match the server's display order. */
export const COLLAPSED_BY_DEFAULT: ReadonlySet<SmartDiffRole> = new Set(["docs", "boilerplate"]);

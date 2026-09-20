import type { SkillType } from "@devdigest/shared";

/** Constants for the Skills library view. */

/** Card grid template — same responsive auto-fill as the Agents list. */
export const CARD_GRID_COLS = "repeat(auto-fill, minmax(260px, 1fr))";

/** Type options in the editor, in the order the select shows them. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Accepted uploads. The parser checks the magic number too, so this is a hint. */
export const IMPORT_ACCEPT = ".md,.markdown,.zip";

/** Colour per skill type, mirroring the severity/category token palette. */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

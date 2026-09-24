import type { SkillType } from "@devdigest/shared";

/** Colour per skill type, from the shared token palette. */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

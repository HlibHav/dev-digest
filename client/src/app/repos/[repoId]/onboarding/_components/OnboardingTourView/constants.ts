import type { IconName } from "@devdigest/ui";

/** Icon per section kind; the section titles themselves come from the stored tour. */
export const SECTION_ICONS: Record<string, IconName> = {
  architecture: "Boxes",
  critical_paths: "Activity",
  run_locally: "Command",
  reading_path: "ListChecks",
  first_tasks: "Target",
};

export const FALLBACK_ICON: IconName = "FileText";
export const COPIED_RESET_MS = 2000;

/** i18n label key per skeleton reason. */
export const STATUS_KEY = {
  llm_failed: "status.llmFailed",
  timed_out: "status.timedOut",
  index_unavailable: "status.indexUnavailable",
  error: "status.error",
} as const;

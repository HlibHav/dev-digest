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

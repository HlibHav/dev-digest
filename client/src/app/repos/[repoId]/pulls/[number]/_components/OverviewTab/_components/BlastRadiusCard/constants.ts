import type { BlastDegradedReason } from "@devdigest/shared";

/** Maps the server's `reason` enum to the blast.json label key for it —
    never the text itself (frontend-ui-architecture rule 5). */
export const REASON_LABEL_KEY: Record<BlastDegradedReason, string> = {
  no_data: "reason.noData",
  index_partial: "reason.indexPartial",
  index_failed: "reason.indexFailed",
  repo_too_large: "reason.repoTooLarge",
  flag_off: "reason.flagOff",
};

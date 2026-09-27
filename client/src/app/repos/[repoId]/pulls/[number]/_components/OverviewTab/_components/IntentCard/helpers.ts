import type { IntentSource } from "@devdigest/shared";
import { MAX_SOURCES_SHOWN } from "./constants";

/** Sources the derivation actually used, capped for display. */
export function usedSources(sources: IntentSource[] | null | undefined): IntentSource[] {
  return (sources ?? []).filter((s) => s.used).slice(0, MAX_SOURCES_SHOWN);
}

/** Sources that were considered but didn't exist (e.g. no linked issue). */
export function missingSources(sources: IntentSource[] | null | undefined): IntentSource[] {
  return (sources ?? []).filter((s) => !s.used).slice(0, MAX_SOURCES_SHOWN);
}

import type { IntentConfidence } from "@devdigest/shared";

/** Confidence badge colours (CSS-var tokens) + the i18n key for its label. */
export const CONFIDENCE_STYLE: Record<
  IntentConfidence,
  { color: string; bg: string; labelKey: `confidence.${IntentConfidence}` }
> = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)", labelKey: "confidence.high" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)", labelKey: "confidence.medium" },
  low: { color: "var(--text-muted)", bg: "var(--bg-hover)", labelKey: "confidence.low" },
};

/** Cap the sources list so a PR with a huge commit list doesn't flood the card. */
export const MAX_SOURCES_SHOWN = 8;

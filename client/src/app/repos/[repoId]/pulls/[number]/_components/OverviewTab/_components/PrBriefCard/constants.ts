import type { RiskSeverity } from "@devdigest/shared";

/** CSS-var colour per risk severity: the icon colour that goes with the severity text. */
export const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--info)",
};

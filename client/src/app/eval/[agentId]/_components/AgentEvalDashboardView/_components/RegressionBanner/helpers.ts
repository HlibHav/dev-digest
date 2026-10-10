/* Pure helpers for the per-agent Eval Dashboard. No React import. */
import type { EvalMetricName } from "@devdigest/shared";

export const METRIC_LABEL_KEY: Record<EvalMetricName, string> = {
  recall: "metric.recall",
  precision: "metric.precision",
  citation_accuracy: "metric.citation",
};

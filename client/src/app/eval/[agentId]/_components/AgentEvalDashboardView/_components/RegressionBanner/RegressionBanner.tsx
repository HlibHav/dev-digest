/* RegressionBanner — names each metric that dropped on the latest run, with its drop in points. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalRegressionAlert } from "@devdigest/shared";
import { runLabel } from "@/components/eval/helpers";
import { METRIC_LABEL_KEY } from "./helpers";
import { s } from "./styles";

export function RegressionBanner({ alert }: { alert: EvalRegressionAlert | null }) {
  const t = useTranslations("eval");
  if (!alert) return null;
  const metrics = alert.drops
    .map((d) => t("dashboard.regressionItem", { metric: t(METRIC_LABEL_KEY[d.metric]), points: d.points }))
    .join(", ");
  return (
    <div role="alert" style={s.banner}>
      {t("dashboard.regression", { metrics, label: runLabel(alert.run_number, alert.agent_version) })}
    </div>
  );
}

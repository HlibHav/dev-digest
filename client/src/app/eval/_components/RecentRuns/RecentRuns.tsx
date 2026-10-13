/* RecentRuns — the latest suite runs across all agents, newest first. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalRecentRun } from "@devdigest/shared";
import { executedCount, formatCost, formatPct, formatRanAt, runLabel } from "@/components/eval/helpers";
import { newestFirst } from "../EvalDashboardView/helpers";
import { s } from "./styles";

export function RecentRuns({ runs }: { runs: EvalRecentRun[] }) {
  const t = useTranslations("eval");
  return (
    <section>
      <h2 style={s.title}>{t("dashboard.recentAll")}</h2>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>{t("history.run")}</th>
            <th style={s.th}>{t("history.ranAt")}</th>
            <th style={s.th}>{t("history.status")}</th>
            <th style={s.th}>{t("metric.passed")}</th>
            <th style={s.th}>{t("metric.recall")}</th>
            <th style={s.th}>{t("metric.precision")}</th>
            <th style={s.th}>{t("metric.citation")}</th>
            <th style={s.th}>{t("metric.cost")}</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst(runs).map((r) => {
            const label = runLabel(r.run_number, r.agent_version);
            return (
              <tr key={r.id} aria-label={`${r.agent_name} ${label}`}>
                <td style={s.td}>
                  {r.agent_name} <span style={s.muted}>{label}</span>
                </td>
                <td style={{ ...s.td, ...s.muted }}>{formatRanAt(r.started_at)}</td>
                <td style={s.td}>
                  {r.status === "running"
                    ? t("status.running", { done: r.cases_done, total: r.cases_total })
                    : t(`status.${r.status}`)}
                </td>
                <td style={s.td}>
                  {r.status === "running"
                    ? "—"
                    : t("history.pass", { passed: r.cases_passed, executed: executedCount(r) })}
                </td>
                <td style={s.td}>{formatPct(r.recall)}</td>
                <td style={s.td}>{formatPct(r.precision)}</td>
                <td style={s.td}>{formatPct(r.citation_accuracy)}</td>
                <td style={s.td}>{formatCost(r.cost_usd, r.cost_partial)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

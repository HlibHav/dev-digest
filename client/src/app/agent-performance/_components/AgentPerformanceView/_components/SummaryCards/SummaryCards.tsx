/* SummaryCards — Total runs, Total cost, Avg accept rate (pooled) and Most-active agent,
   each titled with the selected period. */
import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card } from "@devdigest/ui";
import type { AgentPerformance } from "@devdigest/shared";
import { formatCost } from "@/components/run-cost-badge/format";
import { formatPercent } from "@/components/model-split";
import { runsLine } from "../../helpers";
import { s } from "./styles";

export function SummaryCards({ data, period }: { data: AgentPerformance; period: string }) {
  const t = useTranslations("agentPerformance");
  const { totals, most_active: active } = data;

  return (
    <div style={s.grid}>
      <Card style={s.card}>
        <div style={s.title}>{t("cards.totalRuns", { period })}</div>
        <div style={s.value}>{totals.runs}</div>
        <div style={s.line}>
          {runsLine(totals.runs_by_status).map((p) => (
            <span key={p.kind === "done" ? "done" : p.status}>
              {p.kind === "done"
                ? t("cards.done", { count: p.count })
                : t("cards.includes", { count: p.count, status: t(`status.${p.status}`) })}
            </span>
          ))}
        </div>
      </Card>

      <Card style={s.card}>
        <div style={s.title}>{t("cards.totalCost", { period })}</div>
        <div style={s.value}>{formatCost(totals.total_cost_usd, 3)}</div>
        <div style={s.line}>
          <span>{t("cards.unpriced", { count: totals.unpriced_runs })}</span>
        </div>
        <div style={s.muted}>{t("estimate")}</div>
        <div style={s.muted}>{t("reconciled")}</div>
      </Card>

      <Card style={s.card}>
        <div style={s.title}>{t("cards.avgAcceptRate", { period })}</div>
        <div style={s.value}>{formatPercent(totals.accept_rate)}</div>
        <div style={s.line}>
          <span>{t("decisions", { count: totals.decisions })}</span>
          {totals.small_sample && totals.decisions > 0 ? (
            <Badge color="var(--warn)" bg="var(--warn-bg)">
              {t("smallSample")}
            </Badge>
          ) : null}
        </div>
        <div style={s.muted}>{t("cards.pooled")}</div>
      </Card>

      <Card style={s.card}>
        <div style={s.title}>{t("cards.mostActive", { period })}</div>
        {active ? (
          <>
            <div style={s.name} title={active.agent_name}>
              {active.agent_name}
            </div>
            <div style={s.line}>
              <span>{t("runs", { count: active.runs })}</span>
              <span>{formatPercent(active.accept_rate)}</span>
              {active.decisions > 0 ? <span>{t("decisions", { count: active.decisions })}</span> : null}
            </div>
          </>
        ) : (
          <>
            <div style={s.value}>—</div>
            <div style={s.muted}>{t("cards.noCurrentAgent")}</div>
          </>
        )}
      </Card>
    </div>
  );
}

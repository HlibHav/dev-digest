/* StatsTab — the agent's own dashboard row for a period: runs by status, cost (estimate),
   averages, accept rate with decisions, pending, last run, and the split by run model.
   The period lives in the agent page URL next to `tab=stats`. Read-only. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Badge, Card, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import {
  PeriodSelector,
  isInvalidRange,
  readPeriod,
  toStatsQuery,
  utcDate,
  writePeriod,
  type PeriodSelection,
} from "@/components/period-selector";
import { ModelSplit, formatDuration, formatPercent } from "@/components/model-split";
import { formatCost } from "@/components/run-cost-badge/format";
import { useAgentStats } from "@/lib/hooks/agent-performance";
import { s } from "./styles";

/** Non-done statuses listed after the done count when non-zero. */
const INCLUDED_STATUSES = ["failed", "running", "cancelled"] as const;

export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const format = useFormatter();
  const router = useRouter();
  const search = useSearchParams();
  const now = useNow();

  const sel = readPeriod(search);
  const query = toStatsQuery(sel, utcDate(now));
  const { data, isPending, isError, refetch } = useAgentStats(agent.id, query);
  const setPeriod = (next: PeriodSelection) =>
    router.replace(`/agents/${encodeURIComponent(agent.id)}?${writePeriod(search, next)}`);

  let body: React.ReactNode = null;
  if (query === null) {
    body = null;
  } else if (isError) {
    body = <ErrorState title={t("stats.loadError")} onRetry={() => void refetch({ cancelRefetch: false })} />;
  } else if (isPending) {
    body = (
      <div style={s.skeletons}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} height={84} />
        ))}
      </div>
    );
  } else {
    const byStatus = data.runs_by_status;
    body = (
      <>
        {data.runs === 0 ? <div style={s.noRuns}>{t("stats.noRuns")}</div> : null}
        <div style={s.grid}>
          <Card style={s.tile}>
            <div style={s.label}>{t("stats.runs")}</div>
            <div style={s.value}>{data.runs}</div>
            <div style={s.line}>
              <span>{t("stats.done", { count: byStatus.done })}</span>
              {INCLUDED_STATUSES.filter((k) => byStatus[k] > 0).map((k) => (
                <span key={k}>{t("stats.includes", { count: byStatus[k], status: t(`stats.status.${k}`) })}</span>
              ))}
            </div>
          </Card>
          <Card style={s.tile}>
            <div style={s.label}>{t("stats.totalCost")}</div>
            <div style={s.value}>{formatCost(data.total_cost_usd, 3)}</div>
            <div style={s.line}>
              <span>{t("stats.unpriced", { count: data.unpriced_runs })}</span>
            </div>
            <div style={s.muted}>{t("stats.estimate")}</div>
          </Card>
          <Card style={s.tile}>
            <div style={s.label}>{t("stats.avgCost")}</div>
            <div style={s.value}>{formatCost(data.avg_cost_usd, 3)}</div>
          </Card>
          <Card style={s.tile}>
            <div style={s.label}>{t("stats.avgDuration")}</div>
            <div style={s.value}>{formatDuration(data.avg_latency_ms)}</div>
          </Card>
          <Card style={s.tile}>
            <div style={s.label}>{t("stats.acceptRate")}</div>
            <div style={s.value}>{formatPercent(data.accept_rate)}</div>
            <div style={s.line}>
              {data.decisions > 0 ? <span>{t("stats.decisions", { count: data.decisions })}</span> : null}
              {data.small_sample && data.decisions > 0 ? (
                <Badge color="var(--warn)" bg="var(--warn-bg)">
                  {t("stats.smallSample")}
                </Badge>
              ) : null}
            </div>
          </Card>
          <Card style={s.tile}>
            <div style={s.label}>{t("stats.pending")}</div>
            <div style={s.value}>{data.pending}</div>
          </Card>
          <Card style={s.tile}>
            <div style={s.label}>{t("stats.lastRun")}</div>
            <div style={s.value}>{data.last_run_at ? format.relativeTime(new Date(data.last_run_at), now) : "—"}</div>
          </Card>
        </div>
        {data.by_model.length > 0 ? (
          <Card>
            <div style={s.section}>{t("stats.splitByModel")}</div>
            <ModelSplit
              rows={data.by_model}
              labels={{
                unknownModel: t("stats.unknownModel"),
                runs: (n) => t("stats.runsCount", { count: n }),
                decisions: (n) => t("stats.decisions", { count: n }),
              }}
            />
          </Card>
        ) : null}
      </>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("stats.title")}</h2>
        <PeriodSelector
          value={sel}
          onChange={setPeriod}
          invalid={isInvalidRange(sel, query)}
          labels={{
            oneDay: t("stats.period.oneDay"),
            thirtyDays: t("stats.period.thirtyDays"),
            custom: t("stats.period.custom"),
            from: t("stats.period.from"),
            to: t("stats.period.to"),
            invalidRange: t("stats.period.invalidRange"),
          }}
        />
      </div>
      {body}
    </div>
  );
}

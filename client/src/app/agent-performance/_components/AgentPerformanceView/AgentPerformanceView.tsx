/* /agent-performance — which agents earn their keep: period selector, four summary
   cards, the per-agent table (sortable, expandable by model) and the cost breakdown.
   Read-only: one GET per period, the period lives in the URL. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useNow, useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import {
  PeriodSelector,
  isInvalidRange,
  readPeriod,
  toStatsQuery,
  utcDate,
  writePeriod,
  type PeriodSelection,
} from "@/components/period-selector";
import { statsSearch, useAgentPerformance } from "@/lib/hooks/agent-performance";
import { SummaryCards } from "./_components/SummaryCards";
import { AgentTable } from "./_components/AgentTable";
import { CostBreakdown } from "./_components/CostBreakdown";
import { periodLabel } from "./helpers";
import { s } from "./styles";

export function AgentPerformanceView() {
  const t = useTranslations("agentPerformance");
  const router = useRouter();
  const search = useSearchParams();
  const now = useNow();

  const sel = readPeriod(search);
  const query = toStatsQuery(sel, utcDate(now));
  const { data, isPending, isError, refetch } = useAgentPerformance(query);

  const setPeriod = (next: PeriodSelection) => router.replace(`/agent-performance?${writePeriod(search, next)}`);
  const label = periodLabel(sel);
  const period = t(label.key, label.values);

  let body: React.ReactNode = null;
  if (query === null) {
    body = null;
  } else if (isError) {
    // cancelRefetch: false — a second Retry while the first is in flight issues no extra GET
    body = <ErrorState title={t("loadError")} onRetry={() => void refetch({ cancelRefetch: false })} />;
  } else if (isPending) {
    body = <ViewSkeleton />;
  } else if (data.totals.runs === 0) {
    body = <EmptyState icon="Activity" title={t("empty.title")} />;
  } else {
    body = (
      <>
        <SummaryCards data={data} period={period} />
        <p style={s.note}>{t("note")}</p>
        <AgentTable
          agents={data.agents}
          deleted={data.deleted_agents}
          onView={(id) => router.push(`/agents/${encodeURIComponent(id)}?tab=stats&${statsSearch(query)}`)}
        />
        <CostBreakdown byAgent={data.cost_by_agent} byModel={data.cost_by_model} total={data.totals.total_cost_usd} />
      </>
    );
  }

  return (
    <AppShell crumb={[{ label: t("title") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <PeriodSelector
            value={sel}
            onChange={setPeriod}
            invalid={isInvalidRange(sel, query)}
            labels={{
              oneDay: t("period.oneDay"),
              thirtyDays: t("period.thirtyDays"),
              custom: t("period.custom"),
              from: t("period.from"),
              to: t("period.to"),
              invalidRange: t("period.invalidRange"),
            }}
          />
        </div>
        <div style={s.body}>{body}</div>
      </div>
    </AppShell>
  );
}

/** Placeholders for the cards, the table rows and the breakdown; no number. */
function ViewSkeleton() {
  return (
    <>
      <div style={s.skeletonCards}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={120} />
        ))}
      </div>
      <div style={s.skeletonRows}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={40} />
        ))}
      </div>
      <div style={s.skeletonBreakdown}>
        <Skeleton height={180} />
        <Skeleton height={180} />
      </div>
    </>
  );
}

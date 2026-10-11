/* /eval/:agentId — one agent's eval dashboard: metric cards with deltas, regression
   banner, trend, run history, compare and a Run eval action polled while it runs. */
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { CompareModal } from "@/components/eval/CompareModal";
import { MetricStat } from "@/components/eval/MetricStat";
import { RunHistoryTable } from "@/components/eval/RunHistoryTable";
import { TrendChart } from "@/components/eval/TrendChart";
import { executedCount, formatCost } from "@/components/eval/helpers";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEvalDashboard, useStartSuiteRun } from "@/lib/hooks/eval";
import { useTrackedSuite } from "@/lib/hooks/eval-tracked-suite";
import { AgentSwitcher } from "./_components/AgentSwitcher";
import { RegressionBanner } from "./_components/RegressionBanner";
import { s } from "./styles";

export function AgentEvalDashboardView({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const { data, isLoading, isError } = useAgentEvalDashboard(agentId);
  const { data: agents } = useAgents();
  const start = useStartSuiteRun();
  const [compare, setCompare] = useState<{ base: string; head: string } | null>(null);

  // `latest` is the latest completed run, so a suite already running on load is found in the history.
  const { progress: running, error: suiteError, track } = useTrackedSuite(agentId, data?.history, data?.cases_total ?? 0);

  const name = data?.agent.name ?? "";
  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    { label: name },
  ];

  const onRun = () =>
    start.mutate(agentId, { onSuccess: (r) => track(r.suite_run_id) });

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState body={t("dashboard.loading")} />
      </AppShell>
    );
  }
  if (isLoading || !data) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <Skeleton height={120} />
        </div>
      </AppShell>
    );
  }

  const { latest, deltas } = data;
  const neverRun = latest === null;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{data.agent.name}</h1>
            <div style={s.subtitle}>{data.agent.model}</div>
          </div>
          <AgentSwitcher
            agents={agents ?? []}
            value={agentId}
            onChange={(id) => router.replace(`/eval/${encodeURIComponent(id)}`)}
          />
          {running ? (
            <span style={s.running} role="status">
              {t("status.running", { done: running.done, total: running.total })}
            </span>
          ) : null}
          {suiteError ? (
            <span style={s.error} role="alert">
              {suiteError.message}
            </span>
          ) : null}
          <Button
            kind="primary"
            size="sm"
            icon="Play"
            disabled={data.cases_total === 0 || start.isPending || running !== null}
            onClick={onRun}
          >
            {t("dashboard.runEvalAgent")}
          </Button>
        </div>

        <RegressionBanner alert={data.alert} />

        <div style={s.stats}>
          <MetricStat label={t("metric.recall")} value={latest?.recall ?? null} delta={deltas.recall} neverRun={neverRun} />
          <MetricStat label={t("metric.precision")} value={latest?.precision ?? null} delta={deltas.precision} neverRun={neverRun} />
          <MetricStat label={t("metric.citation")} value={latest?.citation_accuracy ?? null} delta={deltas.citation_accuracy} neverRun={neverRun} />
        </div>
        {latest ? (
          <div style={s.summary}>
            {t("metric.passed")} {t("history.pass", { passed: latest.cases_passed, executed: executedCount(latest) })} ·{" "}
            {t("metric.cost")} {formatCost(latest.cost_usd, latest.cost_partial)}
          </div>
        ) : null}

        <TrendChart points={data.trend} />

        <div>
          <div style={s.title}>{t("history.title")}</div>
          <RunHistoryTable runs={data.history} onCompare={(base, head) => setCompare({ base, head })} />
        </div>
      </div>
      {compare ? <CompareModal baseId={compare.base} headId={compare.head} onClose={() => setCompare(null)} /> : null}
    </AppShell>
  );
}

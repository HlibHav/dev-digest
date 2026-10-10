/* /eval — Eval Dashboard: every agent's latest suite metrics, run-all, recent runs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalWorkspaceDashboard, useRunAllAgents } from "@/lib/hooks/eval";
import { AgentRow } from "../AgentRow";
import { RecentRuns } from "../RecentRuns";
import { SKIP_LABEL_KEY, hasNoCases } from "./helpers";
import { s } from "./styles";

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const { data, isLoading, isError, refetch } = useEvalWorkspaceDashboard();
  const runAll = useRunAllAgents();

  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];
  const names = new Map((data?.agents ?? []).map((a) => [a.agent_id, a.name]));
  const result = runAll.data;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
            <p style={s.subtitle}>{t("dashboard.subtitle")}</p>
          </div>
          <Button kind="primary" size="sm" icon="Play" disabled={runAll.isPending} onClick={() => runAll.mutate()}>
            {t("dashboard.runAllAgents")}
          </Button>
        </div>

        {result ? (
          <div style={s.result} role="status">
            <div>{t("dashboard.runAllResult", { started: result.started.length, skipped: result.skipped.length })}</div>
            {result.skipped.map((k) => (
              <div key={k.agent_id}>
                {names.get(k.agent_id) ?? k.agent_id}: {t(SKIP_LABEL_KEY[k.reason])}
              </div>
            ))}
          </div>
        ) : null}

        {isLoading ? <Skeleton height={120} /> : null}
        {isError ? <ErrorState body={t("dashboard.loading")} onRetry={() => refetch()} /> : null}
        {data && hasNoCases(data.agents) ? (
          <EmptyState icon="Gauge" title={t("dashboard.emptyTitle")} body={t("dashboard.emptyBody")} />
        ) : null}
        {data && !hasNoCases(data.agents) ? (
          <>
            <h2 style={s.section}>{t("dashboard.agents")}</h2>
            <div style={s.list}>
              {data.agents.map((row) => (
                <AgentRow key={row.agent_id} row={row} />
              ))}
            </div>
            <RecentRuns runs={data.recent_runs} />
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

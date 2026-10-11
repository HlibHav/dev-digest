/* EvalsTab — an agent's regression cases and suite runs: metric cards, the case list,
   run history with compare, and the trend. A running suite is polled until it ends. */
"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { MetricStat } from "@/components/eval/MetricStat";
import { RunHistoryTable } from "@/components/eval/RunHistoryTable";
import { CompareModal } from "@/components/eval/CompareModal";
import { TrendChart } from "@/components/eval/TrendChart";
import { executedCount } from "@/components/eval/helpers";
import {
  useAgentEvalDashboard,
  useDeleteEvalCase,
  useEvalCases,
  useStartSuiteRun,
} from "@/lib/hooks/eval";
import { useTrackedSuite } from "@/lib/hooks/eval-tracked-suite";
import { CASE_PARAM } from "./constants";
import { passingCount } from "./helpers";
import { CaseEditor } from "./_components/CaseEditor";
import { CaseRow } from "./_components/CaseRow";
import { s } from "./styles";

type Editing = string | "new" | null;

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const tm = useTranslations("eval.metric");
  const paramCase = useSearchParams().get(CASE_PARAM);
  const cases = useEvalCases(agent.id);
  const dashboard = useAgentEvalDashboard(agent.id);
  const startSuite = useStartSuiteRun();
  const del = useDeleteEvalCase(agent.id);
  const [pendingRuns, setPendingRuns] = React.useState<Record<string, string>>({});
  const [editing, setEditing] = React.useState<Editing | undefined>(undefined);
  const [compare, setCompare] = React.useState<{ base: string; head: string } | null>(null);

  const dash = dashboard.data;
  const latest = dash?.latest ?? null;
  // `latest` is the latest completed run; a suite still running (e.g. after a reload) is in `history`.
  const { trackedId, progress, running, error: suiteError, reconnecting, track } = useTrackedSuite(agent.id, dash?.history, dash?.cases_total ?? 0);

  // The tracked suite's poll state wins over a start error.
  const notice = suiteError ?? (reconnecting ? null : startSuite.error);

  const list = cases.data ?? [];
  const active: Editing = editing === undefined ? paramCase : editing;
  const editedCase = active && active !== "new" ? list.find((c) => c.id === active) : undefined;
  const { passed, total } = passingCount(list);

  // A start error belongs to the attempt that raised it: tracking another suite (a started one or
  // one adopted from the history) clears it, so it never shadows that suite's own poll state.
  const resetStart = startSuite.reset;
  React.useEffect(() => {
    resetStart();
  }, [trackedId, resetStart]);

  const runAll = () =>
    startSuite.mutate(agent.id, { onSuccess: (a) => track(a.suite_run_id) });

  const closeEditor = (pending?: { caseId: string; caseRunId: string }) => {
    // A Run-on-save run still going: its row keeps polling it so the list refreshes when it ends.
    if (pending) setPendingRuns((prev) => ({ ...prev, [pending.caseId]: pending.caseRunId }));
    setEditing(null);
  };

  const remove = (id: string, name: string) => {
    if (window.confirm(t("evalsTab.deleteConfirm", { name }))) del.mutate(id);
  };

  return (
    <div style={s.wrap}>
      <section>
        <div style={s.head}>
          <span style={s.title}>{t("evalsTab.metricsTitle")}</span>
          <Link href={`/eval/${agent.id}`}>{t("evalsTab.viewDashboard")} →</Link>
        </div>
        {progress ? (
          <div style={s.running} role="status">
            {t("status.running", { done: progress.done, total: progress.total })}
          </div>
        ) : (
          <div style={s.cards}>
            <MetricStat label={tm("recall")} value={latest?.recall ?? null} delta={dash?.deltas.recall ?? null} neverRun={!latest} />
            <MetricStat label={tm("precision")} value={latest?.precision ?? null} delta={dash?.deltas.precision ?? null} neverRun={!latest} />
            <MetricStat label={tm("citation")} value={latest?.citation_accuracy ?? null} delta={dash?.deltas.citation_accuracy ?? null} neverRun={!latest} />
            <div style={s.card}>
              <span style={s.cardLabel}>{tm("passed")}</span>
              <span style={s.cardValue}>
                {latest
                  ? t("history.pass", { passed: latest.cases_passed, executed: executedCount(latest) })
                  : tm("neverRun")}
              </span>
            </div>
          </div>
        )}
      </section>

      <section>
        <div style={s.casesHead}>
          <h2 style={s.h2}>{t("evalsTab.casesHeading")}</h2>
          {total > 0 ? <span style={s.passing}>{t("evalsTab.passing", { passed, total })}</span> : null}
          <span style={s.grow} />
          <Button kind="secondary" icon="Play" disabled={total === 0 || running || startSuite.isPending} onClick={runAll}>
            {t("evalsTab.runAll")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={() => setEditing("new")}>
            {t("evalsTab.newEvalCase")}
          </Button>
        </div>
        {notice ? (
          <p role="alert" style={s.error}>
            {notice.message}
          </p>
        ) : reconnecting ? (
          <p role="status" style={s.notice}>
            {t("reconnecting")}
          </p>
        ) : null}
        <div style={{ ...s.list, marginTop: 12 }}>
          {cases.isPending ? (
            <span style={s.muted}>{t("evalsTab.loadingCases")}</span>
          ) : total === 0 ? (
            <span style={s.muted}>{t("evalsTab.emptyCases")}</span>
          ) : (
            list.map((c) => (
              <CaseRow key={c.id} kase={c} pendingRunId={pendingRuns[c.id]} onEdit={() => setEditing(c.id)} onDelete={() => remove(c.id, c.name)} />
            ))
          )}
        </div>
      </section>

      {dash && dash.history.length > 0 ? (
        <section>
          <h2 style={s.h2}>{t("history.title")}</h2>
          <RunHistoryTable runs={dash.history} onCompare={(base, head) => setCompare({ base, head })} />
        </section>
      ) : null}
      {dash && dash.trend.length > 0 ? <TrendChart points={dash.trend} /> : null}

      {active === "new" || editedCase ? (
        <CaseEditor key={active} agentId={agent.id} case={editedCase} onClose={closeEditor} />
      ) : null}
      {compare ? <CompareModal baseId={compare.base} headId={compare.head} onClose={() => setCompare(null)} /> : null}
    </div>
  );
}

/* AgentRow — one agent on the Eval Dashboard: latest metrics, recall sparkline, link to its page. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import type { EvalWorkspaceAgentRow } from "@devdigest/shared";
import { executedCount, formatPct, formatRanAt, runLabel } from "@/components/eval/helpers";
import { NONE } from "@/components/eval/constants";
import { sparkPoints } from "../EvalDashboardView/helpers";
import { s } from "./styles";

export function AgentRow({ row }: { row: EvalWorkspaceAgentRow }) {
  const t = useTranslations("eval");
  const { latest } = row;
  const points = sparkPoints(row.recall_trend);
  return (
    <Link href={`/eval/${encodeURIComponent(row.agent_id)}`} style={s.row}>
      <span>
        <div style={s.name}>{row.name}</div>
        <div style={s.model}>{row.model}</div>
      </span>
      <span style={latest ? s.metric : s.muted}>{latest ? formatPct(latest.recall) : NONE}</span>
      <span style={latest ? s.metric : s.muted}>{latest ? formatPct(latest.precision) : NONE}</span>
      <span style={latest ? s.metric : s.muted}>{latest ? formatPct(latest.citation_accuracy) : NONE}</span>
      <span style={s.muted}>{points.length >= 2 ? <Sparkline data={points} /> : NONE}</span>
      <span style={s.muted}>
        {latest
          ? t("dashboard.lastRun", {
              label: runLabel(latest.run_number, latest.agent_version),
              date: formatRanAt(latest.started_at),
              passed: latest.cases_passed,
              executed: executedCount(latest),
            })
          : t("status.neverRun")}
      </span>
    </Link>
  );
}

/* RunHistoryTable — recent suite runs, newest first, with a two-run compare picker. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalSuiteRunSummary } from "@devdigest/shared";
import { compareEnabled, executedCount, formatCost, formatPct, formatRanAt, runLabel } from "../helpers";
import { s } from "./styles";

export function RunHistoryTable({
  runs,
  onCompare,
}: {
  runs: EvalSuiteRunSummary[];
  onCompare: (baseId: string, headId: string) => void;
}) {
  const t = useTranslations("eval");
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);

  const rows = [...runs].sort((a, b) => b.run_number - a.run_number);
  const selected = rows.filter((r) => selectedIds.includes(r.id));
  const canCompare = compareEnabled(selected);

  const toggle = (id: string) =>
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const compare = () => {
    // `selected` is newest first: the older run is the base.
    const [head, base] = selected;
    if (!head || !base) return;
    onCompare(base.id, head.id);
  };

  return (
    <div style={s.wrap}>
      <div style={s.toolbar}>
        {selected.length > 0 ? <span style={s.count}>{t("history.selected", { count: selected.length })}</span> : null}
        <Button kind="secondary" size="sm" disabled={!canCompare} onClick={compare}>
          {t("history.compare")}
        </Button>
      </div>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th} />
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
          {rows.map((r) => {
            const label = runLabel(r.run_number, r.agent_version);
            return (
              <tr key={r.id} aria-label={label}>
                <td style={s.td}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={t("history.select", { label })}
                  />
                </td>
                <td style={s.td}>{label}</td>
                <td style={{ ...s.td, ...s.muted }}>{formatRanAt(r.started_at)}</td>
                <td style={s.td}>
                  {r.status === "running"
                    ? t("status.running", { done: r.cases_done, total: r.cases_total })
                    : t(`status.${r.status}`)}
                </td>
                <td style={s.td}>
                  {r.status === "running" ? (
                    "—"
                  ) : (
                    <>
                      {t("history.pass", { passed: r.cases_passed, executed: executedCount(r) })}
                      {r.cases_errored > 0 ? (
                        <span style={s.errored}>{t("history.errored", { count: r.cases_errored })}</span>
                      ) : null}
                    </>
                  )}
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
    </div>
  );
}

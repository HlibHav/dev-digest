/* TrendChart — recall / precision / citation accuracy per suite run. A null metric
   leaves a gap in the line (never a zero) and reads "—" in the tooltip and text list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EvalTrendRunPoint } from "@devdigest/shared";
import { formatCost, formatPct, runLabel } from "../helpers";
import { s } from "./styles";

const SERIES = [
  { key: "recall", labelKey: "metric.recall", color: "var(--accent)" },
  { key: "precision", labelKey: "metric.precision", color: "var(--ok)" },
  { key: "citation_accuracy", labelKey: "metric.citation", color: "var(--warn)" },
] as const;

function pct(v: number | null): number | null {
  return v === null ? null : Math.round(v * 100);
}

export function TrendChart({ points }: { points: EvalTrendRunPoint[] }) {
  const t = useTranslations("eval");
  const ordered = [...points].sort((a, b) => a.run_number - b.run_number);
  const data = ordered.map((p) => ({
    label: runLabel(p.run_number, p.agent_version),
    run: `#${p.run_number}`,
    cost: formatCost(p.cost_usd, false),
    recall: pct(p.recall),
    precision: pct(p.precision),
    citation_accuracy: pct(p.citation_accuracy),
  }));

  return (
    <div>
      <div style={s.title}>{t("trend.title")}</div>
      <div style={s.wrap} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="run" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip
              content={({ payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!row) return null;
                return (
                  <div style={s.tooltip}>
                    <div>{t("trend.tooltip", { label: row.label, cost: row.cost })}</div>
                    {SERIES.map((x) => (
                      <div key={x.key}>
                        {t(x.labelKey)} {row[x.key] === null ? "—" : `${row[x.key]}%`}
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Legend formatter={(_v, entry) => t(SERIES.find((x) => x.key === entry.dataKey)?.labelKey ?? "metric.none")} />
            {SERIES.map((x) => (
              <Line
                key={x.key}
                dataKey={x.key}
                stroke={x.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul aria-label={t("trend.textAlt")} style={s.hidden}>
        {ordered.map((p) => (
          <li key={p.suite_run_id}>
            {runLabel(p.run_number, p.agent_version)}: {t("metric.recall")} {formatPct(p.recall)},{" "}
            {t("metric.precision")} {formatPct(p.precision)}, {t("metric.citation")} {formatPct(p.citation_accuracy)},{" "}
            {t("metric.cost")} {formatCost(p.cost_usd, false)}
          </li>
        ))}
      </ul>
    </div>
  );
}

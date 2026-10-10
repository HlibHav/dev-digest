/* MetricStat — one headline metric with its delta against the previous run. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { DeltaBadge } from "../DeltaBadge";
import { formatPct } from "../helpers";
import { s } from "./styles";

export function MetricStat({
  label,
  value,
  delta,
  neverRun,
}: {
  label: string;
  value: number | null;
  delta: number | null;
  neverRun?: boolean;
}) {
  const t = useTranslations("eval.metric");
  return (
    <div style={s.card}>
      <span style={s.label}>{label}</span>
      {neverRun ? (
        <span style={s.muted}>{t("neverRun")}</span>
      ) : (
        <>
          <span style={s.value}>{formatPct(value)}</span>
          <DeltaBadge delta={delta} unit="pts" />
        </>
      )}
    </div>
  );
}

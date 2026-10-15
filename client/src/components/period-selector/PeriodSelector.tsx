/* PeriodSelector — 1 day / 30 days / Custom range (UTC dates). Controlled: the caller
   keeps the selection in the URL. Labels come in as props; no translations here. */
"use client";

import React from "react";
import type { PeriodSelection } from "./helpers";
import { s } from "./styles";

export interface PeriodSelectorLabels {
  oneDay: string;
  thirtyDays: string;
  custom: string;
  from: string;
  to: string;
  invalidRange: string;
}

const PRESETS = [
  { period: "1d", labelKey: "oneDay" },
  { period: "30d", labelKey: "thirtyDays" },
] as const;

export function PeriodSelector({
  value,
  onChange,
  labels,
  invalid = false,
}: {
  value: PeriodSelection;
  onChange: (sel: PeriodSelection) => void;
  labels: PeriodSelectorLabels;
  /** Both custom dates are set but the range is not requestable; shows `labels.invalidRange`. */
  invalid?: boolean;
}) {
  const id = React.useId();
  const custom = value.period === "custom" ? value : null;
  const pickCustom = () => {
    if (!custom) onChange({ period: "custom", from: null, to: null });
  };

  return (
    <div style={s.wrap}>
      <div style={s.group}>
        {PRESETS.map((p) => (
          <button
            key={p.period}
            type="button"
            aria-pressed={value.period === p.period}
            style={value.period === p.period ? s.segmentOn : s.segment}
            onClick={() => onChange({ period: p.period })}
          >
            {labels[p.labelKey]}
          </button>
        ))}
        <button type="button" aria-pressed={!!custom} style={custom ? s.segmentOn : s.segment} onClick={pickCustom}>
          {labels.custom}
        </button>
      </div>
      {custom ? (
        <div style={s.dates}>
          <label htmlFor={`${id}-from`} style={s.field}>
            {labels.from}
            <input
              id={`${id}-from`}
              type="date"
              style={s.input}
              value={custom.from ?? ""}
              onChange={(e) => onChange({ period: "custom", from: e.target.value || null, to: custom.to })}
            />
          </label>
          <label htmlFor={`${id}-to`} style={s.field}>
            {labels.to}
            <input
              id={`${id}-to`}
              type="date"
              style={s.input}
              value={custom.to ?? ""}
              onChange={(e) => onChange({ period: "custom", from: custom.from, to: e.target.value || null })}
            />
          </label>
        </div>
      ) : null}
      {invalid ? (
        <div style={s.invalid} aria-live="polite">
          {labels.invalidRange}
        </div>
      ) : null}
    </div>
  );
}

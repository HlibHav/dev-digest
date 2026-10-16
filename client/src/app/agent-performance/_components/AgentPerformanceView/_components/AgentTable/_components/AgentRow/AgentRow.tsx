/* AgentRow — one table row plus, when expanded, its split by model from the loaded data. */
import React from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { AgentStatsMetrics } from "@devdigest/shared";
import { formatCost } from "@/components/run-cost-badge/format";
import { ModelSplit, formatDuration, formatPercent } from "@/components/model-split";
import { COLUMN_COUNT } from "../../constants";
import { s } from "./styles";

export function AgentRow({ name, row, onView }: { name: string; row: AgentStatsMetrics; onView?: () => void }) {
  const t = useTranslations("agentPerformance");
  const format = useFormatter();
  const now = useNow();
  const [open, setOpen] = React.useState(false);
  const splitId = React.useId();
  const canExpand = row.by_model.length > 0;
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <>
      <tr>
        <td style={s.nameCell}>
          <div style={s.nameWrap}>
            {canExpand ? (
              <button
                type="button"
                style={s.expand}
                aria-expanded={open}
                aria-controls={open ? splitId : undefined}
                onClick={() => setOpen((o) => !o)}
              >
                <Chevron size={12} aria-hidden />
                {t("table.models")}
              </button>
            ) : null}
            <span style={s.name} title={name}>
              {name}
            </span>
          </div>
          {row.runs === 0 ? <span style={s.sub}>{t("table.noRuns")}</span> : null}
        </td>
        <td style={s.td}>{row.runs}</td>
        <td style={s.td}>{formatCost(row.avg_cost_usd, 3)}</td>
        <td style={s.td}>{formatDuration(row.avg_latency_ms)}</td>
        <td style={s.td}>
          <div style={s.rate}>
            <span style={s.rateValue}>{formatPercent(row.accept_rate)}</span>
            {row.decisions > 0 ? <span style={s.muted}>{t("decisions", { count: row.decisions })}</span> : null}
            {row.small_sample && row.decisions > 0 ? (
              <Badge color="var(--warn)" bg="var(--warn-bg)">
                {t("smallSample")}
              </Badge>
            ) : null}
          </div>
        </td>
        <td style={{ ...s.td, ...s.muted }}>
          {row.last_run_at ? format.relativeTime(new Date(row.last_run_at), now) : "—"}
        </td>
        <td style={s.td}>
          {onView ? (
            <button type="button" style={s.view} onClick={onView}>
              {t("table.view")}
            </button>
          ) : null}
        </td>
      </tr>
      {open ? (
        <tr id={splitId}>
          <td colSpan={COLUMN_COUNT} style={s.splitCell}>
            <ModelSplit
              rows={row.by_model}
              labels={{
                unknownModel: t("breakdown.unknownModel"),
                runs: (n) => t("runs", { count: n }),
                decisions: (n) => t("decisions", { count: n }),
              }}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/* AgentTable — one row per live agent, then the Deleted agent row. Sorting is local:
   it reorders the loaded rows and never refetches. */
import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { AgentStats, AgentStatsMetrics } from "@devdigest/shared";
import { AgentRow } from "./_components/AgentRow";
import { SORT_COLUMNS } from "./constants";
import { defaultOrder, nextSort, sortRows, type SortState } from "./helpers";
import { s } from "./styles";

export function AgentTable({
  agents,
  deleted,
  onView,
}: {
  agents: AgentStats[];
  deleted: AgentStatsMetrics | null;
  onView: (agentId: string) => void;
}) {
  const t = useTranslations("agentPerformance");
  const [sort, setSort] = React.useState<SortState | null>(null);
  const rows = sort ? sortRows(agents, sort) : defaultOrder(agents);

  return (
    <div style={s.wrap}>
      <table style={s.table}>
        <thead>
          <tr>
            {SORT_COLUMNS.map((c) => {
              const active = sort?.key === c.key ? sort : null;
              const SortIcon = active?.dir === "desc" ? Icon.ArrowDown : Icon.ArrowUp;
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={s.th}
                  aria-sort={active ? (active.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  <button type="button" style={s.sortButton} onClick={() => setSort((cur) => nextSort(cur, c.key))}>
                    {t(c.labelKey)}
                    {active ? <SortIcon size={11} aria-hidden /> : null}
                  </button>
                  {c.key === "avgCost" ? <span style={s.thHint}>{t("estimate")}</span> : null}
                </th>
              );
            })}
            <th scope="col" style={s.th}>
              {t("table.view")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <AgentRow key={r.agent_id} name={r.agent_name} row={r} onView={() => onView(r.agent_id)} />
          ))}
          {deleted ? <AgentRow name={t("table.deletedAgent")} row={deleted} /> : null}
        </tbody>
      </table>
    </div>
  );
}

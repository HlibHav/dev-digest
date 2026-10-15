/* ModelSplit — one line per run model: runs, cost, accept rate and decisions.
   Labels come in as props; model names render as plain text. */
import React from "react";
import type { AgentModelSplit } from "@devdigest/shared";
import { formatCost } from "../run-cost-badge/format";
import { formatPercent } from "./helpers";
import { s } from "./styles";

export interface ModelSplitLabels {
  unknownModel: string;
  runs: (n: number) => string;
  decisions: (n: number) => string;
}

export function ModelSplit({ rows, labels }: { rows: AgentModelSplit[]; labels: ModelSplitLabels }) {
  return (
    <ul style={s.list}>
      {rows.map((r) => {
        const name = r.model ?? labels.unknownModel;
        return (
          <li key={r.model ?? "\u0000unknown"} style={s.line}>
            <span style={s.model} title={name}>
              {name}
            </span>
            <span style={s.num}>{labels.runs(r.runs)}</span>
            <span style={s.num}>{formatCost(r.total_cost_usd, 3)}</span>
            <span style={s.num}>{formatPercent(r.accept_rate)}</span>
            <span style={s.num}>{labels.decisions(r.decisions)}</span>
          </li>
        );
      })}
    </ul>
  );
}

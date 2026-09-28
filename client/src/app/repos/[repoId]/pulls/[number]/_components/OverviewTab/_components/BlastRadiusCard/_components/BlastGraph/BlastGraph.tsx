"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import { toGraphModel, type GraphNode } from "../../helpers";
import { s } from "../../styles";

interface BlastGraphProps {
  blast: BlastRadius;
}

const COLUMN_X = { symbol: 40, caller: 220, target: 400 } as const;
const ROW_HEIGHT = 28;
const TOP_PADDING = 20;

function columnFor(kind: GraphNode["kind"]): keyof typeof COLUMN_X {
  if (kind === "symbol") return "symbol";
  if (kind === "caller") return "caller";
  return "target";
}

/** Plain-SVG three-column graph: changed symbols -> callers ->
    endpoints/crons, one edge per link. No graphing dependency (plan
    Constraints: "the graph is plain SVG, with no new dependency"). */
export function BlastGraph({ blast }: BlastGraphProps) {
  const t = useTranslations("blast");
  const model = toGraphModel(blast);

  if (model.callers.length === 0) {
    return <div style={s.graphEmpty}>{t("graph.empty")}</div>;
  }

  const columns: GraphNode[][] = [model.symbols, model.callers, model.targets];
  const positions = new Map<string, { x: number; y: number }>();
  for (const column of columns) {
    column.forEach((node, i) => {
      positions.set(node.id, { x: COLUMN_X[columnFor(node.kind)], y: TOP_PADDING + i * ROW_HEIGHT });
    });
  }
  const height = TOP_PADDING * 2 + Math.max(model.symbols.length, model.callers.length, model.targets.length) * ROW_HEIGHT;

  return (
    <svg
      role="img"
      aria-label={t("graph.ariaLabel")}
      viewBox={`0 0 480 ${height}`}
      style={s.graphSvg}
    >
      {model.edges.map((edge) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) return null;
        return (
          <line
            key={`${edge.from}->${edge.to}`}
            x1={from.x + 60}
            y1={from.y + 6}
            x2={to.x}
            y2={to.y + 6}
            style={s.graphEdge}
          />
        );
      })}
      {columns.flat().map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;
        return (
          <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
            <circle cx={3} cy={6} r={3} style={s.graphNodeCircle} />
            <text x={10} y={10} style={s.graphNodeLabel}>
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

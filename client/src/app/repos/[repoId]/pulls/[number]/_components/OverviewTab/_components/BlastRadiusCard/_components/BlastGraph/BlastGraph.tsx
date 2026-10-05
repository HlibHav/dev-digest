"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import { toGraphModel, type GraphNode } from "../../helpers";
import { GRAPH_LEGEND_KEY, GRAPH_NODE_STYLE } from "../../constants";
import { s } from "../../styles";

interface BlastGraphProps {
  blast: BlastRadius;
}

type Column = "symbol" | "caller" | "target";

const BOX_H = 24;
const BOX_PAD_X = 8;
const CHAR_W = 5.6; // ~10px monospace glyph width, used to size/truncate box text
const ROW_H = 34;
const TOP_PAD = 16;
const SIDE_PAD = 16;
const COL_GAP = 48;
const BOX_W: Record<Column, number> = { symbol: 128, caller: 150, target: 168 };
const MAX_CHARS: Record<Column, number> = {
  symbol: Math.floor((BOX_W.symbol - BOX_PAD_X * 2) / CHAR_W),
  caller: Math.floor((BOX_W.caller - BOX_PAD_X * 2) / CHAR_W),
  target: Math.floor((BOX_W.target - BOX_PAD_X * 2) / CHAR_W),
};
const LEGEND_ORDER: GraphNode["kind"][] = ["symbol", "caller", "endpoint", "cron"];

function columnOf(kind: GraphNode["kind"]): Column {
  if (kind === "symbol") return "symbol";
  if (kind === "caller") return "caller";
  return "target";
}

/** The visible caller label is the file's basename (the full `file:line`
    goes in the node's <title> for hover) — a caller's label from
    `toGraphModel` is already `${file}:${line}`, so the last path segment is
    exactly `basename:line`. */
function callerDisplayLabel(fullLabel: string): string {
  const lastSlash = fullLabel.lastIndexOf("/");
  return lastSlash === -1 ? fullLabel : fullLabel.slice(lastSlash + 1);
}

/** Truncates to fit a box's character budget, ellipsis in JS — the full text
    always stays reachable via the node's <title>. */
function truncateForBox(label: string, maxChars: number): string {
  if (label.length <= maxChars) return label;
  return `${label.slice(0, Math.max(1, maxChars - 1))}…`;
}

/** Plain-SVG three-column graph: changed symbols -> callers ->
    endpoints/crons, one edge per link, rounded boxes and curved edges. No
    graphing dependency (plan Constraints: "the graph is plain SVG, with no
    new dependency"). */
export function BlastGraph({ blast }: BlastGraphProps) {
  const t = useTranslations("blast");
  const model = toGraphModel(blast);

  if (model.callers.length === 0) {
    return <div style={s.graphEmpty}>{t("graph.empty")}</div>;
  }

  // A changed symbol with no callers has no edge — drop it so it isn't drawn
  // as a dangling node (toGraphModel itself stays unchanged; this filters at
  // render time only).
  const symbolIdsWithEdges = new Set(model.edges.map((edge) => edge.from));
  const symbols = model.symbols.filter((node) => symbolIdsWithEdges.has(node.id));

  const columns: { column: Column; nodes: GraphNode[] }[] = [
    { column: "symbol", nodes: symbols },
    { column: "caller", nodes: model.callers },
    { column: "target", nodes: model.targets },
  ];

  const positions = new Map<string, { x: number; y: number; column: Column }>();
  let colX = SIDE_PAD;
  for (const { column, nodes } of columns) {
    nodes.forEach((node, i) => {
      positions.set(node.id, { x: colX, y: TOP_PAD + i * ROW_H, column });
    });
    colX += BOX_W[column] + COL_GAP;
  }

  const maxRows = Math.max(1, ...columns.map(({ nodes }) => nodes.length));
  const graphWidth = colX - COL_GAP + SIDE_PAD;
  const graphHeight = TOP_PAD * 2 + maxRows * ROW_H;

  return (
    <div style={s.graphWrap}>
      <svg role="img" aria-label={t("graph.ariaLabel")} viewBox={`0 0 ${graphWidth} ${graphHeight}`} style={s.graphSvg}>
        {model.edges.map((edge) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + BOX_W[from.column];
          const y1 = from.y + BOX_H / 2;
          const x2 = to.x;
          const y2 = to.y + BOX_H / 2;
          const midX = (x1 + x2) / 2;
          return (
            <path
              key={`${edge.from}->${edge.to}`}
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              style={s.graphEdge}
            />
          );
        })}
        {columns.flatMap(({ column, nodes }) =>
          nodes.map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const boxW = BOX_W[column];
            const displayLabel = node.kind === "caller" ? callerDisplayLabel(node.label) : node.label;
            const shownText = truncateForBox(displayLabel, MAX_CHARS[column]);
            const boxStyle = GRAPH_NODE_STYLE[node.kind];
            // Only add a <title> tooltip when it carries information the
            // visible text doesn't (truncated, or a caller's basename hides
            // its directory) — otherwise both nodes have the same text and
            // RTL's getByText finds two matches for one label.
            const needsTitle = shownText !== node.label;
            return (
              <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
                {needsTitle && <title>{node.label}</title>}
                <rect width={boxW} height={BOX_H} rx={5} ry={5} style={boxStyle} />
                <text x={BOX_PAD_X} y={BOX_H / 2 + 3.5} style={s.graphNodeLabel}>
                  {shownText}
                </text>
              </g>
            );
          }),
        )}
      </svg>
      <div style={s.graphLegend}>
        {LEGEND_ORDER.map((kind) => (
          <span key={kind} style={s.graphLegendItem}>
            <span style={{ ...s.graphLegendSwatch, background: GRAPH_NODE_STYLE[kind].fill, border: `1px solid ${GRAPH_NODE_STYLE[kind].stroke}` }} />
            {t(GRAPH_LEGEND_KEY[kind])}
          </span>
        ))}
      </div>
    </div>
  );
}

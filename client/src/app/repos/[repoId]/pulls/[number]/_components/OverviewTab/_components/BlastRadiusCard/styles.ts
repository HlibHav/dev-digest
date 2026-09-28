import type { CSSProperties } from "react";

/* Shared style tokens for BlastRadiusCard and its subcomponents (BlastTree,
   BlastGraph, IndexNotice) — imported as `../../styles` from _components/*.
   Colours are CSS-var tokens from src/vendor/ui/styles.css, same as
   IntentCard's styles.ts. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  statRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  statSep: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    gap: 6,
  } satisfies CSSProperties,
  hint: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tree: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  symbolGroup: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies CSSProperties,
  symbolHeader: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 12px",
    background: "var(--bg-hover)",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    textAlign: "left",
  } satisfies CSSProperties,
  /* Caller-less changed symbol (rev 5.3) — same row shape as symbolHeader,
     but muted and non-interactive: not a <button>, no expand/collapse. */
  symbolHeaderMuted: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 12px",
    background: "var(--bg-elevated)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  symbolName: {
    fontFamily: "var(--font-mono, monospace)",
  } satisfies CSSProperties,
  symbolCount: {
    fontSize: 12,
    fontWeight: 400,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  symbolBody: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "10px 12px",
  } satisfies CSSProperties,
  callerList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
  } satisfies CSSProperties,
  callerArrow: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  callerPlain: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  chipRowLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginRight: 2,
  } satisfies CSSProperties,
  graphWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  graphEmpty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "20px 0",
  } satisfies CSSProperties,
  graphSvg: {
    width: "100%",
    height: "auto",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 10,
  } satisfies CSSProperties,
  graphNodeLabel: {
    fill: "var(--text-primary)",
  } satisfies CSSProperties,
  graphEdge: {
    stroke: "var(--text-secondary)",
    fill: "none",
    opacity: 0.5,
  } satisfies CSSProperties,
  graphLegend: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    fontSize: 11,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  graphLegendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  } satisfies CSSProperties,
  graphLegendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    display: "inline-block",
  } satisfies CSSProperties,
  notice: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    borderRadius: 6,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  noticeHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  } satisfies CSSProperties,
  noticeTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--warn)",
  } satisfies CSSProperties,
  noticeBody: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
} as const;

import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    color: "var(--text-primary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  hint: {
    fontSize: 12,
    color: "var(--warn)",
  } satisfies CSSProperties,
  scopeCols: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  } satisfies CSSProperties,
  scopeLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  scopeList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  sourcesRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  } satisfies CSSProperties,
  sourcesLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginRight: 4,
  } satisfies CSSProperties,
  sourceChip: {
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    borderRadius: 5,
    padding: "2px 8px",
  } satisfies CSSProperties,
  sourceChipMissing: {
    fontSize: 12,
    color: "var(--text-muted)",
    background: "transparent",
    border: "1px dashed var(--border)",
    borderRadius: 5,
    padding: "2px 8px",
  } satisfies CSSProperties,
} as const;

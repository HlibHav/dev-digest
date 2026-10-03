import type { CSSProperties } from "react";

export const s = {
  root: { fontSize: 14.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 } satisfies CSSProperties,
  chip: {
    fontSize: 12.5,
    padding: "3px 10px",
    borderRadius: 999,
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  rows: { display: "flex", flexDirection: "column", gap: 6, marginTop: 12 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  path: {
    fontSize: 13,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
} as const;

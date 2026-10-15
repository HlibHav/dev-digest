import type { CSSProperties } from "react";

const cell: CSSProperties = { padding: "12px 16px", textAlign: "left", verticalAlign: "middle" };

export const s = {
  wrap: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "auto",
  } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 } satisfies CSSProperties,
  th: {
    ...cell,
    padding: "10px 16px",
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  sortButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    letterSpacing: "inherit",
    textTransform: "inherit",
    cursor: "pointer",
  } satisfies CSSProperties,
  thHint: {
    display: "block",
    marginTop: 2,
    fontSize: 10.5,
    fontWeight: 400,
    letterSpacing: 0,
    textTransform: "none",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;

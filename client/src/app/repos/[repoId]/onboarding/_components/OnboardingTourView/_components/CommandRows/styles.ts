import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-base, var(--bg-elevated))",
  } satisfies CSSProperties,
  num: { width: 16, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  command: { fontSize: 13.5, color: "var(--text-primary)" } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  copy: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 12,
  } satisfies CSSProperties,
  empty: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;

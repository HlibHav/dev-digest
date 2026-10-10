import type { CSSProperties } from "react";

/** Co-located styles for one eval case row. */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 } satisfies CSSProperties,
  name: { fontWeight: 600, fontSize: 14, overflowWrap: "anywhere" } satisfies CSSProperties,
  sub: { fontSize: 12.5, color: "var(--text-muted)", display: "flex", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  chip: {
    fontSize: 11.5,
    padding: "3px 8px",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 4 } satisfies CSSProperties,
} as const;

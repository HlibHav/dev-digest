import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, overflow: "hidden" } satisfies CSSProperties,
  title: { fontWeight: 600, color: "var(--text-primary)", flexShrink: 0 } satisfies CSSProperties,
  path: {
    fontSize: 13,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  } satisfies CSSProperties,
  reason: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  open: {
    flexShrink: 0,
    fontSize: 12.5,
    padding: "4px 10px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text-primary)",
    textDecoration: "none",
  } satisfies CSSProperties,
} as const;

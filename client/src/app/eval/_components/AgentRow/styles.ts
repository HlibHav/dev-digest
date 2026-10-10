import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 2fr) repeat(3, 90px) 90px minmax(0, 2fr)",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    color: "inherit",
    textDecoration: "none",
  } satisfies CSSProperties,
  name: { fontWeight: 600, fontSize: 14 } satisfies CSSProperties,
  model: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  metric: { fontSize: 14 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

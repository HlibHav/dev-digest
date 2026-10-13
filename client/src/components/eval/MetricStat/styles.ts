import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  } satisfies CSSProperties,
  label: { fontSize: 11.5, color: "var(--text-muted)", letterSpacing: 0.4 } satisfies CSSProperties,
  value: { fontSize: 26, fontWeight: 600 } satisfies CSSProperties,
  muted: { fontSize: 15, color: "var(--text-muted)" } satisfies CSSProperties,
};

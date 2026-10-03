import type { CSSProperties } from "react";

export const s = {
  layout: { display: "flex", height: "100%", minHeight: 0, overflow: "auto" } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, padding: "28px 32px 48px", maxWidth: 1100 } satisfies CSSProperties,
  sections: { display: "flex", flexDirection: "column", gap: 16, marginTop: 20 } satisfies CSSProperties,
  center: { padding: 28 } satisfies CSSProperties,
  status: {
    fontSize: 13,
    color: "var(--text-secondary)",
    padding: "10px 14px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    marginTop: 16,
  } satisfies CSSProperties,
} as const;

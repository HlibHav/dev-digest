import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 } satisfies CSSProperties,
  title: { margin: 0, fontSize: 28, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  name: { color: "var(--accent-text)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  subline: { marginTop: 8, fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 } satisfies CSSProperties,
} as const;

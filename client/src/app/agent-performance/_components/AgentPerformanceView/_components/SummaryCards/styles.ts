import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 } satisfies CSSProperties,
  card: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 } satisfies CSSProperties,
  title: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  value: { fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" } satisfies CSSProperties,
  name: {
    fontSize: 16,
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  line: { display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  muted: { fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.4 } satisfies CSSProperties,
} as const;

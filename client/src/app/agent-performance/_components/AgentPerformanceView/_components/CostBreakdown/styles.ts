import type { CSSProperties } from "react";

export const s = {
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  hint: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 } satisfies CSSProperties,
  heading: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 } satisfies CSSProperties,
  body: { display: "flex", alignItems: "center", gap: 24 } satisfies CSSProperties,
  donut: { width: 112, height: 112, borderRadius: "50%", flexShrink: 0, position: "relative" } satisfies CSSProperties,
  donutHole: {
    position: "absolute",
    inset: 20,
    borderRadius: "50%",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, flex: 1 } satisfies CSSProperties,
  line: { display: "flex", alignItems: "center", gap: 10, fontSize: 13 } satisfies CSSProperties,
  swatch: { width: 9, height: 9, borderRadius: 2, flexShrink: 0 } satisfies CSSProperties,
  name: {
    flex: 1,
    minWidth: 0,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  cost: { fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" } satisfies CSSProperties,
  footnote: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

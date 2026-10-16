import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  line: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 2fr) repeat(4, minmax(0, 1fr))",
    gap: 12,
    alignItems: "baseline",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  model: {
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono, monospace)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  num: { fontVariantNumeric: "tabular-nums" } satisfies CSSProperties,
};

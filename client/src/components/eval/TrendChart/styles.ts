import type { CSSProperties } from "react";

export const s = {
  wrap: { width: "100%", height: 200 } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 500, marginBottom: 6 } satisfies CSSProperties,
  tooltip: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 12,
  } satisfies CSSProperties,
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    margin: 0,
    padding: 0,
    listStyle: "none",
  } satisfies CSSProperties,
};

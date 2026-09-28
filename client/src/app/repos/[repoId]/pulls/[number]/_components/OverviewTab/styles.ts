import type { CSSProperties } from "react";

export const s = {
  /* Two-column grid: Intent and Blast radius side by side (plan step 6);
     minmax(0, 1fr), not 1fr, so a long mono file path can't push a column
     wider than its half. */
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 24,
    alignItems: "start",
  } satisfies CSSProperties,
  fullRow: {
    gridColumn: "1 / -1",
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;

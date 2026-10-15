import type { CSSProperties } from "react";

const cell: CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  verticalAlign: "middle",
  borderBottom: "1px solid var(--border)",
  fontVariantNumeric: "tabular-nums",
};

export const s = {
  td: cell,
  nameCell: { ...cell, maxWidth: 320 } satisfies CSSProperties,
  nameWrap: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  name: {
    fontWeight: 600,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  sub: { display: "block", fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  expand: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    padding: "2px 6px",
    fontSize: 11.5,
    borderRadius: 5,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  rate: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px 8px" } satisfies CSSProperties,
  rateValue: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 12.5 } satisfies CSSProperties,
  view: {
    padding: 0,
    border: "none",
    background: "transparent",
    color: "var(--accent-text)",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12.5,
    cursor: "pointer",
  } satisfies CSSProperties,
  splitCell: { padding: "10px 16px 14px 44px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" } satisfies CSSProperties,
} as const;

import type { CSSProperties } from "react";

export const s = {
  layout: { display: "flex", height: "100%", minHeight: 0 } satisfies CSSProperties,
  side: {
    width: 236,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  sideHead: { padding: "16px 14px 10px" } satisfies CSSProperties,
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tree: { flex: 1, overflowY: "auto", padding: "4px 8px" } satisfies CSSProperties,
  footer: {
    padding: "10px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 11.5,
    color: "var(--text-muted)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  mainHead: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 24px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  path: { fontSize: 14, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  usedBy: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  preview: { padding: "20px 28px", overflowY: "auto", fontSize: 14 } satisfies CSSProperties,
  center: { padding: 32 } satisfies CSSProperties,
};

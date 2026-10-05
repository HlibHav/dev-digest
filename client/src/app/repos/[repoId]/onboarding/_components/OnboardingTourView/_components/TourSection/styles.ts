import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--bg-surface)",
    padding: "6px 22px 22px",
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "14px 0",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-primary)",
    fontSize: 17,
    fontWeight: 600,
    textAlign: "left",
  } satisfies CSSProperties,
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    background: "var(--bg-elevated)",
    color: "var(--accent-text)",
    flexShrink: 0,
  } satisfies CSSProperties,
  title: { flex: 1 } satisfies CSSProperties,
  notice: { fontSize: 14, color: "var(--text-secondary)", padding: "4px 0" } satisfies CSSProperties,
} as const;

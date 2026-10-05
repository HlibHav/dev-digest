import type { CSSProperties } from "react";

export const s = {
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 12 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  item: { display: "flex", gap: 12, alignItems: "flex-start" } satisfies CSSProperties,
  badge: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 600,
    background: "var(--bg-elevated)",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  body: { minWidth: 0 } satisfies CSSProperties,
  path: {
    fontSize: 13.5,
    color: "var(--text-primary)",
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  reason: { fontSize: 13, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
} as const;

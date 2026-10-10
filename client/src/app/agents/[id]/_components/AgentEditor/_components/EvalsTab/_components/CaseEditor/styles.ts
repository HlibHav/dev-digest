import type { CSSProperties } from "react";

/** Co-located styles for the Case Editor modal. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 14, padding: "0 4px" } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  textarea: {
    width: "100%",
    minHeight: 140,
    resize: "vertical",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.5,
    outline: "none",
  } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  grow: { flex: 1 } satisfies CSSProperties,
  ok: { fontSize: 12, color: "var(--ok)" } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)" } satisfies CSSProperties,
  warn: { fontSize: 12, color: "var(--warn)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  lastRun: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10, width: "100%" } satisfies CSSProperties,
} as const;

import type { CSSProperties } from "react";

/** Co-located styles for the Evals tab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 22 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  title: { fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  cards: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 } satisfies CSSProperties,
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  cardLabel: { fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-muted)" } satisfies CSSProperties,
  cardValue: { fontSize: 26, fontWeight: 700 } satisfies CSSProperties,
  running: { padding: "14px 16px", borderRadius: 10, border: "1px solid var(--accent)", color: "var(--accent)", fontWeight: 600 } satisfies CSSProperties,
  casesHead: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  passing: { fontSize: 12, padding: "3px 8px", borderRadius: 6, background: "var(--bg-elevated)", color: "var(--ok)" } satisfies CSSProperties,
  grow: { flex: 1 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  error: { color: "var(--crit)", fontSize: 13 } satisfies CSSProperties,
} as const;

import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  running: { fontSize: 13, color: "var(--accent)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--warn)" } satisfies CSSProperties,
  stats: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  summary: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600, marginBottom: 8 } satisfies CSSProperties,
} as const;

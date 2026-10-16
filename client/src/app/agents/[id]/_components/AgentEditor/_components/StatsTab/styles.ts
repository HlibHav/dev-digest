import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: "20px 24px 32px", display: "flex", flexDirection: "column", gap: 18, maxWidth: 1000 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 12 } satisfies CSSProperties,
  h2: { flex: 1, fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 } satisfies CSSProperties,
  tile: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  label: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  value: { fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" } satisfies CSSProperties,
  line: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  muted: { fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.4 } satisfies CSSProperties,
  noRuns: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  section: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 } satisfies CSSProperties,
  skeletons: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 } satisfies CSSProperties,
} as const;

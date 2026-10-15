import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1200, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
  skeletonCards: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 } satisfies CSSProperties,
  skeletonRows: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  skeletonBreakdown: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 } satisfies CSSProperties,
} as const;

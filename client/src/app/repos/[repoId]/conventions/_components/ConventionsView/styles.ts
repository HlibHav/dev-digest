import type { CSSProperties } from "react";
import { CARD_GRID_COLS } from "./constants";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1240, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 4,
    maxWidth: 640,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, alignItems: "center" } satisfies CSSProperties,
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  counts: { display: "flex", gap: 14, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: CARD_GRID_COLS, gap: 14 } satisfies CSSProperties,
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    margin: "26px 0 12px",
  } satisfies CSSProperties,
  scanError: {
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--crit)",
    background: "var(--bg-surface)",
    color: "var(--crit)",
    fontSize: 13,
    marginBottom: 16,
  } satisfies CSSProperties,
  scanning: { display: "inline-flex", alignItems: "center", gap: 8, color: "var(--accent)" } satisfies CSSProperties,
  spin: { animation: "ddspin 1s linear infinite" } satisfies CSSProperties,
} as const;

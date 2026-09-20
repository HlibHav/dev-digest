import type { CSSProperties } from "react";
import { CARD_GRID_COLS } from "./constants";

/** Co-located styles for the Skills library view. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1240, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 200,
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  // Two panes: the card grid, and the preview of whatever is selected.
  split: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 18, alignItems: "start" } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: CARD_GRID_COLS, gap: 14 } satisfies CSSProperties,
  aside: { position: "sticky", top: 16 } satisfies CSSProperties,
  asidePlaceholder: {
    border: "1px dashed var(--border)",
    borderRadius: 10,
    padding: 24,
    textAlign: "center",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  asidePlaceholderTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 6,
  } satisfies CSSProperties,
  asidePlaceholderBody: { fontSize: 12.5, lineHeight: 1.5 } satisfies CSSProperties,
} as const;

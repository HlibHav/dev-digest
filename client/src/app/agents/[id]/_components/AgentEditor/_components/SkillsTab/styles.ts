import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  panel: { padding: "20px 24px 40px", maxWidth: 820, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 650 } satisfies CSSProperties,
  count: { fontSize: 12.5, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 190,
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  availableLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
    marginTop: 14,
  } satisfies CSSProperties,
  empty: { fontSize: 12.5, color: "var(--text-muted)", padding: "6px 2px" } satisfies CSSProperties,
} as const;

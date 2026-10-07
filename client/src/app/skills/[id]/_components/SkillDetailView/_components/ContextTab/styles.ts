import type { CSSProperties } from "react";

/** Co-located styles for ContextTab. */
export const s = {
  panel: { padding: "20px 28px 40px", display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 650 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 220,
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
  label: { fontSize: 11, fontWeight: 650, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginTop: 10 } satisfies CSSProperties,
  serialized: { display: "flex", flexDirection: "column", gap: 6, padding: "14px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: 12, lineHeight: 1.6, overflowWrap: "anywhere" } satisfies CSSProperties,
  groupHeading: { margin: 0, fontSize: 12, fontWeight: 650, color: "var(--text-secondary)" } satisfies CSSProperties,
  groupList: { margin: 0, paddingLeft: 18 } satisfies CSSProperties,
  overBudget: { fontSize: 12, color: "var(--warn)", lineHeight: 1.5 } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
} as const;

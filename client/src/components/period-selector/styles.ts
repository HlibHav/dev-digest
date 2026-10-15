import type { CSSProperties } from "react";

const segment: CSSProperties = {
  padding: "6px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  border: "none",
  borderRadius: 6,
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

export const s = {
  wrap: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 } satisfies CSSProperties,
  group: {
    display: "inline-flex",
    gap: 2,
    padding: 3,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  segment,
  segmentOn: { ...segment, background: "var(--bg-hover)", color: "var(--text-primary)" } satisfies CSSProperties,
  dates: { display: "flex", gap: 10, alignItems: "flex-end" } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  input: {
    padding: "5px 8px",
    fontSize: 12.5,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    colorScheme: "dark",
  } satisfies CSSProperties,
  invalid: { fontSize: 12, color: "var(--warn)", maxWidth: 360, textAlign: "right" } satisfies CSSProperties,
};

import type { CSSProperties } from "react";

export const s = {
  intro: {
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    padding: "10px 12px",
    borderRadius: 7,
    background: "var(--accent-bg)",
    border: "1px solid var(--border)",
    marginBottom: 16,
  } satisfies CSSProperties,
  fields: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginTop: 10 } satisfies CSSProperties,
} as const;

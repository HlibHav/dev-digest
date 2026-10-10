import type { CSSProperties } from "react";

export const s = {
  title: { fontSize: 14, fontWeight: 600, margin: "24px 0 8px" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: { textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 } satisfies CSSProperties,
  td: { padding: "8px", borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

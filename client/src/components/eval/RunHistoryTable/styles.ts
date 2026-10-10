import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    fontSize: 11.5,
    fontWeight: 500,
    color: "var(--text-muted)",
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: { padding: "8px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  errored: { color: "var(--crit)", marginLeft: 6 } satisfies CSSProperties,
};

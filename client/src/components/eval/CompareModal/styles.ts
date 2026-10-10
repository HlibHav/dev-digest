import type { CSSProperties } from "react";

export const s = {
  body: { display: "flex", flexDirection: "column", gap: 16, fontSize: 13 } satisfies CSSProperties,
  heading: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } satisfies CSSProperties,
  th: { textAlign: "left", fontSize: 11.5, fontWeight: 500, color: "var(--text-muted)", padding: "4px 8px" } satisfies CSSProperties,
  td: { padding: "6px 8px", borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  arrow: { color: "var(--text-muted)", margin: "0 6px" } satisfies CSSProperties,
  diff: {
    maxHeight: 280,
    overflow: "auto",
    border: "1px solid var(--border)",
    borderRadius: 6,
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12,
  } satisfies CSSProperties,
  line: { display: "flex", gap: 8, padding: "1px 8px", whiteSpace: "pre-wrap", wordBreak: "break-word" } satisfies CSSProperties,
  marker: { width: 10, flexShrink: 0, color: "var(--text-muted)" } satisfies CSSProperties,
  add: { background: "var(--ok-bg)" } satisfies CSSProperties,
  remove: { background: "var(--crit-bg)" } satisfies CSSProperties,
  note: { color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
};

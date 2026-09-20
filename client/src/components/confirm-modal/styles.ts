import type { CSSProperties } from "react";

export const s = {
  body: { fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" } satisfies CSSProperties,
  name: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;

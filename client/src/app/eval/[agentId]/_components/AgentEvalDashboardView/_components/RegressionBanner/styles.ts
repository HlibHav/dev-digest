import type { CSSProperties } from "react";

export const s = {
  banner: {
    border: "1px solid var(--crit)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    color: "var(--crit)",
    padding: "10px 14px",
    fontSize: 13.5,
  } satisfies CSSProperties,
} as const;

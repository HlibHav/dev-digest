import type { CSSProperties } from "react";

export const s = {
  nav: {
    width: 220,
    flexShrink: 0,
    padding: "28px 14px",
    position: "sticky",
    top: 0,
    alignSelf: "flex-start",
  } satisfies CSSProperties,
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    padding: "0 12px 10px",
  } satisfies CSSProperties,
  link: {
    display: "block",
    padding: "7px 12px",
    fontSize: 13.5,
    color: "var(--text-secondary)",
    textDecoration: "none",
    borderLeft: "2px solid transparent",
  } satisfies CSSProperties,
  linkActive: {
    color: "var(--text-primary)",
    borderLeft: "2px solid var(--accent-text)",
  } satisfies CSSProperties,
} as const;

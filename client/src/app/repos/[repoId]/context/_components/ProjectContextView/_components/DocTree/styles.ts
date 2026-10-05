import type { CSSProperties } from "react";

export const s = {
  folder: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px",
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  file: (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "7px 8px",
    border: 0,
    borderRadius: 6,
    textAlign: "left",
    cursor: "pointer",
    fontSize: 13,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    background: active ? "var(--bg-hover)" : "transparent",
  }),
  indent: (depth: number): CSSProperties => ({ paddingLeft: depth * 14 }),
};

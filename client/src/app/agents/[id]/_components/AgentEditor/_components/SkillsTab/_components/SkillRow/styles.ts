import type { CSSProperties } from "react";

/** Co-located styles for SkillRow. */
export const s = {
  row: (attached: boolean, dragging: boolean, motion: CSSProperties): CSSProperties => ({
    ...motion,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid " + (attached ? "var(--border-strong)" : "var(--border)"),
    background: attached ? "var(--bg-elevated)" : "var(--bg-surface)",
    opacity: dragging ? 0.6 : 1,
    // While dragging, this row must paint above its neighbours.
    zIndex: dragging ? 2 : undefined,
    position: "relative",
  }),
  handle: {
    background: "none",
    border: "none",
    padding: 2,
    cursor: "grab",
    color: "var(--text-muted)",
    display: "inline-flex",
    touchAction: "none",
  } satisfies CSSProperties,
  handlePlaceholder: { width: 18, display: "inline-block" } satisfies CSSProperties,
  position: {
    width: 18,
    textAlign: "center",
    fontSize: 11.5,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  name: (inert: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    color: inert ? "var(--text-muted)" : "var(--text-primary)",
  }),
  description: {
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
} as const;

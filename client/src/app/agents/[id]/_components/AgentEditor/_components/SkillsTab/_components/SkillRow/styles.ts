import type { CSSProperties } from "react";

/** Co-located styles for SkillRow. Row chrome follows the design's Skills tab. */
export const s = {
  row: (attached: boolean, dragging: boolean, motion: CSSProperties): CSSProperties => ({
    ...motion,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
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
  name: (inert: boolean): CSSProperties => ({
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: inert ? "var(--text-muted)" : "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),
} as const;

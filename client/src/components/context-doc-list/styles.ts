import type { CSSProperties } from "react";

/** Co-located styles for ContextDocList. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: (checked: boolean, dragging: boolean, move: { transform?: string; transition?: string }) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: checked ? "var(--bg-elevated)" : "var(--bg-surface)",
      opacity: dragging ? 0.6 : 1,
      transform: move.transform,
      transition: move.transition,
    }) satisfies CSSProperties,
  handle: {
    display: "inline-flex",
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    cursor: "grab",
    padding: 0,
  } satisfies CSSProperties,
  handleInactive: {
    display: "inline-flex",
    color: "var(--text-muted)",
    opacity: 0.5,
  } satisfies CSSProperties,
  path: {
    fontSize: 13,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  note: { fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  tokens: { fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  preview: { padding: "4px 0", fontSize: 13.5, lineHeight: 1.55 } satisfies CSSProperties,
} as const;

import type { CSSProperties } from "react";

/** Co-located styles for SkillPreview. */
export const s = {
  pane: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 16,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "baseline", gap: 8 } satisfies CSSProperties,
  name: { fontSize: 15, fontWeight: 650, flex: 1, wordBreak: "break-word" } satisfies CSSProperties,
  version: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  badges: { display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" } satisfies CSSProperties,
  description: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    margin: "0 0 10px",
  } satisfies CSSProperties,
  notice: {
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 7,
    padding: "8px 10px",
    marginBottom: 12,
  } satisfies CSSProperties,
  controls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 12,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  toggleRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  toggleLabel: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  bodyLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
    margin: "14px 0 8px",
  } satisfies CSSProperties,
  body: {
    fontSize: 13,
    lineHeight: 1.55,
    maxHeight: 420,
    overflowY: "auto",
    paddingRight: 6,
  } satisfies CSSProperties,
  hint: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 10 } satisfies CSSProperties,
} as const;

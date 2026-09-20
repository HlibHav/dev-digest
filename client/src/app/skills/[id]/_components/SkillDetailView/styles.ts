import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1000, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } satisfies CSSProperties,
  name: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  description: { fontSize: 14, color: "var(--text-secondary)", marginBottom: 18 } satisfies CSSProperties,
  tabsBar: { borderBottom: "1px solid var(--border)", marginBottom: 20 } satisfies CSSProperties,
  fields: { display: "flex", flexDirection: "column", gap: 14, maxWidth: 680 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, marginTop: 6 } satisfies CSSProperties,
  preview: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "18px 22px",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,

  versionRow: (current: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid " + (current ? "var(--accent)" : "var(--border)"),
    background: "var(--bg-elevated)",
    marginBottom: 8,
  }),
  versionBadge: { fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" } satisfies CSSProperties,
  versionDate: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  diffBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    margin: "0 0 12px",
    fontSize: 12,
  } satisfies CSSProperties,
  diffLine: (kind: "same" | "added" | "removed"): CSSProperties => ({
    padding: "2px 10px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background:
      kind === "added" ? "var(--ok-bg, rgba(46,160,67,0.12))"
      : kind === "removed" ? "var(--crit-bg, rgba(248,81,73,0.12))"
      : "transparent",
    color: kind === "same" ? "var(--text-muted)" : "var(--text-primary)",
  }),
  diffStat: { fontSize: 12, color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

import type { FindingRecord, Severity } from "@devdigest/shared";

/** Severities shown in the FINDINGS column, in display order. */
export const CELL_SEVERITIES: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Popover previews are ordered like the cell: critical first. */
export function sortBySeverity(findings: FindingRecord[]): FindingRecord[] {
  const rank = (s: string) => {
    const i = CELL_SEVERITIES.indexOf(s as Severity);
    return i === -1 ? CELL_SEVERITIES.length : i;
  };
  return [...findings].sort((a, b) => rank(a.severity) - rank(b.severity));
}

/** A one-line plain-text preview of a markdown rationale, clipped on a word boundary. */
export function shortDescription(markdown: string, max = 140): string {
  const plain = markdown
    .replace(/^#+\s*/gm, "")
    .replace(/^>\s*/gm, "")
    .replace(/`/g, "")
    .replace(/\*\*|\*/g, "")
    // `_word_` emphasis only; underscores inside identifiers (sk_live_, user_id) stay.
    .replace(/(^|[\s(])_{1,2}([^_\s](?:[^_]*[^_\s])?)_{1,2}(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:]+$/, "")}…`;
}

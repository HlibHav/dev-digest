import type { Risk, ReviewFocusItem } from "@devdigest/shared";

export type OpenTarget = { file: string; line: number | null };

/** `path:start-end`, `path:start` when start equals end, the path alone without a line ref for it. */
export function formatLineRef(file: string, refs: Risk["line_refs"]): string {
  const ref = refs?.find((r) => r.file === file);
  if (!ref) return file;
  return ref.start_line === ref.end_line
    ? `${file}:${ref.start_line}`
    : `${file}:${ref.start_line}-${ref.end_line}`;
}

/** `$0.014`; null when the brief carries no cost (the caller shows `card.costNone`). */
export function formatCost(cost: number | null): string | null {
  if (cost == null) return null;
  return `$${cost.toFixed(cost > 0 && cost < 0.001 ? 4 : 3)}`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** Where a review-focus click goes; null when the file is not in the PR's diff. */
export function resolveFocusTarget(
  item: ReviewFocusItem,
  prPaths: ReadonlySet<string>,
): OpenTarget | null {
  return prPaths.has(item.file) ? { file: item.file, line: item.line } : null;
}

/** The first of the risk's files that is in the diff, at that file's line-ref start; null when none is. */
export function resolveRiskTarget(risk: Risk, prPaths: ReadonlySet<string>): OpenTarget | null {
  const file = risk.file_refs.find((f) => prPaths.has(f));
  if (file === undefined) return null;
  const ref = risk.line_refs?.find((r) => r.file === file);
  return { file, line: ref ? ref.start_line : null };
}

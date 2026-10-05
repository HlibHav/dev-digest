import type { RunTrace, SpecDocStatus } from "@devdigest/shared";

export type SpecRow = {
  path: string;
  status: SpecDocStatus | null;
  text: string | null;
  tokens: number | null;
};

/** Rows for the "Specs read" line: the per-doc snapshot when the run recorded
    one, else the legacy path list with no status, text or tokens. */
export function specRows(trace: RunTrace): SpecRow[] {
  if (trace.specs_docs) {
    return trace.specs_docs.map((d) => ({
      path: d.path,
      status: d.status,
      text: d.text ?? null,
      tokens: d.tokens ?? null,
    }));
  }
  return trace.specs_read.map((path) => ({ path, status: null, text: null, tokens: null }));
}

/** Only docs whose text reached the prompt can be opened. */
export function isOpenable(row: SpecRow): boolean {
  return (row.status === "injected" || row.status === "modified_by_pr") && row.text != null;
}

export const STATUS_KEY: Record<SpecDocStatus, string> = {
  injected: "injected",
  not_found: "notFound",
  unreadable: "unreadable",
  modified_by_pr: "modifiedByPr",
};

export const STATUS_COLOR: Record<SpecDocStatus, string> = {
  injected: "var(--ok)",
  not_found: "var(--text-muted)",
  unreadable: "var(--danger)",
  modified_by_pr: "var(--warn)",
};

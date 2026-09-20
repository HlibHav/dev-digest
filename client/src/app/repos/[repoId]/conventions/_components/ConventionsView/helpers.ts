import type { ConventionCandidate } from "@devdigest/shared";

/** A GitHub blob link that opens the evidence at its verified line. */
export function githubBlobUrl(
  fullName: string,
  branch: string,
  path: string,
  line: number | null,
): string {
  const base = `https://github.com/${fullName}/blob/${branch}/${path}`;
  return line ? `${base}#L${line}` : base;
}

export function confidencePercent(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

/** Candidates still awaiting a decision, which is what the page triages. */
export function pendingCandidates(all: readonly ConventionCandidate[]): ConventionCandidate[] {
  return all.filter((c) => c.status === "pending");
}

export function acceptedCandidates(all: readonly ConventionCandidate[]): ConventionCandidate[] {
  return all.filter((c) => c.status === "accepted");
}

/** Rejected rules are kept server-side so a re-scan can't resurrect them, but
    the triage list doesn't show them — only the counter does. */
export function rejectedCount(all: readonly ConventionCandidate[]): number {
  return all.filter((c) => c.status === "rejected").length;
}

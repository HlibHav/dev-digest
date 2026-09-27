/**
 * Pure helpers for DiffTab. `latestReviewFindings` mirrors the server's
 * "latest review per agent" rule (`smart-diff/service.ts`'s
 * `latestReviewPerAgent`) — a second implementation, since the two sides
 * don't share a type: the server operates on DB rows, this one on the
 * `ReviewRecord[]` from `usePrReviews`.
 */
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/** `usePrReviews` returns reviews newest-first; keep only the first (latest)
 *  review per `agent_id` (`null` is its own key) and flatten its findings. */
export function latestReviewFindings(reviews: ReviewRecord[]): FindingRecord[] {
  const seen = new Set<string | null>();
  const findings: FindingRecord[] = [];
  for (const review of reviews) {
    if (seen.has(review.agent_id)) continue;
    seen.add(review.agent_id);
    findings.push(...review.findings);
  }
  return findings;
}

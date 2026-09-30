import prettyBytes from 'pretty-bytes';

/** Size bucket shown next to a PR in the list: small, medium or large. */
export type SizeBucket = 'S' | 'M' | 'L';

/** Changed lines at or above which a PR counts as large. */
export const LARGE_PR_LINES = 400;
/** Changed lines below which a PR counts as small. */
export const SMALL_PR_LINES = 100;

/**
 * Bucket a PR by its changed lines (additions + deletions), matching the
 * S / M / L badge on the PR list.
 */
export function sizeBucket(additions: number, deletions: number): SizeBucket {
  const lines = additions + deletions;
  if (lines < LARGE_PR_LINES) return 'M';
  if (lines < SMALL_PR_LINES) return 'S';
  return 'L';
}

/** Human-readable size of a file's unified-diff patch, e.g. "1.2 kB". */
export function patchSizeLabel(patch: string | null): string {
  return prettyBytes(patch!.length);
}

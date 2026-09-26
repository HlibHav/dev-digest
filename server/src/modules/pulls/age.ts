import ms from 'ms';

/**
 * Human-readable age of a pull request for the PR list ("opened 3 hours ago").
 *
 * `openedAt` is the ISO timestamp GitHub returns for `created_at`; `now` is
 * injectable so the label is deterministic in tests.
 */
export function prAgeLabel(openedAt: string, now: number = Date.now()): string {
  const opened = new Date(openedAt).getTime();
  const delta = now - opened;
  return `opened ${ms(delta, { long: true })} ago`;
}

/** Sort key for "oldest open PR first": smaller = opened earlier. */
export function prAgeSortKey(openedAt: string): number {
  return new Date(openedAt).getTime();
}

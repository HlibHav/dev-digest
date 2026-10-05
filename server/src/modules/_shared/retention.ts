/**
 * Retention window for a workspace's finished agent runs.
 *
 * A run is kept for `days` after it finished; anything older is eligible for
 * deletion by the nightly sweep.
 */
export interface RetentionPolicy {
  days: number;
  /** Never delete a run that blocked a merge, whatever its age. */
  keepBlocking: boolean;
}

export const DEFAULT_RETENTION: RetentionPolicy = { days: 30, keepBlocking: true };

export interface RunSummary {
  finishedAt: Date | null;
  blockers: number;
}

/**
 * Should this run be swept?
 *
 * A run still in flight has no `finishedAt` and is never swept. A blocking run
 * is kept when the policy says so. Otherwise it goes once it is older than the
 * retention window.
 */
export function shouldSweep(run: RunSummary, policy: RetentionPolicy, now: Date): boolean {
  if (run.finishedAt === null) return false;
  if (policy.keepBlocking && run.blockers > 0) return false;
  const ageDays = (now.getTime() - run.finishedAt.getTime()) / 86_400_000;
  return ageDays > policy.days;
}

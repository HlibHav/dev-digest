export { REGRESSION_POINTS } from './scoring.js';

export const MAX_CASES_PER_SUITE = 50;
export const MAX_DIFF_BYTES = 65_536;
export const RECENT_RUNS_LIMIT = 20;
export const RECALL_TREND_POINTS = 10;
export const RUN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

/** Fixed review instruction. Case text (title, body, diff) never goes in here. */
export const EVAL_TASK = 'Review this pull request diff and report findings.';

export const MSG = {
  noPatch: "This PR's diff is not stored yet. Open the PR once and try again.",
  diffTooLarge: 'The diff is over the 64 KB limit.',
  undecided: 'Accept or dismiss the finding first.',
  noAgent: "This finding's review has no agent.",
  noCases: 'This agent has no eval cases. A suite run needs 1 to 50 cases.',
  tooManyCases: (n: number) => `This agent has ${n} eval cases; a suite run is limited to 50.`,
  alreadyRunning: 'A suite run for this agent is already running.',
  caseError: 'The model call failed or timed out.',
  suiteFailed: 'The suite run stopped on an unexpected error.',
  interrupted: 'interrupted',
  emptyDiff: 'This case has no diff.',
  compareInvalid: 'Compare needs two completed runs of the same agent.',
} as const;

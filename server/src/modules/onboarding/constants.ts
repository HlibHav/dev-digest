/** Caps applied to the model input and to stored lists (AC-41). */
export const MAX_ROUTES = 50;
export const MAX_README_CHARS = 4000;
export const MAX_FOLDERS = 20;
export const MAX_CRITICAL = 5;
export const MAX_READING = 10;
export const MAX_TASKS = 5;
export const MAX_COMMANDS = 8;
export const MAX_LINE = 200;

export const LLM_DEADLINE_MS = 90_000;
export const SCHEMA_NAME = 'onboarding_tour';

export const SECTION_TITLES = {
  architecture: 'Architecture overview',
  critical_paths: 'Critical paths',
  run_locally: 'How to run locally',
  reading_path: 'Guided reading path',
  first_tasks: 'First tasks',
} as const;

export const NOTICE_NEEDS_INDEX = 'Reading order needs the code index';
export const NOTICE_UNSUPPORTED = "Reading order is unavailable for this repository's languages";
export const NOTICE_NO_CHAINS = 'No import chains found in the index';

export const CHECKLIST = {
  run: 'Run the project with the commands above',
  test: 'Run the test suite',
  read: 'Read file 1 of the reading path',
  change: 'Make a small change and see it run',
} as const;

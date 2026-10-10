import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { findings } from './reviews';

// ============================================================ Eval / Conformance / Compose

// One execution of an agent's whole eval set. `snapshot` freezes the agent config.
export const evalSuiteRuns = pgTable(
  'eval_suite_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    runNumber: integer('run_number').notNull(),
    agentVersion: integer('agent_version').notNull(),
    status: text('status', { enum: ['running', 'done', 'partial', 'failed'] })
      .notNull()
      .default('running'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    casesTotal: integer('cases_total').notNull(),
    casesDone: integer('cases_done').notNull().default(0),
    casesPassed: integer('cases_passed').notNull().default(0),
    casesErrored: integer('cases_errored').notNull().default(0),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    costUsd: doublePrecision('cost_usd'),
    costPartial: boolean('cost_partial').notNull().default(false),
    durationMs: integer('duration_ms'),
    scoredCases: jsonb('scored_cases').notNull().default([]),
    snapshot: jsonb('snapshot').notNull(),
  },
  (t) => ({
    runNumberUq: uniqueIndex('eval_suite_runs_agent_run_number_uq').on(t.agentId, t.runNumber),
    oneRunningUq: uniqueIndex('eval_suite_runs_one_running_uq')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
    agentStartedIdx: index('eval_suite_runs_agent_started_idx').on(t.agentId, t.startedAt),
    wsStartedIdx: index('eval_suite_runs_ws_started_idx').on(t.workspaceId, t.startedAt),
  }),
);

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    // Set for agent-owned cases; null for skill-owned rows.
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    sourceFindingId: uuid('source_finding_id').references(() => findings.id, {
      onDelete: 'set null',
    }),
    source: jsonb('source'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    agentFindingUq: uniqueIndex('eval_cases_agent_finding_uq').on(t.agentId, t.sourceFindingId),
    // Postgres does not index FK columns: the `set null` on finding delete needs this.
    sourceFindingIdx: index('eval_cases_source_finding_idx').on(t.sourceFindingId),
  }),
);

// `actualOutput` holds `{ grounded: Finding[], dropped: { finding, reason }[] }`.
export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    suiteRunId: uuid('suite_run_id').references(() => evalSuiteRuns.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    status: text('status', { enum: ['running', 'passed', 'failed', 'errored'] })
      .notNull()
      .default('running'),
    error: text('error'),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    matchedMustFind: integer('matched_must_find'),
    mustFindTotal: integer('must_find_total'),
    noiseCount: integer('noise_count'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => ({
    caseRanIdx: index('eval_runs_case_ran_idx').on(t.caseId, t.ranAt),
    suiteRunIdx: index('eval_runs_suite_run_idx').on(t.suiteRunId),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});

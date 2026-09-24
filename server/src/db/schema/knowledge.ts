import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
  vector,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/** Lifecycle of an extracted convention candidate. A re-scan replaces `pending`
    rows only, so a rule the user rejected never comes back. */
export const CONVENTION_STATUS = ['pending', 'accepted', 'rejected'] as const;
export type ConventionStatus = (typeof CONVENTION_STATUS)[number];

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    category: text('category').notNull().default('general'),
    rule: text('rule').notNull(),
    evidencePath: text('evidence_path'),
    /** 1-based line the snippet was VERIFIED at, not the line the model claimed.
        Feeds the `#L<n>` fragment of the GitHub deep link. */
    evidenceLine: integer('evidence_line'),
    evidenceSnippet: text('evidence_snippet'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: CONVENTION_STATUS }).notNull().default('pending'),
    /** Dedupe key: sha256 of the normalized rule text. Makes a re-scan that
        re-derives the same rule an update rather than a second card. */
    ruleHash: text('rule_hash').notNull(),
    scanId: uuid('scan_id'),
    createdAt: now(),
  },
  (t) => ({
    // repo_id is nullable, and Postgres treats NULLs as distinct in a unique
    // index — so this constrains repo-scoped rows only. Every row this feature
    // writes carries a repo_id; a future global convention would need its own key.
    repoRuleUq: uniqueIndex('conventions_repo_rule_uq').on(t.repoId, t.ruleHash),
    repoIdx: index('conventions_repo_idx').on(t.repoId),
  }),
);

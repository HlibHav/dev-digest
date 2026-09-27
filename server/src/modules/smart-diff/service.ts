import type { SmartDiff } from '@devdigest/shared';
import { ROLE_ORDER } from './constants.js';
import { classifyFile } from './classify.js';

/**
 * Pure assembly for Smart Diff, plus the service that wires it to storage.
 * No `fastify`, no `drizzle-orm`, no `src/db/**` import — the port below is a
 * plain local interface, satisfied structurally by `ReviewRepository` without
 * a cast (onion-architecture step 3).
 */

/**
 * `reviewsForPull` returns newest-first; keep only the first (= latest) review
 * per `agentId` (`null` is its own key) and flatten its findings. Accepted and
 * dismissed findings still count — only the "one review per agent" rule
 * excludes anything.
 */
export function latestReviewPerAgent<R extends { agentId: string | null }, F>(
  rows: { review: R; findings: F[] }[],
): F[] {
  const seen = new Set<string | null>();
  const findings: F[] = [];
  for (const { review, findings: rowFindings } of rows) {
    if (seen.has(review.agentId)) continue;
    seen.add(review.agentId);
    findings.push(...rowFindings);
  }
  return findings;
}

/** Pure grouping + split-suggestion fill. Never calls a model, never touches
 *  the DB — safe to call before any review has run. */
export function buildSmartDiff(
  files: { path: string; additions: number; deletions: number }[],
  findings: { file: string; start_line: number }[],
): SmartDiff {
  const byRole = new Map<string, typeof files>();
  for (const file of files) {
    const role = classifyFile(file.path);
    const list = byRole.get(role) ?? [];
    list.push(file);
    byRole.set(role, list);
  }

  const groups = ROLE_ORDER.filter((role) => (byRole.get(role) ?? []).length > 0).map((role) => ({
    role,
    files: (byRole.get(role) ?? []).map((file) => ({
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: [
        ...new Set(
          findings.filter((f) => f.file === file.path).map((f) => f.start_line),
        ),
      ].sort((a, b) => a - b),
    })),
  }));

  const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  return {
    groups,
    split_suggestion: {
      too_big: false,
      total_lines: totalLines,
      proposed_splits: [],
    },
  };
}

/** The narrow slice of storage Smart Diff needs — satisfied structurally by
 *  `ReviewRepository` (its real row types are wider and assignable here
 *  without a cast). Declared locally so this module imports no other
 *  module's repository or DB row types (onion: no cross-module import). */
export interface SmartDiffStorePort {
  getPull(workspaceId: string, prId: string): Promise<{ id: string } | undefined>;
  getPrFiles(prId: string): Promise<{ path: string; additions: number; deletions: number }[]>;
  reviewsForPull(prId: string): Promise<
    { review: { agentId: string | null }; findings: { file: string; startLine: number }[] }[]
  >;
}

export class SmartDiffService {
  constructor(private store: SmartDiffStorePort) {}

  async getSmartDiff(workspaceId: string, prId: string): Promise<SmartDiff | undefined> {
    const pull = await this.store.getPull(workspaceId, prId);
    if (!pull) return undefined;

    const [files, reviews] = await Promise.all([
      this.store.getPrFiles(prId),
      this.store.reviewsForPull(prId),
    ]);

    const findings = latestReviewPerAgent(reviews).map((f) => ({
      file: f.file,
      start_line: f.startLine,
    }));

    return buildSmartDiff(files, findings);
  }
}

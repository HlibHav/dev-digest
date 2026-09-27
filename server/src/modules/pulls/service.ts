import type { GitHubClient, PrDetail } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { PullsRepository } from './repository.js';

/**
 * F1 — pulls service. Today it owns exactly one behaviour: refreshing one
 * PR's detail (files/commits/body) from GitHub, falling back to the
 * persisted rows when GitHub is unavailable — the SAME logic `GET
 * /pulls/:id` ran inline before [D6]. Extracted so the intent module can
 * reuse it (`ports.refreshPullDetail`) instead of duplicating it, per
 * onion-architecture: a new service takes ports, not `Container`.
 */
export interface PullsPorts {
  repo: PullsRepository;
  github(): Promise<GitHubClient>;
  log?(message: string): void;
}

export class PullsService {
  constructor(private ports: PullsPorts) {}

  /**
   * Refresh one PR's files/commits/body from GitHub and persist them; falls
   * back to what's already stored (offline / no token / GitHub error) so the
   * PR still resolves. Behaviour is UNCHANGED from the previous inline route.
   */
  async refreshPullDetail(workspaceId: string, prId: string): Promise<PrDetail> {
    const pull = await this.ports.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.ports.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    try {
      const gh = await this.ports.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pull.number);

      await this.ports.repo.replaceFiles(pull.id, detail.files);
      await this.ports.repo.replaceCommits(pull.id, detail.commits);
      await this.ports.repo.updateDetail(pull.id, {
        body: detail.body ?? null,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });

      return { ...detail, id: pull.id };
    } catch (err) {
      this.ports.log?.(
        `GitHub PR detail refresh skipped (no token / offline); serving persisted detail: ${(err as Error).message}`,
      );
      const files = await this.ports.repo.getFiles(pull.id);
      const commits = await this.ports.repo.getCommits(pull.id);
      return {
        id: pull.id,
        number: pull.number,
        title: pull.title,
        author: pull.author,
        branch: pull.branch,
        base: pull.base,
        head_sha: pull.headSha,
        additions: pull.additions,
        deletions: pull.deletions,
        files_count: pull.filesCount,
        status: pull.status as PrDetail['status'],
        opened_at: pull.openedAt?.toISOString() ?? null,
        updated_at: pull.updatedAt?.toISOString() ?? null,
        body: pull.body ?? null,
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  }
}

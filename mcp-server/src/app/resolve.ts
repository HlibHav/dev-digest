import type { Agent, PrMeta, Repo } from '@devdigest/shared';
import type { ApiClient } from '../ports/api-client.js';
import { ToolError } from './errors.js';

const MAX_KNOWN_REPOS = 10;

/** Matches `repo` ("owner/name") against `full_name` from `GET /repos`, case-insensitively.
 * Throws E1, listing at most 10 known repos, when nothing matches. */
export async function resolveRepo(api: ApiClient, repo: string): Promise<Repo> {
  const repos = await api.listRepos();
  const match = repos.find((r) => r.full_name.toLowerCase() === repo.toLowerCase());
  if (!match) {
    const known = repos.slice(0, MAX_KNOWN_REPOS).map((r) => r.full_name);
    const list = known.length > 0 ? known.join(', ') : 'none';
    throw new ToolError(
      `Repo "${repo}" is not in DevDigest. Known repos: ${list}. Add it in the DevDigest UI (Add repository), then retry.`,
    );
  }
  return match;
}

/** Maps `pr` to the PR imported for the already-resolved `repo`. Throws E2 when the PR
 * number isn't imported there — the same number in a different repo doesn't match. */
export async function resolvePr(
  api: ApiClient,
  repo: Repo,
  pr: number,
): Promise<PrMeta & { id: string }> {
  const pulls = await api.listPulls(repo.id);
  const match = pulls.find((p) => p.number === pr);
  if (!match || !match.id) {
    throw new ToolError(
      `PR #${pr} is not imported for ${repo.full_name}. Check the number; DevDigest imports open PRs from GitHub when a GitHub token is set in Settings.`,
    );
  }
  return match as PrMeta & { id: string };
}

/** Tries an exact id first, then an exact case-insensitive name. Throws E3 for no match and
 * E4, listing the matching ids, for an ambiguous name. */
export async function resolveAgent(api: ApiClient, agent: string): Promise<Agent> {
  const agents = await api.listAgents();
  const byId = agents.find((a) => a.id === agent);
  if (byId) return byId;

  const byName = agents.filter((a) => a.name.toLowerCase() === agent.toLowerCase());
  if (byName.length === 0) {
    throw new ToolError(`Agent "${agent}" not found — call devdigest_list_agents for valid ids.`);
  }
  if (byName.length > 1) {
    const ids = byName.map((a) => a.id).join(', ');
    throw new ToolError(
      `Agent name "${agent}" matches ${byName.length} agents (${ids}) — pass the id from devdigest_list_agents.`,
    );
  }
  return byName[0]!;
}

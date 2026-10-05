/**
 * F1 — repos module constants (extracted from routes.ts; no behaviour change).
 */

/** JobRunner kind for the asynchronous `git clone` job. */
export const CLONE_JOB_KIND = 'clone';

/** Clone depth — shallow clone (latest commit only) keeps imports fast. */
export const CLONE_DEPTH = 1;

/** Secret name (via the Secrets adapter) holding the GitHub PAT for private clones. */
export const GITHUB_TOKEN_SECRET = 'GITHUB_TOKEN';

/**
 * Parse `owner`/`repo` from a GitHub URL — supports both
 * `https://github.com/owner/repo(.git)` and `git@github.com:owner/repo.git`
 * (`www.` optional on the https form).
 *
 * ANCHORED AT BOTH ENDS on purpose. Unanchored, the host was never checked:
 * `https://evil.com/x/github.com/a/b` parsed as `a/b` and was handed to
 * `git clone` as-is. Anything else now fails `parseRepoUrl` with a 400 rather
 * than being half-understood.
 */
export const GITHUB_URL_REGEX =
  /^(?:https:\/\/(?:www\.)?github\.com\/|git@github\.com:)([^/]+)\/([^/.]+)(?:\.git)?\/?$/;

/**
 * Characters allowed in an `owner` / `repo` segment. Both segments become path
 * components under the clone dir, so a separator or a dots-only segment would
 * escape it — `SimpleGitClient.clone` then `rm -rf`s a destination that has no
 * `.git`. `..` satisfies this pattern, so `DOTS_ONLY_SEGMENT_REGEX` rejects it
 * separately.
 */
export const GITHUB_SEGMENT_REGEX = /^[A-Za-z0-9._-]+$/;

/** A segment made only of dots (`.`, `..`) — never a real owner or repo name. */
export const DOTS_ONLY_SEGMENT_REGEX = /^\.+$/;

/** Username embedded into an authenticated https github.com clone URL. */
export const GIT_TOKEN_USERNAME = 'x-access-token';

/** Host for which a token is embedded into an https clone URL. */
export const GITHUB_HTTPS_HOST = 'github.com';

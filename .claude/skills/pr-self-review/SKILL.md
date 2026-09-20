---
name: pr-self-review
description: Reviews the local changes before they leave the machine as a pull request. Reads the diff, names the surfaces it touches, routes each surface to the skills that own it — `client/**` to frontend-ui-architecture + react-best-practices + react-testing-library + security + zod; `server/**` and `reviewer-core/**` to onion-architecture + fastify-best-practices + drizzle-orm-patterns + security + zod; `.claude/hooks/**` to security — grades each finding, and writes a verdict artifact. One critical finding means `blocked`. The enforcing `gh pr create` hook ships **unregistered** (`.claude/hooks/pr-self-review.py` is in the repo but not in `.claude/settings.json`), so invoke this skill deliberately — nothing calls it for you. Use before opening a pull request, before a commit, and when asked to self-review or sanity-check a change. Also triggers on "self review", "review my diff", "before I commit", "готово?", "перевір мої зміни", "самоперевірка". Routes only — it does NOT restate the routed skills' rules, does not hunt for correctness bugs (that is code-review), and does not run a package's typecheck/test gate (that is **Check** in the root CLAUDE.md).
---

# pr-self-review

A dispatcher with a verdict. It looks at what actually changed, hands each surface to the skill
that owns it, grades what comes back, and records the result where the (currently unregistered)
`gh pr create` hook would look for it.
Everything it would otherwise explain lives in the skills it routes to — read them there, never
paraphrase them here.

1. **Pick the mode first, and say which one.** The mode decides the diff, and the wrong diff is
   how this gate fails silently.

   | Mode | When | Scope |
   |---|---|---|
   | pre-PR | you are about to open a PR (or the hook is registered and denied a `gh pr create`) | `git merge-base HEAD origin/main` → `git diff <base>...HEAD`, **plus** any uncommitted delta |
   | pre-commit | "перевір мої зміни", "before I commit" | uncommitted only: `git status --porcelain` + `git diff HEAD` |

   In pre-PR mode the work is usually already committed. **Never report "nothing to review" on a
   branch that has commits ahead of its base** — that reading means you took the pre-commit diff
   by mistake. An empty diff is a valid outcome only when the branch is genuinely at its base with
   a clean tree.

2. **Name the surfaces before reading any rule.** Group the changed paths and state each surface
   with its file count. This is the routing input, so it appears in the report even when only one
   surface fires.

3. **Route.** Load, for each surface present:

   | Changed paths | Load |
   |---|---|
   | `client/**` | `frontend-ui-architecture`, `next-best-practices`, `react-best-practices`, `react-testing-library`, `security`, `zod` |
   | `server/**`, `reviewer-core/**` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `security`, `zod` |
   | `server/src/db/**` | the row above **plus** `postgresql-table-design` |
   | `e2e/**` | no skill owns this surface — review against `e2e/CLAUDE.md` |
   | `.claude/hooks/**` | `security` |
   | `*.md`, `docs/`, `scripts/`, `.claude/` **except** `.claude/hooks/**` | unrouted |

   `typescript-expert` is deliberately absent: it applies to every TypeScript line in the repo,
   so routing it would load it on every run and say nothing about the change.

   `.claude/hooks/**` is the one executable surface outside the packages: a hook script runs on
   every matching tool call with the user's own privileges, so it routes to `security` even
   though no package owns Python. The gate added that row after shipping its own hook through an
   all-unrouted diff — a review that read nothing.

   A surface is code only: a `*.md` path is **unrouted even inside a routed surface**, so
   `server/INSIGHTS.md` alone pulls in nothing. A surface absent from the diff routes to nothing
   and its skills stay unloaded — say so in the report rather than loading them "just in case".
   Unrouted paths are listed, never silently dropped.

4. **Review the diff against each loaded skill, not the file.** The unit of judgement is the
   changed hunk. A rule the surrounding file already broke before this diff is grandfathered —
   cite it only if the diff extends it. Every finding carries `path:line`, a severity, and the
   rule named as the owning skill names it.

5. **Grade every finding. `critical` is a short, mechanical list — keep it that way.**

   | Level | Effect | What qualifies |
   |---|---|---|
   | `critical` | blocks the PR | a hardcoded secret or credential; a route with no authz check; unvalidated input reaching a query; SQL built from request data; a hand-edited file under `server/src/db/migrations/` |
   | `major` | reported | an onion boundary leak (a service importing `db/schema`); a Fastify route with no zod schema; a client component fetching data directly |
   | `minor` | reported | naming, file placement, a missing colocated test |

   Anything you want to call critical that is not on that list is `major`. A gate that blocks on
   taste gets switched off within a week, and then it protects nothing.

6. **Delegate when the diff is big.** Over ~10 changed files or ~400 changed lines, give each
   surface its own subagent with that surface's skills and its slice of the diff, and keep only the
   findings. Below that, review inline — a subagent per surface costs more than it saves.

7. **Report one block, in this shape.** The verdict is `ready` or `blocked`, and it is keyed on
   `critical` alone: any critical → `blocked`; otherwise `ready`, findings and all.

   ```
   Mode:      pre-PR (base origin/main, 6 commits, 1 uncommitted file)
   Surfaces:  server (8 files) · unrouted (1: server/INSIGHTS.md)
   Routed:    onion-architecture, fastify-best-practices, drizzle-orm-patterns, security, zod
   Skipped:   client — no client/** paths in the diff
   Findings:  2
     [critical] server/src/modules/auth/routes.ts:31 — security: route has no authz check.
     [major]    server/src/modules/x/service.ts:42 — onion-boundaries: service imports db/schema.
   Verdict:   blocked — 1 critical. Fix it, then re-run.
   ```

8. **In pre-PR mode, write the verdict artifact — `ready` and `blocked` alike.** When the
   `gh pr create` hook is registered it reads the artifact and denies on missing, stale or
   `blocked`, so skipping this step in pre-PR mode is the same as reporting `blocked`. The hook
   is unregistered by default, which changes who enforces the verdict, not whether you write it:
   the artifact is still the record of what was reviewed and at which `head_sha`.

   **Pre-commit mode writes nothing.** Its diff covers only uncommitted work, so a `ready` from it
   says nothing about the commits already on the branch. Writing it would hand the hook a verdict
   for a review that never looked at what the PR would actually contain. The artifact records its
   `mode`, and the hook accepts only `pre-PR`.

   Path: `~/.claude/state/pr-self-review/<repo>-<branch>.json`, where `<branch>` is
   `git branch --show-current` with `/` → `-`, and `<repo>` is

   ```sh
   basename "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
   ```

   **Not** `basename $(git rev-parse --show-toplevel)`: inside a worktree that returns the
   worktree's own directory name, so a verdict written in one worktree would be invisible to a
   hook running in another on the same branch. The common-dir form returns the repository from
   both.

   ```json
   {
     "verdict": "blocked",
     "mode": "pre-PR",
     "base_sha": "<git merge-base HEAD origin/main>",
     "head_sha": "<git rev-parse HEAD>",
     "dirty_hash": "<see below>",
     "findings": [
       { "severity": "critical", "path": "server/src/modules/auth/routes.ts", "line": 31,
         "skill": "security", "rule": "missing authz check", "note": "…" }
     ],
     "ts": "<ISO-8601 UTC>"
   }
   ```

   `dirty_hash` is the freshness key for uncommitted work. Compute it with exactly this pipeline,
   because the hook recomputes it the same way and any difference reads as stale:

   ```sh
   { git diff HEAD; git ls-files --others --exclude-standard -z | sort -z | xargs -0 -I{} shasum -a 256 {}; } | shasum -a 256
   ```

   **Freshness is `head_sha` + `dirty_hash`, and only those two.** Together they fully determine
   the working-tree content the review actually looked at, so a verdict dies the moment a commit
   lands or a single uncommitted line changes. `base_sha` is recorded for information — what the
   diff was taken against — but a mismatch there must **not** mark the verdict stale: `origin/main`
   moves on any fetch, and `git merge-base` would then recompute a different base for code nobody
   touched, denying a PR that is genuinely clean.

   On a detached HEAD there is no branch to key the file on. Report that and write no artifact;
   the hook then denies as missing, which is the right conservative outcome.

   Never hand-edit this file to unblock a PR — fix the finding and re-run.

9. **Find, don't fix.** This pass produces findings; applying them is a separate step the user asks
   for. Fixing inside the review is how a review stops being independent of the work.

10. **Zero findings is a real outcome.** Report `ready`, write the artifact, stop. Padding a clean
    diff with style opinions trains the next session to ignore the gate.

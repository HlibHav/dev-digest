---
name: pr-self-review
version: 1.0.0
description: Second-pass self-review of the UNCOMMITTED diff before a change is called done. Reads the diff, decides which surfaces it touches, routes each surface to the skills that own it — `client/**` to frontend-ui-architecture + react-best-practices + react-testing-library; `server/**` and `reviewer-core/**` to onion-architecture + fastify-best-practices + drizzle-orm-patterns — and collects one verdict. Use before reporting a task finished, before any commit or pull request, and when asked to self-review, re-check or sanity-check a change. Also triggers on "self review", "review my diff", "before I commit", "готово?", "перевір мої зміни", "самоперевірка". Routes only — it does NOT restate the routed skills' rules, does not hunt for correctness bugs (that is code-review), and does not run a package's typecheck/test gate (that is **Check** in the root CLAUDE.md).
---

# pr-self-review

A dispatcher. Its whole job is to look at what actually changed, hand each surface to the skill
that owns it, and turn the answers into one go / no-go line. Everything it would otherwise explain
lives in the skills it routes to — read them there, never paraphrase them here.

1. **Take the uncommitted diff, and only that.** `git status --porcelain` (so untracked files
   count) plus `git diff HEAD --stat`. Committed work is out of scope: this gate is about what you
   are *about to* hand over. An empty diff is a valid outcome — say "nothing uncommitted to review"
   and stop.
2. **Name the surfaces before reading any rule.** Group the changed paths into surfaces and say out
   loud which ones you found, with the file count each. This is the routing input, so it is stated
   in the report even when only one surface fires.
3. **Route.** Load, for each surface present:

   | Changed paths | Load |
   |---|---|
   | `client/**` | `frontend-ui-architecture`, `react-best-practices`, `react-testing-library` |
   | `server/**`, `reviewer-core/**` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns` |

   A surface is code only: a `*.md` path is **unrouted even inside a routed surface**, so
   `server/INSIGHTS.md` does not pull in the backend skills. A surface that is absent from the diff
   routes to nothing and its skills stay unloaded — say so in the report rather than loading them
   "just in case". Everything outside both surfaces (`e2e/`, `docs/`, `scripts/`, `.claude/`, and any
   `*.md`) is listed as unrouted, not silently dropped.
4. **Review the diff against each loaded skill, not the file.** The unit of judgement is the changed
   hunk. A rule the surrounding file already broke before this diff is grandfathered — cite it only
   if the diff extends it. Every finding carries `path:line` and the rule it breaks, named as the
   skill names it.
5. **Delegate when the diff is big.** Over ~10 changed files or ~400 changed lines, give each
   surface its own subagent with that surface's skills and its slice of the diff, and keep only the
   findings. Below that, review inline — a subagent per surface costs more than it saves on a small
   diff.
6. **Report one block, in this shape.** Surfaces detected → skills loaded per surface → findings
   (or "none") → verdict. The verdict is `ready` or `not ready`, and `not ready` names what must
   change first:

   ```
   Surfaces:  server (8 files) · unrouted (1 file: server/INSIGHTS.md)
   Routed:    onion-architecture, fastify-best-practices, drizzle-orm-patterns
   Skipped:   client — no client/** paths in the diff
   Findings:  1
     - server/src/modules/x/service.ts:42 — onion-boundaries: a service imports db/schema.
       Move the query behind the repository.
   Verdict:   not ready — fix the boundary leak, then re-run.
   ```
7. **Find, don't fix.** This pass produces findings; applying them is a separate step the user asks
   for. Fixing inside the review is how a review stops being independent of the work.
8. **Zero findings is a real outcome.** Report `ready` and stop. Padding a clean diff with style
   opinions trains the next session to ignore the gate.

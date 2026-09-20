# PR Self Review — build plan

Plan only. Nothing here is implemented yet, and one decision (§3) needs sign-off before it can be.

## 1. The brief

1. A skill named **PR Self Review**.
2. Runs **before every PR opened on GitHub**, and on demand.
3. Reviews **all open local changes**.
4. Matches **the skills we already have** to the diff: UI skills on UI files, backend and
   architecture skills on backend files.
5. **One critical finding forbids the merge.**

### What this gate can and cannot enforce

It blocks **PR creation** — `gh pr create` is denied while a critical finding stands. It does not
block a merge on GitHub: nothing local can. If the merge itself must be gated, that is branch
protection plus a required CI check, a separate piece of work. Worth knowing up front, because the
brief says "forbid the merge" and this stops one step earlier, at the point where the change would
first leave the machine through a PR.

## 2. Two components

The skill and the hook do different jobs and neither works alone.

| | Job | Why it cannot be the other one |
|---|---|---|
| `.claude/skills/pr-self-review/SKILL.md` | Reads the diff, routes surfaces to owning skills, produces findings with severities and a verdict | A skill is text. It persuades; it cannot deny a tool call. |
| `.claude/hooks/pr-self-review.py` + `.claude/settings.json` | Intercepts `gh pr create` and denies it when the standing verdict is `blocked` or missing | A hook is a shell script. It cannot reason about a diff against an architecture skill. |

## 3. ADR — how the hook learns the verdict · **needs sign-off**

The hook fires in milliseconds and has no model. The verdict needs a model plus the project
skills. Bridging that gap is the whole design, and there are two credible ways.

**Constraint that drives this:** the reference hook on this machine
(`~/.claude/hooks/prepush-review.py`) spawns a nested `claude -p` with `--setting-sources ""`
to stop the nested run from re-triggering hooks. That flag also means the nested run **cannot
load `.claude/skills/`** — precisely the skills this gate is supposed to route to.

### Option A — verdict artifact, hook only checks freshness · **recommended**

The skill runs in the normal session, where the project skills are loaded natively, and writes its
verdict to `~/.claude/state/pr-self-review/<repo>-<branch>.json`. The hook reads that file and
denies if the verdict is missing, stale or `blocked`.

Freshness is the entire security of this design. The artifact records `head_sha` and a hash of the
uncommitted diff; the hook recomputes **those two** and treats a mismatch as missing. A verdict
therefore dies the instant a commit lands or a single line changes, and cannot be faked by
touching a file. `base_sha` is recorded for information only — `origin/main` moves on any fetch,
so keying freshness to it would deny PRs for code nobody touched.

- **For:** routing works exactly as designed, because the real session owns the skills. No nested
  model, so no added cost, no timeout, no recursion surface. The deny message carries the actual
  findings.
- **Against:** the first `gh pr create` on a fresh branch is always denied, with "run the skill
  first". One extra step, and it is the step the brief is asking for.

### Option B — hook inlines the skills into a nested `claude -p`

The hook reads the routed `SKILL.md` files off disk itself and pastes them into the nested prompt
as plain text, which sidesteps `--setting-sources ""`.

- **For:** fully automatic, no second step for the user.
- **Against:** reimplements skill loading in Python and drifts the moment a skill's layout changes —
  the existing skills are already inconsistent (`reference.md`, `references.md`, `examples.md`).
  Adds a model call, its cost, and its timeout to every PR.

**Recommendation: A.** B buys one saved keystroke and pays for it with a hand-rolled copy of the
skill loader that will silently rot.

## 4. The skill

### 4.1 Diff scope — two modes

| Mode | Trigger | Scope |
|---|---|---|
| pre-PR | the hook, or "готуюсь відкривати PR" | `git diff $(git merge-base HEAD origin/main)...HEAD`, plus any uncommitted delta |
| pre-commit | "перевір мої зміни", "before I commit" | uncommitted only: `git status --porcelain` + `git diff HEAD` |

Getting this wrong is how the first attempt failed: it reviewed only uncommitted work, so at
`gh pr create` — when everything is committed — it saw an empty diff and passed. **Pre-PR mode must
never report "nothing to review" on a branch that has commits.**

### 4.2 Routing table

Static by design: auditable, and it avoids parsing every skill's frontmatter on each run.

| Changed paths | Load |
|---|---|
| `client/**` | `frontend-ui-architecture`, `next-best-practices`, `react-best-practices`, `react-testing-library`, `security`, `zod` |
| `server/**`, `reviewer-core/**` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `security`, `zod` |
| `server/src/db/**` | the above **plus** `postgresql-table-design` |
| `e2e/**` | `e2e/CLAUDE.md` conventions — no skill owns this surface yet |
| `*.md`, `docs/`, `scripts/`, `.claude/` | unrouted; listed in the report, never silently dropped |

`security` on both surfaces is the load-bearing row: it is the skill most likely to produce a real
critical, and it is the one the first attempt left out. A `*.md` path is unrouted even inside a
routed surface, so `server/INSIGHTS.md` alone pulls in nothing.

### 4.3 Severity — what "critical" means

Without this the gate blocks on nits and gets switched off within a week. The critical set is
deliberately small and mechanical.

| Level | Effect | Examples |
|---|---|---|
| `critical` | denies the PR | hardcoded secret or credential; a route with no authz check; unvalidated input reaching a query; SQL built from request data; a hand-edited file under `server/src/db/migrations/` |
| `major` | reported | onion boundary leak (a service importing `db/schema`); a Fastify route with no zod schema; a client component fetching data directly |
| `minor` | reported | naming, file placement, a missing colocated test |

Verdict: any `critical` → `blocked`. Otherwise `ready`, findings and all.

### 4.4 Review rules

- **Judge the hunk, not the file.** A rule the surrounding file already broke is grandfathered —
  cite it only if this diff extends it.
- **Every finding carries `path:line`, its severity, and the rule named as the owning skill names
  it.** No paraphrasing a skill's rules into the report.
- **Find, don't fix.** Applying findings is a separate step the user asks for.
- **Zero findings is a real outcome.** Report `ready` and stop; padding a clean diff teaches the
  next session to ignore the gate.
- **Delegate above ~10 files or ~400 changed lines:** one subagent per surface with that surface's
  skills, keep only the findings.

### 4.5 Report shape

```
Surfaces:  server (8 files) · unrouted (1: server/INSIGHTS.md)
Routed:    onion-architecture, fastify-best-practices, drizzle-orm-patterns, security, zod
Skipped:   client — no client/** paths in the diff
Findings:  2
  [critical] server/src/modules/auth/routes.ts:31 — security: route has no authz check.
  [major]    server/src/modules/x/service.ts:42 — onion-boundaries: service imports db/schema.
Verdict:   blocked — 1 critical. Fix it, then re-run.
```

## 5. The hook

Modelled directly on `~/.claude/hooks/prepush-review.py`, which already solved these problems the
hard way. Copy its shape; do not rediscover its incidents.

1. **Matcher is `"Bash"`** — the plain tool name in `.claude/settings.json`. All filtering happens
   inside the script, against `tool_input.command`.
   **Landmine, named so nobody reintroduces it:** the `type: agent` hook with `if: Bash(git push*)`
   was disabled on 2026-09-13 because the harness runs an `if`-filtered hook anyway when it cannot
   parse the command — 172 of 198 blocks fired on commands containing no push at all.
2. **Cheap no-op path first.** No `gh pr create` in the command → `return 0` before any git call.
   This is the 99% case and must cost nothing.
3. **Deny with JSON on stdout, exit 0:**
   `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
   "permissionDecisionReason": "<the findings>"}}`. Not exit code 2 — per `prepush-review.py`, a
   non-zero exit is a non-blocking error here and would never deny.
4. **Fail open on infrastructure, closed on the absence of a verdict.** These are different
   things. A broken `git` means the gate cannot form an opinion → allow and log. A missing,
   unreadable or stale artifact *is* the opinion — nobody reviewed this → deny.
5. **No line cap.** `prepush-review.py` skips diffs over 1500 lines because each one costs a
   Sonnet call. This hook calls no model — its only work is a `shasum` over the tree — so a cap
   would buy nothing and would hand every large PR a free pass, which is the opposite of the point.
6. **One JSONL line per non-noop invocation** to `~/.claude/state/pr-self-review/log.jsonl`, so the
   gate's behaviour is measurable.
7. **Escape hatch:** an explicit override phrase from the user, so the gate is bypassed
   deliberately rather than by someone disabling the hook permanently.

### Relationship to the existing global push gate

`~/.claude/hooks/prepush-review.py` already reviews the diff on `git push`, in every project, with
a nested Sonnet that cannot see this repo's skills. This gate fires on `gh pr create` and routes
project skills the global one has no access to. Different command, different reviewer, no double
review of the same action — which is also why the hook here deliberately does **not** match
`git push`. Do not "deduplicate" these later.

## 6. Build order

1. Write `SKILL.md`: the two modes, routing table, severity model, review rules, report shape.
2. Exercise it by hand on a real branch in both modes, and confirm pre-PR mode sees committed work.
3. Define the verdict artifact: path, fields, freshness keys.
4. Teach the skill to write the artifact.
5. Write `.claude/hooks/pr-self-review.py` per §5.
6. Register the `PreToolUse` hook in `.claude/settings.json`.

## 7. Verification

| Fixture | Expected |
|---|---|
| Branch with a hardcoded secret in `server/**` | skill → `blocked`; hook denies `gh pr create` |
| Clean docs-only branch | all surfaces unrouted; `ready`; hook allows |
| Verdict is `ready`, then one more line is committed | freshness keys mismatch → hook denies as stale |
| Verdict is `ready`, then `git fetch` moves `origin/main` | verdict stays valid — base is not a freshness key |
| Detached HEAD | skill writes no artifact; hook denies as missing |
| Bash command with no `gh pr create` | hook returns 0 with no git call and no log line |
| Artifact deleted or corrupt | hook **denies** — a missing verdict is a verdict: nobody reviewed this |
| `git` itself unusable | hook fails open, writes a log line |

### Verified on 2026-09-20

Both open questions about the harness were settled empirically, with a temporary probe hook and a
nested `claude -p` run inside `.claude/worktrees/pr-self-review-skill`:

- **User and project `PreToolUse` hooks merge; the project one does not shadow the user one.** A
  single `git push --dry-run` in the nested session produced both a `skip-dry-run` line in
  `~/.claude/state/prepush-review/log.jsonl` and a probe line from the project hook, same cwd, same
  command. Registering this gate does not disable the global push gate.
- **`$CLAUDE_PROJECT_DIR` resolves to the worktree root**, not the main checkout
  (`…/.claude/worktrees/pr-self-review-skill`), so the registered hook path is correct in every
  worktree.

All of §7 passes, plus ten command-recognition cases. Two end-to-end runs: a branch with a
hardcoded secret, raw SQL and no authz in `server/**` produced three criticals, a `blocked` verdict
and a hook deny; a docs-only branch produced no findings, `ready`, and a hook allow.

The hook's own matching was hardened during this pass. `gh pr create` is now recognised only in
command position, after heredoc bodies and quoted strings are stripped: the first version denied
`grep -rn 'gh pr create' docs/` and any heredoc whose prose mentioned the phrase. The live
`prepush-review.py` log showed the same class of bug costing $0.07 and 12.7s on a heredoc that
merely contained the words "git push".

## 8. Where this lands

The skill and the hook go on `feat/reviewer-skills`, beside `onion-architecture` and
`frontend-ui-architecture` — the routing table's own targets — and ship as one PR. This plan is
committed on `claude/pr-self-review-skill-plan-76f0be`.

## 9. History

A first `SKILL.md` was written when only a plan was asked for. It never reached `main` or
`origin/main`, and both local branches carrying it have been reverted (`618876c` on
`fix/clone-path-traversal-and-job-crash`, `002608f` on `feat/reviewer-skills`). Its routing,
find-don't-fix rule, grandfathering and report shape were sound and are carried into §4 above; its
diff scope and its missing severity model were the reasons to start over. Readable if needed at
`git show 65e288e:.claude/skills/pr-self-review/SKILL.md`.

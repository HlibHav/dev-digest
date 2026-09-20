# pr-self-review — gap analysis and closing plan

Compares the first attempt at the skill (`65e288e`, now reverted) against the original brief.
Plan only — no implementation here. The skill will be written from this plan.

## Original brief

1. A skill named PR Self Review.
2. Runs **before every PR opened on GitHub**, or manually.
3. Checks **all open local changes**.
4. Analyses **the skills we have** and matches them to the diff: UI skills on UI files,
   backend/architecture skills on backend files.
5. **If at least one critical finding exists, the user is forbidden to merge.**

## Gap table

| # | Brief requirement | Current state | Severity |
|---|---|---|---|
| 1 | Check local changes before opening a PR | Step 1 takes `git status --porcelain` + `git diff HEAD` and calls committed work explicitly out of scope | **Blocker — fails open** |
| 2 | Block on ≥1 critical finding | No severity taxonomy at all; verdict is binary off *any* finding | **Blocker** |
| 3 | Runs automatically before each PR | Description-triggered only; no hook in `.claude/settings.json` | **Blocker** |
| 4 | Forbid the merge | `not ready` is a sentence in a report, nothing enforces it | **Blocker** |
| 5 | Match all available skills to the diff | Static table covers 2 surfaces; `security`, `zod`, `e2e/` are missing | Major |

### 1. Diff scope is wrong for the stated trigger

By the time `gh pr create` runs, the work is committed. The skill then sees an empty
uncommitted diff, reports "nothing uncommitted to review", and passes. The gate fails open at
exactly the moment it was built for.

Two modes, chosen by how the skill was invoked:

- **pre-PR mode** (hook-triggered): `git diff $(git merge-base HEAD origin/main)...HEAD`
  plus any uncommitted delta on top.
- **pre-commit mode** (manual, "перевір мої зміни"): current behaviour, uncommitted only.

### 2. No severity taxonomy

`critical` has to be defined per routed skill, or the gate blocks on nits and gets ignored
within a week. Proposed three levels, with the critical set kept deliberately small:

| Level | Meaning | Examples |
|---|---|---|
| `critical` | Blocks the PR | hardcoded secret or credential; a route with no authz check; unvalidated input reaching a query; a raw SQL string built from request data; a migration hand-edited under `server/src/db/migrations/` |
| `major` | Reported, does not block | onion boundary leak (service imports `db/schema`); a Fastify route with no zod schema; a client component doing data fetching directly |
| `minor` | Reported, does not block | naming, file placement, missing colocated test |

Each finding gains a `severity` field. Verdict becomes: any `critical` → `blocked`;
otherwise `ready` with findings listed.

### 3 + 4. The hook is the only thing that can actually block

A skill cannot enforce anything — it only writes text. Enforcement needs a `PreToolUse` hook
in `.claude/settings.json`:

- Matcher: `Bash(gh pr create*)`.
- The hook invokes the skill in pre-PR mode and inspects the verdict.
- `blocked` → **exit code 2**, which denies the tool call and returns the findings to the
  session as the reason.
- `ready` → exit 0, the PR opens.

**Decided:** the hook covers `gh pr create` only, not `git push`. Pushing a branch is cheap and
reversible; blocking it would be noise.

Second layer, for a PR that already exists: open it as a draft when the verdict is `blocked`, or
apply a blocking label. Optional — the local hook is the primary gate.

### 5. Routing table is incomplete, not wrong

A static table is the right design: auditable, and it avoids parsing every `SKILL.md` frontmatter
on each run. It is simply missing rows. Proposed table:

| Changed paths | Load |
|---|---|
| `client/**` | `frontend-ui-architecture`, `react-best-practices`, `react-testing-library`, `security`, `zod` |
| `server/**`, `reviewer-core/**` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `security`, `zod` |
| `server/src/db/**` | + `postgresql-table-design` |
| `e2e/**` | `e2e/CLAUDE.md` conventions (no skill owns this surface yet) |
| `*.md`, `docs/`, `scripts/`, `.claude/` | unrouted, listed in the report |

`security` on both surfaces matters most: it is the skill most likely to produce a genuine
`critical`, and today it never loads.

## Work items

**A. `SKILL.md` changes**
1. Replace step 1 with the two diff modes; the hook passes the mode in.
2. Add the `severity` field to the finding shape and the severity table above.
3. Change the verdict to `ready` / `blocked`, keyed on `critical` only.
4. Extend the routing table with `security`, `zod`, `postgresql-table-design`, `e2e/**`.
5. Update the example report block to show severities and a `blocked` verdict.

**B. New hook in `.claude/settings.json`**
6. `PreToolUse` matcher on `Bash(gh pr create*)`, exit 2 on `blocked`.
7. Escape hatch: an explicit override phrase from the user, so the gate can be bypassed
   deliberately rather than by disabling the hook.

**C. Verification**
8. Test fixture: a branch with a hardcoded secret in `server/**` → hook must deny `gh pr create`.
9. Test fixture: a clean docs-only branch → hook must allow, skill reports all surfaces unrouted.

## Where this lands

This plan is committed on `claude/pr-self-review-skill-plan-76f0be`. The skill itself does **not**
belong here — it goes on `feat/reviewer-skills`, next to `onion-architecture` and
`frontend-ui-architecture`, which is also where the routing table's targets live. The
`.claude/settings.json` hook lands on the same branch, so the gate and the skills it routes to
ship as one PR.

## Notes

- The brief asked for a plan only; a full `SKILL.md` was written anyway. It never reached `main`
  or `origin/main` — it lived only on two local, unpushed branches, and both have been reverted
  (`618876c` on `fix/clone-path-traversal-and-job-crash`, `002608f` on `feat/reviewer-skills`).
  `feat/reviewer-skills` keeps its other work: `onion-architecture`, `frontend-ui-architecture`.
- So the work above is a fresh authoring pass from this plan, not a revision of an existing file.
- The reverted `SKILL.md` is still readable at `git show 65e288e:.claude/skills/pr-self-review/SKILL.md`
  if any of its wording is worth reusing — routing, find-don't-fix, grandfathering and the report
  shape were sound; the diff scope and the missing severity model were not.

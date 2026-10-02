---
name: sdd-orchestrator
description: Runs DevDigest's Spec-Driven Development chain from the main session — brainstorm or spec-creator, the user's spec approval, the execution-mode question, implementation-planner, red-first tests by test-writer, implementer lanes level by level with a package gate after each, then plan-verifier first and architecture-reviewer, security-reviewer and /code-review in parallel, a fix loop of at most two rounds, insights and docs. Works out the current stage from the artifacts (spec status, saved plan, red-first commit, reports, the `.state.md` file next to the plan) and runs the next step, so a chain can start at any stage or resume in a fresh chat. Use whenever the user wants a feature built spec-first or through the agents — "зроби фічу через SDD", "запусти ланцюг", "спека готова, плануй", "імплементуй план мультиагентно", "продовж з того місця", "що далі по фічі X", "run the chain", "implement docs/plans/…", "the review came back, fix it" — even when no agent is named. Not for a one-line change the user wants done directly, for reviewing a PR that came from outside the chain (code-review / pr-self-review), or for editing the agents themselves.
---

# sdd-orchestrator

The agents in `.claude/agents/` are flat: none can start another agent and none can ask the
user. You, the main session, are the orchestrator. You decide the next step, write each brief,
relay every question, and keep the state. `.claude/agents/README.md` is the reference for who
owns what; this skill is the procedure. When they disagree, the README and the agent files win,
and the skill should be fixed.

Three habits make the chain work, and each exists because its absence cost real runs:
- **Pass artifacts verbatim.** A subagent sees none of this conversation. A spec, a plan slice or
  a report goes into the brief as written, never summarised, because a summary silently drops the
  line the agent needed.
- **Never paste a diff.** Reviewers read a bundle from `.claude/scripts/review-bundle.sh`; pasted
  hunks were the largest repeated cost in the 2026-09-26 profiles.
- **Relay, don't answer.** An agent's question is the user's question. Ask it with
  AskUserQuestion, carrying the agent's options and recommendation, and pass the answer back word
  for word. Answering it yourself defeats the gate that produced it.

## Step 0 — Find where the chain is

Look for the feature's state file first: `docs/plans/*-<feature>.state.md`. If it exists, it says
the stage; trust it, but check its head sha against `git log` before acting on it. Without one,
infer the stage from the artifacts, checking from the bottom of this table up and stopping at the
first row whose evidence is there:

| Evidence in the repo or the conversation | Stage → next step |
|---|---|
| Reviews all `pass`, verification `verified` | 8 Close |
| Reports from reviewers or plan-verifier with findings or `gaps` | 7 Fix loop |
| Implementer reports for every lane, package gate green | 7 Review |
| A red-first commit (or an empty `## Red-first` list) and a saved plan | 6 Implement |
| A saved plan `docs/plans/YYYY-MM-DD-<feature>.md` with `Status: ready` | 5 Red-first |
| A spec with `Status: approved` and no open `[NEEDS CLARIFICATION]`, or a `no-spec` intent | 3 Mode, then 4 Plan |
| A spec with `Status: draft` | 2 Spec loop (approval or open questions) |
| Only an idea or a feature request | 1 Intake |

Tell the user in one sentence which stage you found and what you will run next. If the evidence
is contradictory (a plan but the spec it names is still `draft`), stop and ask.

## Step 1 — Intake

- A rough idea with no outcome yet ("хочу щось для X") → `brainstorm` with the idea and any
  design sources. Relay its one question; when it returns `ready`, its **Request for
  spec-creator** is the next input.
- **Branch first.** The feature's spec, tests and code belong on their own branch, not on
  whatever branch this chat happens to be on (often an unrelated `chore/…` with work of its own).
  Unless the current branch is already this feature's, set one up through `/worktree-session`
  (`feat/<feature-slug>`) before spec-creator writes anything. `brainstorm` is read-only and may
  run before that. The base must contain the chain itself (the
  agents, this skill, `docs/sdd-cascade.md`): while that work is still unmerged on its own branch,
  a branch cut from `main` would hand the agents rules that don't exist there, so ask the user
  which base to use instead of defaulting to `main`.
- A request that names the behaviour → `spec-creator` in `create` mode. Put `Date: YYYY-MM-DD`
  (today) in the brief, plus the user's text and design-source paths. spec-creator has no Bash
  and must not guess the date.

## Step 2 — Spec loop

Handle the Spec Report by its `Status:`:
- `no-spec` → keep the one-sentence intent; go to Step 3.
- `needs-answers` → ask the blocking questions with AskUserQuestion (its options, its
  recommendation first). Re-run spec-creator in `answers` mode with the answers verbatim and its
  previous report.
- `needs-research` → start one `researcher` per request, all in one message so they run in
  parallel, each with its question, scope and what it feeds. Then spec-creator in `answers` mode
  with every report.
- `written` / `updated` → `git status`: anything outside a `specs/` folder is a hook escape, so
  report it. Show the user the spec path, the Self-check and the open-marker count. Only the user
  sets `Status: approved`; ask them to approve or to say what to change (that is an `update` run).
  When approved, commit the spec on its own: the spec commit comes before any code commit.

## Step 3 — Execution mode

Ask the user with AskUserQuestion: `multi-agent` or `single-agent`. Recommend multi-agent for
two or more packages or independent parts; single-agent for a small or tightly coupled change,
where the handoffs cost more than they save.

## Step 4 — Plan

Run `implementation-planner` with the spec path (or the no-spec intent) and the mode.
- `needs-answers` → items under **Back to spec-creator** go to spec-creator in `update` mode, and
  the user re-approves the changed spec. Items under **Questions for the user** go through
  AskUserQuestion. Then plan again.
- `ready` → save the plan verbatim as `docs/plans/YYYY-MM-DD-<feature>.md`, create the state
  file (template below), and show the user the **Open questions & recommendations** and the
  **Lanes**. Get the user's go on the plan before any code: a plan nobody approved is where scope
  drift starts.

## Step 5 — Red-first

When the plan's `## Red-first` list names criteria:
- **multi-agent:** run `test-writer` in `red-first` mode with the full plan. Read every file it
  added or changed, `*.it.test.ts` above all, before anything runs with Docker. Then run its
  integration tests yourself to see them red (`pnpm --dir server exec vitest run <file>`), because
  Docker can't run in its sandbox. Commit the red tests; that sha is `<red-sha>`.
- **single-agent:** write those tests yourself, see each fail for the right reason, commit.

If the user says the red tests are already committed, check that the sha exists and is an
ancestor of HEAD, and read those test files yourself: plan-verifier's brief may only say "the
main session has read every file test-writer added or changed" when that is true, and it gates the
Docker run on it.

An empty list needs the plan's one-line reason; record `red-sha: none — <reason>`.

## Step 6 — Implement

**Multi-agent.** Walk the plan's lane DAG level by level: a level is every lane whose `after:`
lanes are done.
1. Start one `implementer` per lane of the level, all in one message. Each brief holds:
   `Mode: lane <n>`, `<red-sha>`, the plan's saved path, and the lane's slice copied verbatim —
   the header, *Constraints*, *Skills for the implementer*, the lane's *Lanes* row, its steps, the
   *Red-first* rows those steps turn green and the *Contracts & data* items they touch. Not the
   whole plan: at ~18k tokens it was re-sent on every one of ~90 requests per lane.
2. Read each report. `blocked` because the plan or the code disagrees → back to Step 4 (planner)
   or Step 2 (spec-creator `update`), whichever the blocker names; don't patch around it.
   Watch for the write-audit's `additionalContext` after each Agent call: a write outside a lane's
   owned paths is a finding even when the report says `done`.
3. **Package gate**, once the level is done: for each touched package run its typecheck and unit
   suite from the root `CLAUDE.md` Check table (`server/` excludes `*.it.test.ts`; a
   `reviewer-core` change also runs the `server` checks). Nothing else: `lint:boundaries` and the
   route test belong to architecture-reviewer, which runs them on the reviewed head.
   - **Expected red.** Red-first tests that a *later* level turns green are still red here, and
     so may be a consumer's typecheck after lane 0. That is the plan working, not a failure:
     the gate passes when the only failures are those tests (and those type errors), each failing
     for the reason the plan gives. Write them down as expected-red in the state file.
   - **Any other red** → find the owning lane by its owned paths and send it the failure in
     `Mode: fix`. A failure in a file no lane owns is a plan gap: back to the planner.
   - **Green** (expected-red aside) → commit only the level's owned paths and the state file, not
     `git add -A`, and record each command, the sha and its result line under *Checks already
     run*.

**Single-agent.** Execute the plan's linear steps yourself, test-first, then the package checks;
commit; record them the same way.

## Step 7 — Review and fix loop

1. Write the bundle once per head:
   `.claude/scripts/review-bundle.sh $(git merge-base HEAD origin/main)...HEAD <scratchpad>/bundle-<sha>`.
2. **plan-verifier first.** Brief: the target range and head sha, the bundle path, the *Checks
   already run* table, the full plan, every Implementation Report, the Test Report's **Tests**
   table, `<red-sha>`, and the sentence "the main session has read every file test-writer added
   or changed" (only if you did; otherwise it won't run the integration suite). `gaps` → fix loop
   before any other review: an Opus review of unfinished code is wasted.
3. **Then in parallel**, in one message: `architecture-reviewer` and `security-reviewer`, each with
   the target, the head sha, the bundle path and *Checks already run*, and run `/code-review` on
   the same range yourself for correctness bugs, which no agent looks for.
4. **Fix loop.** Group the findings by owning lane (owned paths) and send each lane its findings
   with `path:line` and its plan slice, `Mode: fix`. Re-run the package gate, commit, write a new
   bundle, and re-run only the reviewer whose findings were fixed. A finding that says the plan or
   the spec is wrong goes to the planner or spec-creator, not into a fix. After two rounds with
   findings still open, stop and put them to the user.

## Step 8 — Close

- e2e when the plan lists it, with the ports from `CLAUDE.local.md`; it rebuilds `client/.next`,
  so not while a dev server you need is running. `browser` criteria are yours to check.
- Fill the spec's `## Traceability` step, test and commit columns from the plan and the Plan
  Verification. Offer the user `Status: implemented`; don't set it unasked.
- Collect every **Insight candidates** section (implementers, test-writer, reviewers) and record
  them once through `engineering-insights`. No agent writes `INSIGHTS.md` any more, so if you
  skip this nothing is recorded.
- `doc-writer` when the plan or the user asks for docs, with the plan and the verified code.
- `pr-self-review` before a PR. Push and open the PR only on the user's word.

## The state file

`docs/plans/YYYY-MM-DD-<feature>.state.md`, updated after every step, so a fresh chat can resume
with Step 0 instead of re-deriving the chain from git:

```
# State: <feature>
Stage: <1–8 and name> · next: <the next action>
Spec: <path> (SPEC-…) · Status: <draft | approved | implemented>
Plan: <path> · Mode: multi-agent | single-agent
red-sha: <sha | none — reason>
Levels: <level → lanes → done | running | blocked>
Fix round: <0 | 1 | 2>

## Checks already run
| check | command | head sha | result line |

## Open findings
- <source> — <finding, path:line> — <owner lane | planner | spec-creator | user>

## Log
- <date> — <what ran, its status>
```

## When something breaks

- Two artifacts disagree about the same head (the state file says the suite passed, a report
  says a test fails) → settle it with one targeted run before acting on either, and strike the
  wrong row from *Checks already run* so no reviewer is handed it as evidence.

- An agent's report has no `Status:` or ignores its template → treat it as `partial`, re-run it
  once with the template quoted back; a second failure goes to the user.
- An agent hits its budget (`partial`) → re-run it with its report as the starting point, not
  from scratch.
- The user changes a requirement mid-chain → spec-creator `update`; the plan is re-reviewed
  before code moves (`docs/sdd-cascade.md`, "When to change a spec").

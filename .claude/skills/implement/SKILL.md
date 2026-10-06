---
name: implement
description: Runs the implementation half of DevDigest's Spec-Driven Development chain from an approved Implementation Plan — implementer lanes level by level with a package gate, plan-verifier first, then architecture-reviewer, a conditional security-reviewer and /code-review in parallel, a triaged fix loop of up to three rounds, insights and close. Spec-creator and implementation-planner are run by hand before it; this command never writes a spec or a plan. Invoked only as `/implement <plan-path> [--prompt "…"] [--design <path>…] [--mode multi|single]`.
argument-hint: "<plan-path> [--prompt \"…\"] [--design <path>…] [--mode multi|single]"
disable-model-invocation: true
---

# /implement

You, the main session, run the chain. The agents in `.claude/agents/` are flat: none starts
another agent and none can ask the user, so you write every brief, relay every question and keep
the state. `.claude/agents/README.md` says who owns what; this file is the procedure. When they
disagree, the README and the agent files win, and this file should be fixed.

**Out of scope.** `spec-creator` and `implementation-planner` are run by hand, before this
command. It starts from a saved plan and never writes or rewrites a spec, an acceptance
criterion or a plan. When the chain finds that one of them is wrong, it stops and says which
agent to run, with what.

**`test-writer` is paused** (`../decisions/2026-10-02-implement-command-and-model-downgrade.md`).
Each implementer writes its lane's red-first tests itself, test-first, under
`Red-first: implementer-owned`. Don't start `test-writer` from this command.

Three habits, each paid for by a real run:
- **Pass artifacts verbatim.** A subagent sees none of this conversation. A plan slice, a report
  or a finding goes into the brief as written, because a summary drops the line the agent needed.
- **Never paste a diff.** Reviewers read a bundle from `.claude/scripts/review-bundle.sh`.
- **Relay, don't answer.** An agent's question is the user's. Ask it with AskUserQuestion,
  carrying the agent's options and recommendation, and pass the answer back word for word.

## Step 0 — Inputs and gate

Parse `$ARGUMENTS`:

| Argument | Meaning | Check |
|---|---|---|
| `<plan-path>` (required) | `docs/plans/YYYY-MM-DD-<feature>.md` | exists, `Status: ready`; the spec it names is `approved` with no open `[NEEDS CLARIFICATION]` (a Direct change's no-spec intent is fine) |
| `--prompt "…"` | extra requirements or guidance from the user | classify it, below |
| `--design <path>…` | screenshots or exported frames | each path exists locally; a Figma or web URL → ask for an export, the agents read only the disk |
| `--mode multi\|single` | execution mode | must match the mode the plan was shaped for; the plan's mode is the default |

Stop and tell the user what to run instead when:
- the argument is a spec, an idea or a missing file → "run `implementation-planner` on the
  approved spec first" (or `spec-creator` when there is no approved spec);
- the plan is `needs-answers`, or its spec is still `draft`;
- `--mode` differs from the plan's shape → the planner re-plans in that mode.

**Classify `--prompt`.** Guidance on *how* (naming, a library already in the plan, an order of
work, which design frame a UI step follows) goes into the briefs of the lanes it concerns.
Anything that changes *what* — a new or changed acceptance criterion, a new surface, contract or
endpoint — stops the chain: say "this changes the spec; run `spec-creator` in update mode with
this text, then the planner" and quote the part that does. Unsure → ask the user which it is.
Code that satisfies a requirement no spec states can't be verified, and that is how scope
drifts in unseen.

**Resume.** If `docs/plans/*-<feature>.state.md` exists, trust its stage after checking its head
sha against `git log`, and continue from there. Tell the user in one sentence where you resume.

**Branch.** The work belongs on the feature's own branch. If the current branch isn't the
feature's, set one up through `/worktree-session` (`feat/<feature-slug>`); ask the user for the
base, since the chain's own agents may not be on `main` yet.

Create the state file (template at the end) before Step 1.

## Step 1 — Implement

**Multi-agent.** Walk the plan's lane DAG level by level: a level is every lane whose `after:`
lanes are done.
1. Start one `implementer` per lane of the level, all in one message. Each brief holds:
   `Mode: lane <n>`, `Red-first: implementer-owned`, the plan's saved path, and the lane's slice
   copied verbatim — the header, *Constraints*, *Skills for the implementer*, the lane's *Lanes*
   row, its steps, the *Red-first* rows those steps turn green and the *Contracts & data* items
   they touch, plus the text of every `AC-N` those steps trace to, copied from the plan's
   *Acceptance criteria* section, never just the ids: an implementer given `AC-14` and nothing
   else builds from the step title and misses what the criterion actually says. Not the whole
   plan: at ~18k tokens it was re-sent on every request of a lane.
   The lane's owned paths include the test files its *Red-first* rows name, even when the
   plan's *Lanes* row doesn't list them: plans shaped for `test-writer` left those files to it.
   Say so in the brief.
   Add the `--prompt` guidance and `--design` paths only to the lanes they concern (designs to
   the `client/` lanes that build the screens).
2. Read each report. `blocked` because the plan or the code disagrees → stop and tell the user
   to re-run the planner (or `spec-creator` update) with the blocker quoted; don't patch around
   it. Watch for the write-audit's `additionalContext` after each Agent call: a write outside a
   lane's owned paths is a finding even when the report says `done`. A Red-first row with no
   failing run in the report's **Tests** table was not written test-first; send it back once.
   Read the report's **Skills applied**: a skill under "named by the plan but not invoked",
   or one the plan names that is missing from "invoked through Skill", with no line under
   **Deviations from plan**, makes the lane `partial`, so send it back in `Mode: fix` before
   the gate. The rule in `implementer.md` alone didn't hold — in three
   runs lanes applied skills "from the plan" without loading them.
3. **Package gate**, once the level is done: for each touched package its typecheck and unit
   suite from the root `CLAUDE.md` Check table (`server/` excludes `*.it.test.ts`; a
   `reviewer-core` change also runs the `server` checks). `lint:boundaries` and the route test
   belong to architecture-reviewer.
   - **Expected red:** tests a *later* level turns green, and a consumer's typecheck after
     lane 0, each failing for the reason the plan gives. Record them in the state file.
   - **Any other red** → the owning lane (by owned paths) in `Mode: fix`. A failure in a file no
     lane owns is a plan gap: stop, planner.
   - **Green** → commit only the level's owned paths and the state file (not `git add -A`), and
     record each command, sha and result line under *Checks already run*.

**Single-agent.** Start one `implementer` with `Mode: whole plan`, `Red-first:
implementer-owned`, the plan's saved path and the whole plan verbatim (a single-agent plan is
short), plus the `--design` paths. Read its report as in step 2 above, then run the package
gate, commit and record it yourself. Don't execute the steps in the main session: by Step 1
its context already holds the spec, the plan and every report, so each edit re-reads all of
it (2026-10-05 mentor follow-up: the main session was 15.7M of 21.2M tokens, peak context
251k), and nothing checks that the plan-named skills were loaded.

**Read the integration tests.** Before review, Read every `*.it.test.ts` the implementers added
or changed. plan-verifier runs them with Docker outside the sandbox, and its brief may say "the
main session has read every integration test the implementers added or changed" only when that
is true. Implementers don't run Docker, so a `red-first integration` row has no red run; it is
proven by plan-verifier's green run alone (an accepted gap, see the ADR).

## Step 2 — Review

1. Bundle once per head:
   `.claude/scripts/review-bundle.sh $(git merge-base HEAD origin/main)...HEAD <scratchpad>/bundle-<sha>`.
2. **plan-verifier first.** Brief: target range and head sha, bundle path, *Checks already run*,
   the full plan, every Implementation Report in full (the file text, never your summary of
   it), `Red-first: implementer-owned`, and the integration-test sentence (only if true). A
   condensed report drops the red-run rows, and plan-verifier then marks each affected
   criterion `partial` (18 false `partial` verdicts on the Project Context run). `gaps` → fix loop before any other review: an
   architecture review of unfinished code is wasted.
3. **Then in parallel**, one message: `architecture-reviewer` with target, head sha, bundle path
   and *Checks already run*; `security-reviewer` with the same, **only when** the diff touches a
   security surface; and `/code-review` on the same range yourself, for correctness bugs.
   Security surfaces: `server/src/modules/**/routes.ts` or any request parsing, a query or
   repository, `server/src/adapters/**` (git, GitHub, LLM, secrets), prompt assembly in
   `reviewer-core/`, client code rendering PR, diff or model text, `.claude/hooks/**`, auth or
   workspace scoping. Docs, styles and copy-only diffs skip it; record "security-reviewer:
   skipped — <why>" in the state file so the skip is visible.

## Step 3 — Fix loop

Give every finding a stable id that survives rounds — `PV-n`, `AR-n`, `SR-n`, `CR-n` — and put it
in the state file's ledger. **Must close:** `critical` and `major` findings, plan-verifier
`not met` and `partial`, and `/code-review` bugs. `minor` findings are fixed only when they sit
in a lane already being fixed; the rest go to the user at Step 4 as a list to accept or defer.

**Triage each finding before routing it**, because architecture findings often don't fit one lane:

| Kind | How you recognise it | Route |
|---|---|---|
| Local fix | the fix stays inside one lane's owned paths | that lane's implementer, `Mode: fix`, with `path:line` and its plan slice |
| Structural move | code must move between layers or files of different lanes, or a new port + adapter + double is needed | one implementer in `Mode: fix` for the whole move, run alone, owning the union of the touched lanes' paths; findings listed in the order to apply them |
| Plan is wrong | the fix needs a step, file or contract the plan doesn't have | stop; the user re-runs the planner with the finding quoted |
| Spec is wrong | the finding contradicts or exposes a gap in an acceptance criterion | stop; the user re-runs `spec-creator` update, then the planner |
| Accepted deviation | the user decides to keep it | an ADR in `../decisions/`, then the id is `accepted` in the ledger |

Fixes from different lanes run in parallel only when their paths don't overlap; a structural
move never runs beside another fix.

**After each round:** package gate, commit, then a delta bundle
`.claude/scripts/review-bundle.sh <previous-head>...<new-head> <scratchpad>/bundle-<new-sha>`
(not the full-branch bundle, or the reviewer re-reviews everything), then re-review:
- the reviewer whose findings were fixed, with its previous findings by id and the delta range
  `<previous-head>...<new-head>`. It reports each id `closed` / `open` and reviews the delta for
  regressions; it does not re-review the whole branch;
- plan-verifier again when a structural move or any `PV-n` fix changed code, because moved code
  can break a plan item that was `met`;
- security-reviewer when the round's changes touched a security surface, even if it had no
  findings before.

**Rounds and stopping.** At most **three** rounds. Stop early, and put the open ids to the user
with a recommendation for each, when:
- a round doesn't lower the number of open must-close findings, or
- an id marked `closed` comes back `open` (the fixes are oscillating).

## Step 4 — Close

- e2e when the plan lists it, with the ports from `CLAUDE.local.md`; it rebuilds `client/.next`,
  so not while a dev server you need is running. `browser` criteria are yours to check, against
  the `--design` frames when given.
- Fill the spec's `## Traceability` step, test and commit columns. Offer the user
  `Status: implemented`; don't set it unasked.
- Open `minor` findings → one AskUserQuestion: fix now, defer (listed in the PR body) or accept.
- Collect every **Insight candidates** section and record them once through
  `engineering-insights`; no agent writes `INSIGHTS.md`.
- `doc-writer` when the plan or the user asks for docs.
- `pr-self-review` before a PR. Push and open the PR only on the user's word.

## The state file

`docs/plans/YYYY-MM-DD-<feature>.state.md`, updated after every step, so a fresh chat resumes
with `/implement <plan-path>`:

```
# State: <feature>
Stage: <1 Implement | 2 Review | 3 Fix round n | 4 Close> · next: <the next action>
Spec: <path> (SPEC-…) · Plan: <path> · Mode: multi-agent | single-agent
Inputs: prompt <none | quoted guidance> · designs <paths | none>
Red-first: implementer-owned
Levels: <level → lanes → done | running | blocked>
Expected red: <test — level that turns it green>

## Checks already run
| check | command | head sha | result line |

## Findings ledger
| id | source | severity | kind | `path:line` | round opened | status (open / closed / accepted / deferred) | round closed |

## Log
- <date> — <what ran, its status>
```

## When something breaks

- Two artifacts disagree about the same head (the state file says a suite passed, a report says
  a test fails) → settle it with one targeted run, and strike the wrong row from *Checks already
  run* so no reviewer is handed it as evidence.
- A report has no `Status:` or ignores its template → treat it as `partial`, re-run once with the
  template quoted back; a second failure goes to the user.
- An agent hits its budget (`partial`) → re-run it with its report as the starting point.
- The user changes a requirement mid-chain → stop; it goes through `spec-creator` and the
  planner by hand, then `/implement` resumes from the state file.

# Homework 3 — Smart Diff: how it was built

Everything the mentor may want to open beyond the code sits here: the brief the agents worked
from, the plan, the three agent reports, the self-review verdict, the demo script and the API log
of the demo take. The feature itself is described in the pull request body.

## What is in this folder

| File | What it is |
|---|---|
| `brief.md` | The feature brief handed to the planner: the homework text condensed, what already existed in the starter (with `path:line`), the design decisions taken up front |
| `plan.md` | The planner's Development Plan (12 steps, contracts, i18n keys, the check split between implementer and reviewers) |
| `implementer-report.md` | The implementer's report: steps, skills applied, self-review, test runs, deviations, INSIGHTS candidates |
| `architecture-review.md` | The architecture reviewer's verdict (`pass`, 0 findings): `pnpm lint:boundaries`, the route-adapter-calls test, the contract mirror check, the onion step-9 report |
| `plan-verification.md` | The plan verifier's item-by-item verdicts (`verified`: 27 met · 6 partial, browser-only · 0 not met · 6 unverifiable, other owners · 0 unmapped hunks) |
| `pr-self-review.md` | The `pr-self-review` gate: server and client slices, one minor finding, fixed before the commit |
| `pr-self-review-verdict.json` | The verdict artifact the (unregistered) `gh pr create` hook would read, keyed on `head_sha` + `dirty_hash` |
| `vo-script.md` | The voice-over script of the demo video, one line per scene |
| `demo-api-requests.log` | Every API request the browser made during the demo take: 35 `GET`, 2 `POST` (the review run and one Accept) |
| `pipeline/` | How the agents were run — see below |

## The pipeline

`planner → implementer → (architecture-reviewer ∥ plan-verifier)`, then `pr-self-review`, then a
`test-writer` pass for `DiffTab.test.tsx`. All subagents ran on **sonnet** through the Workflow
tool.

The agent definitions from the lab (`.claude/agents/*.md`) lived at the time on the still-open PRs #17 and
#20, not on `main`, and agent definitions are cached per session, so a `main`-based worktree
cannot load them. The workaround: each definition's body was copied into a role file, the hooks
and the `.claude/sandbox` wrapper were dropped (neither exists on `main`), and the Workflow script
passes the role file path plus the brief and the plan as the agent's prompt.

- `pipeline/smart-diff-plan.workflow.js` — one agent: the planner (85 tool calls).
- `pipeline/smart-diff-build.workflow.js` — implementer (with up to two continuation runs if it
  returns `partial`), then the two reviewers in parallel, then up to two fix rounds while either
  reviewer says `fail` / `gaps`. This run needed one implementer pass and zero fix rounds.
- `pipeline/role-implementer.md`, `role-architecture-reviewer.md`, `role-plan-verifier.md` — the
  adapted definitions.
- `pipeline/record-demo.js` — the Playwright script that recorded the demo against the local
  stack, paced by the voice-over line durations.

What the main session added after the pipeline: a CSS token that does not exist
(`--bg-canvas` → `--bg-primary`) in the sticky group header, the unused `emptyNoReview` string
wired into the tab header, and the running → idle refetch in `DiffTab` so counters update while
the Files changed tab is open (`onRunDone` only fires while the Agent runs tab is mounted).

Subagent spend for the whole homework: roughly 1.55M tokens across the planner (286k), the build
workflow (775k) and the three review/test agents (~490k).

## The demo

Two minutes forty-five seconds, recorded with Playwright at 1440×900 against the local stack
from this branch, voice-over by ElevenLabs (Daniel). It was re-recorded after the mentor's review
on a fresh fixture, **PR #23** (`demo/smart-diff-fixture-v2`, not for merging): a `pretty-bytes`
dependency (so the diff has a lock file), `server/src/modules/pulls/size.ts` with two planted
flaws, its test, a barrel, `package.json` and a plan doc that the PR description links.

Scenes follow "Як перевірити": GitHub's flat order → the five groups with `docs`/`boilerplate`
collapsed → the lock file inside `boilerplate`, `package.json` and the barrel under `wiring` → Run
Review (General Reviewer) while staying on Files changed → `Core ● 1` and the file-card dot →
each finding under its own line with the severity stripe, label and card → Accept and the shared
hide/show toggle → Original order and back. Then the mentor follow-ups: Derive intent on the
Overview tab (high confidence, because the description links the plan doc), the nine agents on
GitHub including `brainstorm` and `security-reviewer`, and the classifier's `constants.ts` with
the one-sentence answer on why grouping never calls a model. The ~53-second wait for the model
run was cut from the take. During the take the API saw 37 `GET`s and 3 `POST`s: the review, one
Accept and the intent derivation (`demo-api-requests.log`).

The first recording used an earlier fixture (`demo/smart-diff-fixture`, closed PR #21), which was
folded into this PR for a while and removed before the merge.

## Mentor follow-ups (2026-09-26)

The mentor's review asked for three things. All three are in this PR.

1. **One branch with everything.** The lab agents (PR #14 → #17 → #20, which also carries the
   researcher from #16) and the Intent Layer (PR #18 → #19) are merged into `feat/smart-diff`.
   The only conflict was `server/INSIGHTS.md`, resolved as a union: every line of both parents
   is still there. After the merge: reviewer-core 56 tests, server 299 unit + 60 integration,
   client 190, hook tests 47, `lint:boundaries` clean.
2. **brainstorm and security-reviewer.** Nine agents now (`.claude/agents/README.md`).
   - `brainstorm` runs before the planner and returns a Brainstorm Brief. It adapts the
     course's `brainstorming` skill to a subagent that can't hold a conversation: one question
     with options, two or three approaches, what to leave out, a recommendation, the request for
     the planner. A sample run on "suggest how to split a large PR" is in
     `brainstorm-split-suggestion.md`.
   - `security-reviewer` is read-only and never executes the code under review, not even
     typecheck or lint: a new `security` profile in `agent-bash-allowlist.py` allows read-only
     git, `diff` and `gh pr view` only, with regression tests. The planner, implementer,
     plan-verifier and architecture-reviewer now hand security review to it. Its run on this PR
     is in `security-review.md`.
3. **Re-derive the intent by hand.** `POST /pulls/:id/intent` refreshes the PR from GitHub, loads
   the diff and calls the model with the cache bypassed; a failed derivation answers 502 with
   the cause instead of returning the old record, and the route has the same rate limit as a
   review run. The Overview tab's intent card has a Derive / Re-derive button and says when the
   intent was derived for an older head commit.

Both new agents were run from their definitions as general-purpose subagents: agent definitions
are cached per session, so a session can't invoke an agent file it didn't start with.

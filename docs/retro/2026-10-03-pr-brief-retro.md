# Retro: PR Brief SDD run (2026-10-03, in-context + transcript token sums)

The run took PR Brief from a pasted assignment to PR #34 through the SDD chain: spec-creator, implementation-planner, a DeepSeek cross-review, lane 0, two parallel lanes in separate worktrees, then a review phase and the AC-56 demo. The main session (Opus) only orchestrated; every worker ran on Sonnet. It worked: AC-1..AC-55 met, one fix round. The biggest lesson is that the three gaps that would have broken the feature were caught by the orchestrator's critical read of the draft spec, not by spec-creator:
- head_sha never refreshed;
- a strict model schema with `maxRetries: 0`;
- a diff link that only worked in Smart order.

## Numbers

Token sums come from 27 session transcripts, deduped by message id. Main session = `95d1b461` (also includes the spec drafting); `pr-brief` = spec write, plan, lane 0 and the review phase; lanes = `pr-brief-server`, `pr-brief-client`. No dollar figures for Claude, which runs on a Claude Max subscription.

| model | calls | output | cache read | cache write |
|---|---|---|---|---|
| claude-opus-5-5 (orchestrator + spec/plan session) | 147 | 111.6k | 28.7M | 0.58M |
| claude-sonnet-5-5 (spec-creator, planner, lanes, test-writer, implementer, reviewers) | 463 | 80.1k | 51.0M | 3.58M |

| stage | calls | output tokens |
|---|---|---|
| main / orchestrator | 132 | 93.0k (Opus) |
| spec + plan + lane 0 + review phase (`pr-brief`) | 231 | 18.9k Opus · 33.1k Sonnet |
| lane S (server) | 109 | 20.6k Sonnet |
| lane C (client) | 138 | 26.2k Sonnet |

Product-side cost of the run, as actually billed in the logs:

| item | cost |
|---|---|
| Cross-model plan review (deepseek-v3.2 via OpenRouter, 42k in / 1.9k out) | $0.0094 |
| Brief generations on #27 (6 runs, gpt-4.1-mini, ~4.1k in / ~350 out each) | $0.0084 total, $0.0010–0.0022 per brief |
| Intent derive + one General Reviewer run on #27 | a few cents (not separately logged) |
| ElevenLabs voiceover, 9 lines × 1 take | 1 426 credits (≈ $0.29 at the connector's quoted price) |

Fix rounds: 1, from review findings SR-1..3 and CR-2..4. Lanes S and C ran in parallel, with full overlap. The review phase ran plan-verifier first, then architecture and security reviewers in parallel with code-review.

## Per agent

- **spec-creator (Sonnet):**
  - Strong: provenance with `path:line`, three blocking questions in goal terms, every P1/P2/P3 item mapped to an AC.
  - Difficulty: could not write the spec. The `agent-write-scope` hook allows writes only under the session's start dir, and the session started in another worktree. The orchestrator wasted two round trips: a 56 KB inline dump, then a new session.
  - Missed: head_sha refresh (INSIGHTS 2026-09-26 already said it), the model-vs-stored schema split, the Original diff order, and the ConfigError → 500 mapping. The orchestrator caught all four and handed them over as amendments A1–A9.
- **implementation-planner (Sonnet) + DeepSeek cross-review:** 12 findings. 4 were folded in as tests, 6 were already covered, 1 rejected, 1 kept.
- **Lane S orchestrator (Sonnet) + test-writer/implementer:**
  - Easy: helpers, prompt, budget fit.
  - Missed: the red-first fixture seeded `pr_files` but left `MockGitHubClient` on its defaults, so a successful refresh replaced the files and 4 integration tests failed for the wrong reason. The classifier then blocked editing a committed test, and it took the user's OK to fix one line with no assertion change.
  - Rules: plan-named skills were not loaded via Skill.
- **Lane C orchestrator (Sonnet):**
  - Clean: 203/203 on the first gate.
  - Found two real react-query traps: render-time `refetch` narrows tracking, and `isPending` lags a double click. Fixed two test defects with assertions unchanged.
  - Rules: skills were not loaded via Skill.
  - Tooling friction: subagent cwd `client/` vs `run-tests.sh` at root, and `pnpm typecheck` EPERM in the sandbox.
- **Review phase (Sonnet):**
  - plan-verifier passed with one accepted partial (PV-1).
  - architecture: 0 findings.
  - security: SR-1 major, partially closed. The full fix needs a committed test changed.
  - code-review: CR-1 was a false positive, rejected with evidence.

## Orchestration

The order was right: spec → plan → lane 0 contract → parallel lanes → merge → reviewers → demo. The two-worktree split paid off; the lanes never touched the same file and merged with no conflict.

Waits:
- the spec write-scope detour, about 20 minutes;
- the lane S fixture decision, one user round trip.

The brief that caused rework was the orchestrator's own. It told lanes to run test-writer while the plan and `/implement` say test-writer is paused. Harmless here, but it contradicts the plan.

A cheaper shape: run the main session from inside the task worktree from the start. That removes the hand-off session and the inline spec dump.

## Lessons (merge into `docs/retro/ledger.md` on #31)

| id | lesson | target | seen | status |
|---|---|---|---|---|
| L-23 | Subagent writes are scoped to the session start dir; a session orchestrating a sibling worktree can't let spec-creator/test-writer write there | `.claude/agents/README.md` (start the session inside the task worktree, or launch lane sessions there with `claude --bg`) | 1 | open |
| L-24 | Red-first integration fixtures that seed DB rows must seed the GitHub double with the same data when the code under test refreshes from GitHub | `.claude/agents/test-writer.md` | 1 | open |
| L-25 | spec-creator missed known traps that INSIGHTS already recorded (head_sha refresh) and the model-schema vs stored-schema split for `maxRetries: 0` calls | `.claude/agents/spec-creator.md` (grep INSIGHTS for every input the feature refreshes; one schema per side of an LLM call) | 1 | open |
| L-26 | Implementers apply plan-named skills "from the plan" instead of loading them via Skill (both lanes; project-context run (b) too) | `.claude/agents/implementer.md` | 2 | proposed — diff below |
| L-27 | Orchestrator briefs must follow the `/implement` SKILL's current state (test-writer paused) instead of an older habit | `.claude/skills/implement/SKILL.md` (quote the red-first owner in the lane brief template) | 1 | open |
| L-28 | Client lane: `pnpm typecheck` fails in the srt sandbox (tsbuildinfo EPERM); subagents must start at the worktree root for `run-tests.sh` | `client/INSIGHTS.md` / `.claude/agents/README.md` | 1 | open |

Proposed diff for L-26 (`.claude/agents/implementer.md`, not applied; per the user's setup it goes through `/skill-creator`-style review in the chain-lessons PR):

```diff
@@ ## Skills
-Load the skills each step names.
+Load every skill a step names with the Skill tool before writing code for that step, and list
+them in the report. Applying a skill "from the plan text" does not count: in the project-context
+and pr-brief runs both lanes skipped the load and the reviewers had to cover the gap.
```

Ledger: these 6 rows are new here; L-26 repeats an existing project-context lesson (now proposed). Merge them into `docs/retro/ledger.md` on `chore/sdd-chain-lessons` (#31).

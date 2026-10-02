# Workflow retro ledger

Lessons from multi-agent runs. A lesson seen twice gets a proposed change (diff); status moves
open → proposed → encoded (with the commit) or rejected (with the reason).

| id | lesson | target | seen | runs | status | change |
|---|---|---|---|---|---|---|
| L-1 | The orchestrator passed its own paraphrase where the source text was needed. Main-session summaries of lane reports went to plan-verifier and caused 18 false "partial" verdicts. A one-line summary of the incident in a brief was then inflated by the agent into "1 MiB doc stalled for minutes" (actual: 32 KB took 62 s) | ~/.claude/skills/agentic-workflow/SKILL.md (brief rules); .claude/skills/implement/SKILL.md | 2 | 2026-10-02 project-context /implement; 2026-10-02 handoff fan-out | proposed | /implement part encoded a905c89 (PR #31); general brief rule proposed |
| L-2 | Lane briefs carried AC ids without the AC text | .claude/skills/implement/SKILL.md | 1 | 2026-10-02 project-context /implement | encoded | a905c89 (PR #31) |
| L-3 | Implementer killed by pattern, and a plan-named skill that didn't load was not reported as partial | .claude/agents/implementer.md | 1 | 2026-10-02 project-context /implement | encoded | a905c89 (PR #31) |
| L-4 | The plan was not checked against design frames, real status codes (zod → 422) or reachability (VALID_TABS) | .claude/agents/implementation-planner.md | 1 | 2026-10-02 project-context /implement | encoded | a905c89 (PR #31) |
| L-5 | A default that removed a resource limit was batch-approved and left the tokenizer unbounded. The removal in R1 caused PV-5 → SR-1 → SR-4, two of the three fix rounds | .claude/agents/spec-creator.md | 1 | 2026-10-02 project-context /implement | encoded | a905c89 (PR #31) |
| L-6 | The brief told the agent what the UI shows from memory: per-doc tokens on the Project Context page, a "## Project context" heading in the trace. Both were wrong, and the agent spent calls reconciling them | orchestrator briefs (agentic-workflow) | 1 | 2026-10-02 handoff fan-out | open | |
| L-7 | skill-creator loaded for a two-sentence skill edit. It gave the run's largest cache write (122k), and the agent skipped its eval loop anyway | ~/.claude/CLAUDE.md skill rule / skill-creator usage | 1 | 2026-10-02 handoff fan-out | open | |
| L-8 | Module: `pnpm dev` / `next dev` listen from a child process, so the PID captured with `$!` is not the listener. Stop with `pkill -P <pid>` then `kill <pid>`, never by name | dev-digest dev stack (server/, client/) | 1 | 2026-10-02 handoff fan-out | open | |
| L-9 | workflow-retro collect.py: no `--until`, so the main session's share includes post-run work. Reads through `cat`/`sed` in Bash are invisible to the shared-read check. Exit 1 from a trailing `grep` counts as an error | ~/.claude/skills/workflow-retro/scripts/collect.py | 1 | 2026-10-02 handoff fan-out | open | |
| L-10 | The Grep tool was missing for the Sonnet subagents: 8 failed calls in 6 agents (lane 0, lane 2, plan-verifier ×2, architecture, security). The Opus agents (spec-creator, planner) used Grep 73 times without an error | .claude/agents/*.md (tools lists) / /implement briefs | 1 | 2026-10-02 project-context /implement | open | |
| L-11 | The reviewers' Bash allowlist hook denied 10 commands: unlisted forms, plus `"` and pipes in the command. plan-verifier, architecture-reviewer and security-reviewer each spent calls rephrasing | .claude/agents/{plan-verifier,architecture-reviewer,security-reviewer}.md "Commands you may run" + allowlist hook | 1 | 2026-10-02 project-context /implement | open | |
| L-12 | The orchestrator was 61% of all tokens (49.4M of 80.4M), with a 419k peak context and 103 Bash calls, because package gates and their logs ran in the main session | .claude/skills/implement/SKILL.md (who runs gates, how much output is kept) | 1 | 2026-10-02 project-context /implement | open | |
| L-13 | Long test runs in agents: foreground `sleep 240` was blocked and macOS has no `timeout`, so lane 2 polled for 50 min and killed the run by pattern (L-3) | .claude/agents/implementer.md (run_in_background / `perl -e 'alarm N; exec @ARGV'`) | 1 | 2026-10-02 project-context /implement | open | |
| L-14 | pr-self-review ran as 2 Opus agents for 17-call routing jobs (1.42M + 1.29M tokens) | pr-self-review fan-out model choice | 1 | 2026-10-02 project-context /implement | open | |

## Runs

| date | run | agents | tokens (total · cache write) | fix rounds | notes |
|---|---|---|---|---|---|
| 2026-10-02 | handoff fan-out (AC-42 screenshots ∥ SDD chain lessons) | 2 × sonnet, background, parallel 1.6 min | subagents 3.67M · 228k; main session not bounded (L-9) | 1 (orchestrator fixed incident wording) | both PRs pushed (#30 9cf429f, #31 a905c89) |
| 2026-10-02 | project-context /implement (spec → plan → 7 lanes → verify → 3 fix rounds → reviews → minor batch) | 19: 5 opus (spec, plan, code-review, 2× pr-self-review) · 14 sonnet; peak 4 lanes parallel | 80.4M · 3.39M (main session 49.4M) | 3 + minor batch | L-1..L-5, L-10..L-14 from this run |

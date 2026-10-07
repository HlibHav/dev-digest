---
name: workflow-retro
description: Manual-only retrospective of a multi-agent run (subagents, /implement, a Workflow script, an orchestrated fan-out). Measures tokens, agent count, launch order and parallelism. Reads each agent's brief against its report for difficulties, easy wins, duplicated information and misses, then records lessons in the project's docs/retros/ledger.md and proposes concrete fixes, with a ready diff for any lesson seen twice. Run it with /workflow-retro, optionally `deep` to parse the transcripts.
disable-model-invocation: true
argument-hint: "[deep] [--since <ISO time>] [run name]"
---

# Workflow retro

A multi-agent run leaves two kinds of evidence: numbers (tokens, calls, time, order) and
judgement (what each agent struggled with, what it was told twice, what it missed). The numbers
come from data, never from memory. The judgement comes from reading briefs against reports. The
point of the retro is the last step: a lesson that repeats becomes a change to an agent or a
skill, so the same failure doesn't cost a third fix round.

This skill runs only when the user calls it. It reports and proposes; it never applies a
proposed change on its own.

## Arguments

- no argument: **in-context mode**. Use what this session already holds (launch calls, task
  notifications, agent reports, the corrections you made afterwards). Fast, no file parsing.
- `deep`: also run `scripts/collect.py` over the session transcripts for exact per-agent tokens,
  tool mix, overlap, files read by several agents, rule hits and tool errors.
- `--since <ISO>`: limit to the run that started at that time (pass it through to the script).
  Without it, take the most recent multi-agent run in this session and say which one you picked.
- a run name (e.g. "project-context /implement"): use it as the ledger's run label.

## Step 1 — Scope the run

Name the run, its start and end, and who orchestrated it. List every agent launch in order:
description, agent type, model, foreground or background, what it was asked to produce. If the
run had phases (plan → red tests → lanes → reviewers → fix rounds), map launches onto them.

## Step 2 — Numbers

**In-context:** each finished subagent's task notification carries `total_tokens` (or
`subagent_tokens`), `tool_uses` and `duration_ms`. Note what `total_tokens` means: it is roughly
the agent's final context size, not the tokens billed across its turns. Say so in the report
rather than adding it up as cost. Count the main session's own share only if you can see it;
otherwise mark it unknown.

**Deep:** run, from the project's working directory,

```bash
python3 .claude/skills/workflow-retro/scripts/collect.py [--since <ISO>] [--session <id>]
```

It dedupes split assistant messages by message id and sums input, output, cache read and cache
write per agent. Cache write is the cost of re-loading context, and cache read usually dominates
the total, so report the split, not just one number. It also prints launch order, overlap in
minutes, tool mix, files read by more than one agent, commands that match risky patterns (kill by
pattern, `--no-verify`, force push, `rm -rf`, bare `git stash`), and tool errors. A shared read
is only a lead: re-reading a file to verify an agent's output is healthy, while three lanes each
reading the same 300-line spec because the brief didn't quote it is duplication.

No dollar figures. Prices change and a hard-coded rate goes stale; tokens and the cache split
are enough to compare runs.

## Step 3 — Per agent

For each agent, set its brief beside its report and what happened after it, and answer:

- **Difficulties:** errors, retries, loops, blocked or `partial` status, budget pressure (tool
  calls against the brief's limit), places it guessed because the brief was silent.
- **Easy:** what it finished in few calls. This tells you what can run on a smaller model.
- **Duplicated:** information it was given twice, re-derived though another agent already had
  it, or restated at length in its report.
- **Missed:** what a later reviewer, a test, the orchestrator or the user caught after it said
  done. A claim that the follow-up check contradicted is the most valuable line in the retro;
  quote the claim and the evidence.
- **Rules:** commands or edits that broke a stated rule, edits outside its owned paths, skills
  the plan named that it didn't load.
- **Model fit:** was the model enough for this role, too much, or too little?

Stick to evidence. If you can't see an agent's transcript in in-context mode, say what you
judged from (its report only) instead of guessing at its inner turns.

## Step 4 — The orchestration

Judge the run as a whole: was the order right, did independent work actually run in parallel,
where did the orchestrator wait, how many fix rounds happened and what triggered each, which
brief caused the most rework. If a cheaper shape would have produced the same result (fewer
agents, a smaller model, one brief instead of three), say which.

## Step 5 — Ledger

The ledger lives at `<repo root>/docs/retros/ledger.md` (`git rev-parse --show-toplevel`; outside
a repo, the working directory). Create it from the template below if it's missing. Read it
whole first, then for each lesson from steps 3–4:

- If an existing row says the same thing in other words, add this run to its occurrences and
  bump the count. Match by meaning, not wording.
- Otherwise add a row with count 1.
- Module insights (a trap in a library, a non-obvious behaviour of a package) go in the ledger too,
  with the module as the target.

```markdown
# Workflow retro ledger

Lessons from multi-agent runs. A lesson seen twice gets a proposed change (diff); status moves
open → proposed → encoded (with the commit) or rejected (with the reason).

| id | lesson | target | seen | runs | status | change |
|---|---|---|---|---|---|---|
| L-1 | Lane briefs carried AC ids without AC text; verifier marked 18 items partial | .claude/skills/implement/SKILL.md | 1 | 2026-10-02 project-context | open | |

## Runs

| date | run | agents | tokens (total · cache write) | fix rounds | notes |
|---|---|---|---|---|---|
```

Append a row to **Runs** for this run. Keep lessons one line each; detail belongs in the chat
report.

## Step 6 — Proposals

Every lesson gets a proposal, because the retro is for change, not just analysis:

- **Seen once:** a one-line suggestion (which file, what rule) in the report. Status `open`.
- **Seen twice or more:** a concrete unified diff of the target file (agent definition,
  command, skill, CLAUDE.md, hook), shown in the chat. Status `proposed`. Read the target file
  first and match its structure and voice; add to the section where the rule belongs, give the
  rule a one-clause reason (the incident), and don't restate a rule that already exists, tighten
  it instead.
- Also propose run-shape changes from step 4 (model per role, merge or split agents, what a
  brief should quote), even when nothing repeated.

Don't apply diffs. Wait for the user's yes. When a diff targets a skill and the user's setup
says skills change only through a skill-authoring workflow (e.g. `/skill-creator`), apply it
that way once approved. Then set the ledger row to `encoded` with the commit.

## Output in chat

```
# Retro: <run> (<date>, <mode>)

<2–3 sentences: what the run did, whether it worked, the single biggest lesson.>

## Numbers
<table: agent · type/model · start · min · tokens (total, cache write) · tool calls · status>
<total tokens with the cache split; agents launched; parallel overlap; fix rounds>

## Per agent
<per agent: difficulties / easy / duplicated / missed, a few lines each, evidence quoted>

## Orchestration
<order, parallelism, waits, rework, cheaper shape if any>

## Proposals
<one-liners for new lessons; full diffs for repeated ones; run-shape changes>

Ledger: docs/retros/ledger.md — <n> new, <n> repeated (now proposed)
```

Write the report in the user's language; code, diffs and the ledger stay in English. Don't
commit the ledger unless asked. Say that it changed and where.

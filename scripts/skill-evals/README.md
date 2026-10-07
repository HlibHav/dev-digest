# Skill evals

Behaviour tests for the project's Claude Code skills, in the skill-creator format. A skill's
test cases ship with the skill; this folder holds the shared tooling that runs them.

## Layout

```
.claude/skills/<skill>/evals/
  evals.json          prompts, assertions (the answer key), base_commit
  fixtures/<eval>.patch   git diff against base_commit; one fixture per eval
scripts/skill-evals/
  setup.sh            materialise one fixture as a reviewable branch in its own worktree
.skill-evals/<skill>/iteration-N/   run outputs, grading, benchmark (gitignored)
```

A fixture is a realistic change with planted problems and, where an eval says so, decoys the
skill must leave alone. Fixtures carry no comments that point at what is wrong; the only record
of what was planted is the assertion list in `evals.json`.

## Running one iteration

```sh
scripts/skill-evals/setup.sh <skill> <eval-name>             # prints the worktree path
scripts/skill-evals/setup.sh --teardown <skill> <eval-name>  # removes worktree and branch
```

`setup.sh` creates `.claude/worktrees/skill-eval-<eval-name>` at `base_commit`, commits the patch
on the eval's branch, and installs `server/` and `reviewer-core/` dependencies. It hides every
skill's `evals/` folder and the skill under test from that worktree, so the agent under review
can't grep the answer key or find a different version of the skill; each arm gets its copy of
the skill by path. Don't symlink `node_modules` into the worktree: the resolved paths change and
`pnpm lint:boundaries` stops matching its baseline.

Each arm is one agent with the same prompt from `evals.json`, run read-only in the worktree, that
writes `review.md` to `.skill-evals/<skill>/iteration-N/eval-<id>-<name>/<arm>/run-1/outputs/`.
Grade every assertion into `grading.json` next to it (fields `text`, `passed`, `evidence`), then
aggregate and open the viewer with skill-creator's `scripts.aggregate_benchmark` and
`eval-viewer/generate_review.py`.

## Changing a fixture

Edit the code on the eval branch, commit, and regenerate the patch from the base:

```sh
git diff --binary <base_commit> <branch> > .claude/skills/<skill>/evals/fixtures/<eval>.patch
```

Re-check the eval's assertions and their line numbers afterwards. When `main` moves far enough
that a patch no longer applies, rebase the fixture branches and bump `base_commit` for the
whole file in one change.

# Retro proposals: onboarding-tour SDD chain (2026-10-03)

Diffs for the ledger rows seen twice. Approved by Glib for a later session: apply them then,
the skill change through `/skill-creator`, and set each row to `encoded` with its commit.

## L-10 + L-11: reviewers have no working search (Grep/Glob absent, cat/grep/find refused)

`.claude/hooks/agent-bash-allowlist.py`:

```diff
-GIT_READ_SUBCOMMANDS = {"diff", "log", "show", "status", "merge-base", "rev-parse", "ls-files", "blame"}
+GIT_READ_SUBCOMMANDS = {"diff", "log", "show", "status", "merge-base", "rev-parse", "ls-files", "blame", "grep"}
```

`.claude/agents/security-reviewer.md` (same edit in `architecture-reviewer.md` and `plan-verifier.md`, section "Commands you may run"):

```diff
-Search with Grep and Glob, read with Read; Bash is only for these. Run from the repo root, one
+Search with Grep and Glob, read with Read; Bash is only for these. When Grep or Glob is not
+available in the session (it wasn't in the 2026-10-03 run), search with `git grep -n '<pattern>' -- <path>`.
+Run from the repo root, one
 ...
-  `git show <ref>:<path>`, `git merge-base …`, `git status`, `git blame …`, `git ls-files …`
+  `git show <ref>:<path>`, `git merge-base …`, `git status`, `git blame …`, `git ls-files …`, `git grep …`
```

Add a hook test in `.claude/hooks/tests/` that `git grep -n 'x' -- server/src` is allowed and `git grep … | head` is still denied.

## L-14: pr-self-review fan-out inherits Opus for routing work

`.claude/skills/pr-self-review/SKILL.md`, step 6 (via `/skill-creator`):

```diff
    surface its own subagent with that surface's skills and its slice of the diff, and keep only the
-   findings. Below that, review inline — a subagent per surface costs more than it saves.
+   findings, on `model: sonnet` — routing to skills is not judgement work, and an inherited Opus
+   cost 1.3–1.4M tokens per surface twice. Below that, review inline — a subagent per surface costs more than it saves.
```

## L-22: decision questions to Glib carry internal labels

Memory `ask-glib-in-goal-terms.md` (outside the repo), end of **How to apply**:

```diff
+- Before the options, one plain sentence of what actually happens to Glib if we do nothing
+  (e.g. "a hostile README could make your browser load an attacker's image"). Never lead with a
+  finding id or an internal term — on 2026-10-03 "SR-1 … тур" cost a clarifying round-trip.
```

## L-3 (already encoded)

`a905c89` (PR #31) reaches the onboarding-tour stack only after #31 merges; then rebase #30 and #33 onto it.

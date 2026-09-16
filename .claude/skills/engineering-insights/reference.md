# engineering-insights — reference

## Modules

Each package keeps its own `INSIGHTS.md`, next to its code. Read and write the one the task
concerns, not all four.

| The task concerns | File |
|---|---|
| `client/**` | `client/INSIGHTS.md` |
| `server/**`, including `src/modules/repo-intel/**` | `server/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**`, `scripts/e2e.sh` | `e2e/INSIGHTS.md` |
| Two or more packages, or `server/src/vendor/shared/**` | the most affected package |
| Root files (`scripts/`, `.github/workflows/`, `docker-compose*.yml`) | the package they run or test |

- `repo-intel` is a module inside `server`, not a package — it has no file of its own.
- There is no root `INSIGHTS.md`. A task that concerns no package reads nothing and records
  nothing.
- A task that spans packages reads every touched file, but records each finding once, in the
  most affected package.

## Sections

Fixed, in this order. Never add a heading.

| Section | What belongs there |
|---|---|
| `What Works` | An approach that solved a real problem here and should be reused |
| `What Doesn't Work` | A dead end: what was tried, why it failed, what to do instead. The section most often skipped and the most valuable |
| `Codebase Patterns` | A convention or design choice you only learn by reading the code |
| `Tool & Library Notes` | A quirk of a dependency, CLI, or config file |
| `Recurring Errors & Fixes` | A symptom you will hit again (quote the error), its cause, and the fix |
| `Session Notes` | One dated line per session that added an entry: the task and what was added |
| `Open Questions` | Something left unresolved or unconfirmed, so the next session knows |

## Entry format

Claim first, evidence last. Backtick every path and identifier; quote the actual error string.

```markdown
- **YYYY-MM-DD** — <the claim, specific enough to act on cold>. Evidence: `path:line`
```

Evidence is a `path:line`, a runnable command, or a quoted error — whichever proves the claim.
Copy every identifier and line number from the file as it is now, not from memory.

Existing entries are never edited or deleted. Comment beneath one only when this session adds
something to it, as the last sub-bullet of that entry:

```markdown
- **YYYY-MM-DD** — <original claim>. Evidence: `path:line`
  - **YYYY-MM-DD** — Refined: <the sharper or narrower claim>. Evidence: `path:line`
  - **YYYY-MM-DD** — No longer true: <what changed>. Evidence: `path:line` or commit
  - **YYYY-MM-DD** — Confirmed: <the new case or place where it held>. Evidence: `path:line`
```

"Still true", "confirmed again", or a restatement with no new evidence is noise. Don't write it.

`Session Notes` takes one line:

```markdown
- **YYYY-MM-DD** — <task in a few words> → <sections that got an entry or comment>
```

## Writing safely

Every write is a pure insertion. Nothing already in the file changes, moves, or disappears.

1. **Snapshot** right after the fresh re-read:
   `f=$(mktemp) && cp <pkg>/INSIGHTS.md "$f" && echo "$f"` — keep the printed path.
2. **Insert with the Edit tool, anchored on one existing line.** `new_string` must start with
   `old_string` unchanged, then add your lines after it:
   - new entry, including a `Session Notes` line → `old_string` is the heading line alone
     (`## What Doesn't Work`), even when the section already has entries. Never include an
     existing entry in `old_string`. `new_string` is that heading, a blank line, and the entry,
     so the newest lands first.
   - comment → `old_string` is the last line of that entry (its last sub-bullet, if it has any),
     `new_string` is that line plus the indented dated sub-bullet.
   Headings are unique. If a comment anchor is not, extend it by one neighbouring line; the
   `new_string` still starts with the whole `old_string`.
3. **Never** use the Write tool on an `INSIGHTS.md`, and never write to it from the shell
   (`>`, `sed -i`, `tee`, `mv`, `cp`, scripts). If the Edit tool reports the file changed since
   it was read, re-read and redo the insertion; don't fall back to Write.
4. **Prove nothing was lost:**
   `diff "<snapshot>" <pkg>/INSIGHTS.md | grep '^<' || echo "no existing line changed"`.
   Any `<` line is an existing line you removed or altered. Put it back exactly with Edit
   before doing anything else, rerun the check, and say so in the report.

## The bar

An entry must be actionable cold: the next session reads it and knows what to do without
re-investigating.

| ✗ Noise | ✓ Insight |
|---|---|
| "Promises can be tricky" | "`Promise.all()` on the ingest pipeline times out past 30 items — use `Promise.allSettled()` in batches of 10" |
| "be careful with async" | "checkout-flow state always goes through Zustand (`cartStore.ts`) — the cart is shared by 3 components, local state breaks here" |

**The test: if it would be obvious to anyone reading the code, don't write it.** If you can't
be that specific yet, don't write it yet — put it under `Open Questions` or leave it out.

## What to look for

Strongest signal first:

1. A mistake the agent keeps repeating, or a user correction ("no, do it this way").
2. An approach that was tried and abandoned, and why.
3. An error that came up more than once, and what fixed it.
4. Library, API, or tool behavior that surprised you.
5. A convention you discovered that `CLAUDE.md` and `.claude/rules/` don't state.

A session that went exactly as expected records nothing. That is the normal outcome, not a
failure.

## Keeping the files lean

- The agent only inserts. Pruning is a human job, roughly monthly: remove entries about code
  that no longer exists, merge near-duplicates, resolve contradictions, move stable material
  into the package's `docs/`.
- Past ~200 entries a file stops helping — prune before adding more.
- Entries are a draft under review, not ground truth. They are committed with the change, so
  the diff is where a human spot-checks them.

## Out of scope

This skill writes only to `INSIGHTS.md`. It does not edit `CLAUDE.md`, `.claude/rules/`,
`docs/`, or `specs/`, and it does not run tests.

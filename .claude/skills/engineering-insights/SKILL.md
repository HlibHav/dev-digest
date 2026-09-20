---
name: engineering-insights
description: Reads and records module-local engineering insights in DevDigest's INSIGHTS.md files. Use at the start of any task that concerns client, server, reviewer-core or e2e, to read that module's INSIGHTS.md before working; at the end of any non-trivial task, to record what was learned; and when something non-obvious surfaces mid-task (a user correction, an abandoned approach, a surprising tool behavior). Also triggers on "insights", "wrap up", "what did we learn", "record this".
---

# engineering-insights

1. **Read first.** Once the request is known and before any work, map it to a module ([reference.md](reference.md)), read that `INSIGHTS.md` in full, and state which file you read plus up to 3 entries that bear on the task, or "nothing relevant".
2. **Collect as you go.** When something non-obvious surfaces (a user correction, a failed approach, a repeated error, a surprising tool behavior, an undocumented convention), note it as a candidate. Record only what the session confirmed; an unconfirmed hunch goes to `Open Questions`.
3. **Gate at the end.** Drop a candidate that is obvious to anyone reading the code, too generic to act on cold, or already in `CLAUDE.md`, `.claude/rules/`, or `docs/`. Nothing left → say "nothing worth recording" and stop.
4. **Re-read, then compare.** Read the file again right before writing — it may have changed since step 1. A candidate already covered adds nothing, unless this session refined that entry, contradicted it, or confirmed it with new evidence: then comment under it with a dated sub-bullet. "Still true" alone is not a comment.
5. **Insert, never overwrite.** Existing text stays byte-for-byte: no edit, delete, reorder, or new heading. Follow *Writing safely* in [reference.md](reference.md) — one-line Edit anchors, never Write or a shell command on the file, and a before/after diff that proves no line was lost.
6. **Cap:** at most 3 entries or comments per session, plus one `Session Notes` line when you added any. Every line you write, the `Session Notes` line included, carries a date and `Evidence: path:line`.
7. **Report** one line per entry written or skipped, then stop.

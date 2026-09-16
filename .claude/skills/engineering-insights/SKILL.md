---
name: engineering-insights
description: Reads and records module-local engineering insights in DevDigest's INSIGHTS.md files. Use at the start of any task that concerns client, server, reviewer-core or e2e, to read that module's INSIGHTS.md before working; at the end of any non-trivial task, to record what was learned; and when something non-obvious surfaces mid-task (a user correction, an abandoned approach, a surprising tool behavior). Also triggers on "insights", "wrap up", "what did we learn", "record this".
---

# engineering-insights

1. **Read first.** Once the request is known and before any work, map it to a module ([reference.md](reference.md)), read that `INSIGHTS.md` in full, and state which file you read plus up to 3 entries that bear on the task, or "nothing relevant".
2. **Collect as you go.** When something non-obvious surfaces (a user correction, a failed approach, a repeated error, a surprising tool behavior, an undocumented convention), note it as a candidate. Record only what the session confirmed; an unconfirmed hunch goes to `Open Questions`.
3. **Gate at the end.** Drop a candidate that is obvious to anyone reading the code, too generic to act on cold, or already in `CLAUDE.md`, `.claude/rules/`, or `docs/`. Nothing left → say "nothing worth recording" and stop.
4. **Re-read, then dedupe.** Re-read the target file right before writing. Already covered → skip it or add a dated sub-bullet under it; contradicts an entry → add a dated correction under that entry.
5. **Append only.** Newest first, into one of the seven existing sections, in the entry format from [reference.md](reference.md). Never delete, rewrite, or add a heading.
6. **Cap:** at most 3 entries per session, plus one `Session Notes` line when you added any.
7. **Report** one line per entry written or skipped, then stop.

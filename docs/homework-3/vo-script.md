# DevDigest Homework 3 (Smart Diff, after the mentor review): voiceover script (v2)

One line per scene; the recording holds each scene as long as its line. Voice: Daniel (ElevenLabs, `eleven_multilingual_v2`). Fixture: PR #23.

| # | Scene | Line |
|---|---|---|
| 1 | GitHub, PR #23 Files changed | Homework three, Smart Diff, after the mentor's review. Everything now ships in one pull request, number twenty-two. This is a fresh fixture, pull request twenty-three. On GitHub its lock file sits right next to the logic. |
| 2 | DevDigest, Files changed | In DevDigest the files come grouped by role: core, tests, wiring, docs, boilerplate, each with a label and a file count. Docs and boilerplate start collapsed. |
| 3 | Boilerplate expanded | Boilerplate holds the lock file. Wiring holds package.json and the barrel file. |
| 4 | Run Review → General Reviewer | No review has run yet, so there are no counters. Let's run the General Reviewer. |
| 5 | Agent runs, back to Files changed | The run streams on Agent runs. I go back to Files changed and wait: the counters update on their own, no reload. |
| 6 | Core ● 1, dot on the card | Core shows one file with findings, and that file card carries a dot. The number counts files, not findings. |
| 7 | Lines 17 and 24 | Each finding sits under its own line, with a severity stripe and label, and the same card as on Agent runs: title, rationale, suggested fix, Accept and Dismiss. |
| 8 | Accept, hide / show | Accept works right here, and one toggle hides GitHub comments and findings together. |
| 9 | Original order and back | Original order brings back GitHub's flat list. Smart order brings the groups back. |
| 10 | Overview, Derive intent | The mentor asked for a way to refresh the intent. On the Overview tab, Derive runs it on demand. High confidence here, because the description links a plan doc, and the card lists its sources and scope. After the PR changes, Re-derive refreshes it. |
| 11 | GitHub, .claude/agents on feat/smart-diff | The same pull request also carries the lab agents, now nine, with a brainstorm agent and a read-only security-reviewer Claude Code agent. Its review of this pull request found three issues, all fixed with tests. |
| 12 | GitHub, smart-diff constants.ts | And grouping never calls a model: a pure path classifier with ordered rules in one constants file, so it works before the first review and costs nothing. |

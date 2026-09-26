# DevDigest Homework 3 (Smart Diff): voiceover script (v1)

One line per scene. The recording holds each scene as long as its line, so audio and picture stay in sync. Voice: Daniel (ElevenLabs, `eleven_multilingual_v2`), same as Homework 2.

| # | Scene | Line |
|---|---|---|
| 1 | GitHub, PR #21 Files changed (flat order) | Homework three: Smart Diff. Fixture pull request twenty-one in my DevDigest fork: one new dependency, a small module, a test, a barrel file and a doc. On GitHub the lock file sits next to the logic. |
| 2 | DevDigest, PR #21, Files changed | Files changed in DevDigest. The files come grouped by role: core, tests, wiring, docs, boilerplate, each with a label and a file count. Docs and boilerplate start collapsed. |
| 3 | Boilerplate expanded, package.json under wiring | Boilerplate holds the lock file. And package.json sits under wiring: my one deliberate change to the course rules, pinned in the classifier's test table. |
| 4 | Run Review → General Reviewer | No review has run yet, so there are no counters. Let's run the General Reviewer. |
| 5 | Agent runs, then back to Files changed | The run streams on the Agent runs tab as before. I go back to Files changed and just wait: when the run finishes, the counters update on their own, no reload. |
| 6 | Core `● 1`, dot on the file card | Core now shows one file with findings, and that file card carries a dot. The number counts files, not findings. |
| 7 | Line 10: stripe, label, finding card | In the file, line ten gets a stripe and the warning label, and the finding sits right under it: severity, title, rationale, suggested fix, Accept and Dismiss. It's the same card as on Agent runs. |
| 8 | Accept; Hide / Show toggle | Accept works from here, and one toggle hides GitHub comments and findings together, so the diff stays clean when you want it clean. |
| 9 | Original order, then Smart order | Original order brings back GitHub's flat list, findings included. Smart order brings the groups back. |
| 10 | GitHub, `smart-diff/constants.ts` on feat/smart-diff | And why none of this calls a model: the groups come from a pure path classifier on the server, ordered rules in one constants file, so grouping works before the first review and costs nothing. |

About 230 words, roughly 1:40 of speech; the video lands around 2:30 with the review run and the pauses.

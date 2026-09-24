> **Demo PR for reviewer training — do not merge.** Recreated in this fork from the course demo branch in `ai-agentic-engineering-neo/dev-digest` (homework item 4), so DevDigest reviewers can be run against it.

Adds digest sharing:
- `POST /digests/:id/share` mints a token-capability public link, with an optional password gate. `GET /share/:token` renders the digest for unauthenticated readers, and its query params work as inline template scope.
- `POST /digests/:id/export` writes a downloadable archive under `EXPORT_DIR`. `GET /share/:token/attachment` serves bundle attachments.
- `POST /share/preview` unfurls URLs referenced in a digest into preview cards.
- `POST /admin/exports/snapshot` lets the ops box snapshot the export dir and register it with the internal maintenance API.
- Client: a public `/share/[token]` reader route renders the digest body.

Note: the original course branch shares no git history with this fork's `main`, so GitHub could not open a PR from it. The commit was replayed onto `d45ab0d` (the base of the other demo branches). Only `server/src/modules/index.ts` changed, to register the `share` module next to the fork's existing modules. The feature code is unchanged.

Diff: 8 files, +407 (new `server/src/modules/share/*`, `client/src/app/share/[token]/*`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
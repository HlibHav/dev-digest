# Homework L04: Blast Radius

A reviewer sees the diff, not what else the change can break. Blast Radius answers that from the
repo-intel index built at clone time. No model call, no re-parse.

| File | What it is |
|---|---|
| [plan.md](plan.md) | Development Plan by the `planner` subagent, plus revisions 5.1–5.3 by the main session |
| [../../server/docs/blast-radius.md](../../server/docs/blast-radius.md) | How the feature works today, with a Mermaid data-flow diagram (`doc-writer`) |
| ADR | `../decisions/2026-09-28-blast-radius-contract.md` (outside the repo): nullish `degraded`, `reason` and caller `rank` on the shared `BlastRadius` contract |

## What was built

- **Server.** `GET /pulls/:id/blast` in the new `server/src/modules/blast/` module.
  - It reads the PR's changed files. If `pr_files` is empty, it refreshes them once from GitHub.
  - It calls `repoIntel.getBlastRadius` once, plus `getIndexState`.
  - The pure mapper `toBlastRadius` groups the flat caller list by `viaSymbol` into `downstream`. It attributes endpoints and crons from `factsByFile`, drops callers in the symbol's own declaring file, caps callers per symbol with `MAX_CALLERS_PER_SYMBOL` from `repo-intel/constants.ts` (passed in through `wiring.ts`), sorts by `rank` and builds `summary` from numbers.
  - `degraded` and `reason` pass through. The service derives `index_partial` itself, because the facade never reports it.
  - The route declares `schema.response[200] = BlastRadius`, so the response is validated against the contract on the way out.
  - Every read logs `blast: read repo-intel index` with `source: index | fallback`.
- **Client.** A Blast radius card on the Overview tab, next to Intent.
  - A stat row shows symbols, callers, endpoints and crons.
  - The tree is collapsible, with a `file:line` link per caller. Each link opens that line on GitHub at the index's `lastIndexedSha`, falling back to `head_sha`.
  - Endpoint and cron chips are shown apart.
  - Changed symbols that have no callers get a "no callers" row.
  - A Tree / Graph toggle switches to an SVG graph: boxed nodes, curved edges and a legend.
  - A clear empty state appears when there are no callers.
  - An "Incomplete index" mark shows the reason and a Resync button (`POST /repos/:id/resync`).
  - Every label comes from `messages/en/blast.json`.
- **MCP.** `devdigest_get_blast_radius` replaces the hw4 stub.
  - It resolves repo → PR, calls `GET /pulls/:id/blast` once and returns the same map.
  - Repo-derived text goes through `sanitizeUntrusted` and a cap, with the untrusted-text notice as the first key.
  - It returns useful errors for an unknown repo, an unknown PR, an API 404 or an unreachable API.
  - It carries `readOnlyHint: true`.
  - Callers are flattened to `"file:line name"` strings, so `tools/list` stays under 10,240 bytes (rev 5.1).

## The pipeline

`planner → test-writer (red-first) → implementer A → implementer B ∥ implementer C → architecture-reviewer ∥ plan-verifier ∥ security-reviewer → doc-writer → pr-self-review → engineering-insights`, orchestrated by the main session.

| Subagent (model) | What it did |
|---|---|
| `planner` (opus) | Turned the approved design into a Development Plan: 26 acceptance criteria tagged P1/P2/P3 with proofs, 8 steps and 6 resolved design conflicts. For example, the mapper can't import repo-intel types under `lint:boundaries`, so it declares a local structural type. |
| `test-writer` ×3 (sonnet), in parallel | Red-first tests for server, client and mcp-server before any code. Later rounds: rewrote superseded MCP tests (rev 5.1), fixed two contradictory card tests (rev 5.2), added the cross-workspace 404 test and the rev 5.3 tests. |
| `implementer` A (sonnet) | Shared contract, plus the `blast` module: mapper, service with ports, wiring, route and registration. |
| `implementer` B (sonnet) | Hook, i18n, card, tree, graph, index notice and Overview wiring. Then graph polish and the "no callers" rows. |
| `implementer` C (sonnet), parallel with B | MCP port, adapter, double, use case, output schema and tool. Then the `tools/list` fit (rev 5.1) and the M8 message (rev 5.3). |
| `architecture-reviewer` (opus) | Pass. `lint:boundaries` found 0 new violations and the route makes 0 adapter calls. Three minor client placement notes, accepted in rev 5.2. |
| `plan-verifier` (sonnet) | Per-AC verdicts with evidence. Its process findings (tests edited without a plan entry, unmapped hunks) led to rev 5.2. |
| `security-reviewer` (opus) | Pass. Workspace scoping, JSX escaping and `githubBlobUrl`, MCP sanitisation, and no secrets in the log. It flagged the missing cross-workspace test, which was then added. |
| `doc-writer` (sonnet) | `server/docs/blast-radius.md` |
| general-purpose (sonnet ×2, haiku) | The `pr-self-review` surface slices (client, server) and the full check matrix. |

The main session kept the decisions: the ADR, the demo fixture PR, and plan revisions 5.1–5.3. Revision 5.3 came from running a real headless Claude Code against the tool. The agent called the map "partial" because the summary counted a changed symbol that no group showed, so symbols without callers are now shown in both the UI and the MCP message. The main session also ran the live checks, the Docker integration suite, e2e and the video.

## Known limitations

- **`MAX_CALLERS_PER_SYMBOL` (20) is global in the facade.** It is one `slice` over all callers, so the per-symbol cap rarely bites. The facade was left untouched.
- **Direct callers only.** `BFS_DEPTH` is not used by blast.
- **Symbols and endpoints are file-level.** Every symbol in a changed file counts as changed, and every route in a caller file counts as affected.
- **Callers without a `file_rank` row are dropped** by the facade's join.
- **The ripgrep fallback has no `factsByFile`**, so it can't attribute endpoints. "No re-parse" holds on the `source: index` path.
- **`GET /pulls/:id/blast` can write `pr_files`** for a never-opened PR, the same as `GET /pulls/:id`.
- **Prior PRs touching these files (P3) is not implemented.**

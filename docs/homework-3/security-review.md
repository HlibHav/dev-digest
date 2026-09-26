# Security Review: origin/main...HEAD (feat/smart-diff, PR #22, head 647511e)
Verdict: pass

## Attack surface
- entry points: `GET /pulls/:id/smart-diff` (new, `server/src/modules/smart-diff/routes.ts:23`) → sinks: `reviewRepo.getPull` (workspace-scoped), `getPrFiles`, `reviewsForPull` · untrusted inputs: `:id` (zod `IdParams`), stored PR file paths
- entry points: `GET /pulls/:id/intent` (new, `server/src/modules/reviews/routes.ts:168`) → sinks: `getPull(workspaceId, id)` then `getIntent(prId)` · untrusted inputs: `:id`, persisted model output
- entry points: `POST /pulls/:id/intent` (new, `server/src/modules/reviews/routes.ts:176`, `rateLimit` 10/min) → sinks: `container.github()` (PR detail + `getIssue`), `container.git.readFile` on the local clone, `container.llm` (intent prompt), `pr_intent` upsert · untrusted inputs: PR title/body/branch/commit subjects/paths, linked issue title/body, doc paths parsed from the PR body, doc contents, model output
- entry points: review run (`POST` run route, pre-existing; now calls `IntentService.derive` in `run-executor.ts:122`) → sinks: same as above, plus derived intent into every `uses_intent` agent's review prompt (`reviewer-core/src/prompt.ts` `renderIntentBlock`, `wrapUntrusted('pr-intent', …)`) · untrusted inputs: same as above
- entry points: `GET /pulls/:id` (refactored into `PullsService.refreshPullDetail`, `server/src/modules/pulls/service.ts`) → sinks: GitHub PR detail, `pr_files`/`pr_commits`/`pull_requests` writes · untrusted inputs: `:id`, GitHub payload
- entry points: `POST|PATCH` agents (`uses_intent: z.boolean().optional()`) → sinks: agents row · untrusted inputs: request body
- entry points: `.claude/hooks/agent-bash-allowlist.py`, `agent-write-scope.py`, `agent-write-audit.py`, `.claude/sandbox/run-tests.sh`, `.claude/scripts/review-bundle.sh`, `.claude/settings.json` (PostToolUse(Agent) + UserPromptSubmit) → sinks: shell command rewrite (`updatedInput`), `subprocess` git calls, file writes under `<git dir>/agent-audit/`, `srt` sandbox, `rm -rf "$OUT"` · untrusted inputs: agent-typed Bash commands and file paths, hook JSON
- entry points: client `IntentCard`, `DiffTab` + `DiffViewer`/`FileCard`/`CodeLine`/`RoleGroup` → sinks: JSX text nodes only; findings go through the existing `FindingCard` (`Markdown`) via `renderFinding` · untrusted inputs: model-produced intent/scope text, source refs (doc paths, branch), finding text

## Checks run
| command | exit | key line |
|---|---|---|
| `git status && git log --oneline -1 && git diff --stat origin/main...HEAD` | 0 | `136 files changed, 14812 insertions(+), 172 deletions(-)` |
| `git grep -n -A30 '…Step 5' -- .claude/skills/pr-self-review/SKILL.md` | 1 | no output (pattern mismatch); re-run below |
| `git grep -n -i 'critical\|severity\|^## \|^### ' -- .claude/skills/pr-self-review/SKILL.md` | 0 | `:65 critical … a route with no authz check; unvalidated input reaching a query; SQL built from request data; a hand-edited file under server/src/db/migrations/` |
| `git diff origin/main...HEAD -- <route files>` | 0 | new `GET/POST /pulls/:id/intent`, `GET /pulls/:id/smart-diff`; all call `getContext` + `IdParams` |
| `git grep -n 'readFile' -- server/src/adapters server/src/platform; git grep … -A25 …` | 128 | `simple-git.ts:130: return readFile(join(this.clonePathFor(repo), path), 'utf8');` then `fatal: unable to resolve revision: -A25` (bad option order) |
| `git diff origin/main...HEAD -- reviewer-core/src/prompt.ts …/run.ts …/index.ts` | 0 | `intent` wrapped as `wrapUntrusted('pr-intent', intentBlock)` behind `INTENT_RULES` |
| `git diff origin/main...HEAD -- run-executor.ts service.ts repository.ts pull.repo.ts` | 0 | intent derived once per batch only when an agent has `usesIntent` |
| `git show HEAD:server/src/modules/pulls/service.ts; git show HEAD:…/pulls/repository.ts` | 0 | `getPull` scoped `and(eq(workspaceId), eq(id))` |
| `git diff … -- .claude/settings.json; git show HEAD:.claude/sandbox/run-tests.sh …srt.json …review-bundle.sh` | 0 | srt `"allowedDomains": []`, `"denyRead": []` |
| `git diff origin/main...HEAD -U0 -- client/src \| git grep --no-index … /dev/stdin` | 128 | `fatal: /dev/stdin … is outside repository` (pipe not usable; replaced by next row) |
| `git grep -n -e dangerouslySetInnerHTML -e 'href=' -e innerHTML -e '<Markdown' -e 'window.open' -- client/src/app/repos client/src/components/diff-viewer` | 0 | no hit in a changed file; only pre-existing `FindingCard`/`CommentCard`/`CandidateCard`/`PrDetailHeader` |
| `git diff origin/main...HEAD -- client/src/components/diff-viewer/{CodeLine,FileCard,DiffViewer}.tsx findings.ts` | 0 | text rendered as JSX children only |
| `git diff origin/main...HEAD -- server/src/db/schema/{reviews,agents}.ts …/0013_useful_bedlam.sql …/_journal.json server/package.json; git log … -- server/src/db/migrations` | 0 | one commit `9abeab8`; SQL columns match the schema diff (hand-editing not provable without running drizzle-kit) |
| `git grep -n -e rate-limit -e rateLimit -- server/src; git grep … getPull …; git grep … symlink …` | 0 | `app.ts:96 app.register(rateLimit …)`; `repo-intel/pipeline/walk.ts:89: if (entry.isSymbolicLink()) continue;` |
| `git grep -n -e agent-write-audit -e agent-bash-allowlist -e '^tools:' … -- .claude/agents; git grep … AUDITED_AGENTS … -- .claude/hooks/tests` | 0 | `security-reviewer.md:18/22`, `brainstorm.md:13/17` wire `agent-write-audit.py none`; no test names them |
| `git diff origin/main...HEAD --stat -G'<secret patterns>'` and `-G'(localStorage\|process\.env\|Authorization\|Bearer )'` | 0 | no matching file |
| `git grep -n agent-write-scope -- test-writer.md doc-writer.md; git diff … server/pnpm-lock.yaml; git grep … profile-subagents.py; git grep … readRepoFile … routes.ts` | 0 | write-scope wired (`doc-writer.md:14`, `test-writer.md:17`); `ms@2.1.3` already locked (only importer lines added); `profile-subagents.py:88 with open(path) as f:` (read only); `routes.ts:50 readRepoFile` |

Note on method: this run had no Grep tool, so searches used `git grep`, and commands were prefixed with `cd <repo> &&`. Neither is on the definition's allowed list nor in the hook's `GIT_READ_SUBCOMMANDS`; no hook enforced the allowlist in this run. Nothing was executed besides read-only git.

## Findings
| # | severity | verified / plausible | rule | `path:line` | evidence (quote) | exploit path |
|---|---|---|---|---|---|---|
| 1 | major | plausible | security §A01 / §File Upload Security (path traversal: validate the resolved path stays in the root); house precedent `server/src/modules/repo-intel/pipeline/walk.ts:89` `if (entry.isSymbolicLink()) continue;` | `server/src/modules/reviews/intent-service.ts:177` (check at `server/src/modules/reviews/intent-helpers.ts:163-168`, wiring at `server/src/modules/reviews/routes.ts:50`) | `content = await this.ports.readRepoFile(repoRef, link.path);` · check is lexical only: `if (path.split('/').some((s) => s === '..')) return false;` · sink: `return readFile(join(this.clonePathFor(repo), path), 'utf8');` (`server/src/adapters/git/simple-git.ts:130`) | If the reviewed repo's default branch holds a `*.md/.mdx/.txt/.rst` symlink (for example `docs/plan.md -> /Users/<u>/.devdigest/secrets.json`), any PR author who names that path in the PR body makes the API follow the link on the next review run or `POST /pulls/:id/intent`. Up to 8000 chars of the target go to the model provider, and any echo is persisted in `pr_intent` and shown in IntentCard and in the review prompts. A link to `/dev/zero` instead makes `readFile` buffer until Node's size limit, and `withTimeout` does not cancel it. Inference: git checks symlinks out by default (`core.symlinks=true` on macOS/Linux) and the clone is never configured otherwise. A symlink the PR itself adds is read from the patch, not the filesystem. A run that clones a fixture repo with such a link and calls `POST /pulls/:id/intent` would prove it. |
| 2 | minor | verified | step 3 "Agent hooks: a change in `.claude/hooks/**` keeps failing closed, and its tests cover the new case" (`.claude/agents/security-reviewer.md:115`) | `.claude/hooks/agent-write-audit.py:100` (early return at `:194-195`) | `AUDITED_AGENTS = {"test-writer", "doc-writer", "architecture-reviewer", "plan-verifier"}` · `if agent_type not in AUDITED_AGENTS: return` | `security-reviewer` (`.claude/agents/security-reviewer.md:18,22`) and `brainstorm` (`.claude/agents/brainstorm.md:13,17`) wire the write audit, but the main-session report step returns before reading their result. It also skips the "write audit did not run" warning. So a file a prompt-injected security-reviewer changed through an allowlist bypass is never surfaced. `.claude/hooks/tests/test_agent_write_audit.py` has no case for either agent. |
| 3 | minor | plausible | security §Agentic AI Security (ASI01: sanitise prompt input); `reviewer-core/CLAUDE.md` "Untrusted text … goes through `wrapUntrusted`" | `server/src/modules/reviews/intent-helpers.ts:320` (also `:327`, `:332`) → grandfathered `reviewer-core/src/prompt.ts:32` | `wrapUntrusted(\`issue-${i}\`, datamark(\`${issue.title}\n\n${issue.body}\`))` · `const safe = content.replaceAll('</untrusted>', '<\\/untrusted>');` | This diff newly routes linked-issue bodies, plan-doc contents and commit subjects into a prompt. `wrapUntrusted` only escapes the exact lowercase `</untrusted>`, and `sanitizeSourceText` (`intent-helpers.ts:37-43`) doesn't touch tags. So an issue or doc containing `</Untrusted>` or `</UNTRUSTED>` (datamarking only rewrites whitespace) closes the block as far as the model reads it, and the text after it is presented as trusted instructions to the intent classifier. The impact is bounded: `change_type` is a zod enum, and the output is flattened, capped and re-wrapped as `pr-intent` before a reviewer sees it. Whether the model honours a case-variant close tag is the inference. |

## Not checked
- `.claude/scripts/profile-subagents.py` (359 lines): only grepped for sinks (`subprocess`, `eval`, `exec`, `open`, `write_text`, `os.system`); one read-mode `open` at `:88`, not read in full.
- `docs/homework-3/pipeline/*.js` (`record-demo.js`, `smart-diff-*.workflow.js`): not read; scanned only for secret patterns (none).
- `server/src/db/migrations/meta/0013_snapshot.json`: generated file; not read. Whether `0013_useful_bedlam.sql` was hand-edited cannot be proven without running drizzle-kit; its SQL matches the schema diff.
- `server/src/modules/reviews/diff-loader.ts`, `settings/feature-models.ts` and the LLM adapters' `completeStructured`: not in the diff's security-relevant hunks; not read.
- `.claude/hooks/tests/*.py`: only grepped. The security-profile allowlist cases exist (`test_agent_bash_allowlist.py:328-360`). The tests were not run (not permitted).
- `client/src/lib/hooks/reviews.ts`, `DiffTab.tsx` and `RoleGroup.tsx` bodies: covered only by the sink grep (no `dangerouslySetInnerHTML`/`href`/`innerHTML` in changed files); `renderFinding` → `FindingCard` → `Markdown` is pre-existing.
- `pr_intent.intent`/`in_scope` model output has no length cap before persistence (`PrIntentExtraction` is `z.string()`); hardening only, no exploit path established, so not graded.

## Out of scope, noticed
- `rederive` returns the raw adapter error text to the client via `ExternalServiceError` (`intent-service.ts:338`, `app.ts:155` sends `err.message`). This is info-disclosure hardening for a local-first app, with no attacker path found.
- `agent-write-audit.py` result files for agents outside `AUDITED_AGENTS` are written but never consumed, so they accumulate in `<git dir>/agent-audit/`.

## Insight candidates
- `IntentService` reads repo files through `container.git.readFile`, which follows symlinks, while `repo-intel`'s walker deliberately skips them (`walk.ts:89`). The two paths into the same clone have different symlink policies. A lexical `..` check is not containment.
- A new subagent that wires `agent-write-audit.py` must also be added to `AUDITED_AGENTS`, or its audit runs and nobody reads it. Nothing ties the two lists together.

---

## Resolution (main session, 2026-09-26)

All three findings were fixed in the same PR, each with a regression test that fails on the old
code:

| # | Fix | Test |
|---|---|---|
| 1 | `SimpleGitClient.readFile` resolves the real path, refuses anything outside the clone or not a regular file, and caps the size at 1 MB before reading (`server/src/adapters/git/simple-git.ts`) | `server/test/git-readfile.test.ts`: a symlink out of the clone and a `..` path are refused; a symlink inside the clone still reads |
| 2 | `security-reviewer` and `brainstorm` added to `AUDITED_AGENTS` in `.claude/hooks/agent-write-audit.py` | `test_new_read_only_agents_are_audited` in `.claude/hooks/tests/test_agent_write_audit.py` |
| 3 | `wrapUntrusted` neutralises `</untrusted>` in any letter case and with whitespace before `>` (`reviewer-core/src/prompt.ts`) | `neutralises a close tag in any letter case…` in `reviewer-core/test/prompt.test.ts` |

The run's method note stands: this smoke run could not load the agent's hooks (definitions are
cached per session), so it used `git grep` and `cd …&&`, which the `security` profile would not
allow. In a session started with the agent present, the hook enforces the list.

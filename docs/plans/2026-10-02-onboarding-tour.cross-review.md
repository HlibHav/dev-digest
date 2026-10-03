# Cross-model review: 2026-10-02-onboarding-tour.md

Reviewer: `deepseek/deepseek-v3.2` via OpenRouter · 87 s · tokens in 33543 / out 3823 · cost $0.0109977

Spec: `specs/2026-10-02-onboarding-tour.md` · Plan: `docs/plans/2026-10-02-onboarding-tour.md`

---

**Defects:**

**XR-1**  
Severity: major  
AC/Plan section: AC-15, R15, step 6 helpers  
What is wrong: The plan's `toIndexStatus` implementation in step 6 incorrectly handles the `unsupported_languages` case. According to AC-15 and the spec, `unsupported_languages` is a distinct index status when the clone contains no supported source files. The plan's logic returns `unsupported_languages` when `sourceFiles === 0`, but this should only apply when there are supported source files? Wait, re-reading: AC-21 says "IF the clone contains no file with an extension the code index reads... THEN the system shall generate the tour with the LLM... and show 'Reading order is unavailable for this repository's languages'". The index status should be `unsupported_languages` in this case. However, the plan's `toIndexStatus` returns `unsupported_languages` when `sourceFiles === 0`, but this could also happen when the index is unavailable. The spec says `unsupported_languages` is a distinct status.  
Concrete fix: In `toIndexStatus`, check `sourceFiles === 0` first, then check flag/state. Ensure `unsupported_languages` is returned only when there are no supported files, regardless of index state.

**XR-2**  
Severity: major  
AC/Plan section: AC-28, R28, step 6 helpers  
What is wrong: The plan's `deriveCommands` in step 6 does not specify handling of `bun test` and `bun build` scripts. According to AC-28, for bun, `bun test` and `bun build` would run bun's own built-in tools instead of the scripts. The spec says to use `bun run <script>` for scripts named `dev`, `start`, `build`, `test`. The plan says "scripts `dev`, `start`, `build`, `test` as `npm run s` / `pnpm s` / `yarn s` / `bun run s`". This is correct for bun, but the note about built-in tools is important: we must use `bun run test` not `bun test`. The plan should explicitly state that for bun, the command format is `bun run <script>` for all four script names, including `test` and `build`.  
Concrete fix: In `deriveCommands` documentation and implementation, ensure for bun lockfile, commands are `bun run dev`, `bun run start`, `bun run build`, `bun run test`.

**XR-3**  
Severity: critical  
AC/Plan section: AC-33, R33, step 6 helpers  
What is wrong: The plan's `mergeTour` function in step 6 says "a reason attaches by exact path only for a path in `existing`". However, AC-33 states that the LLM may write each file's one-line reason, but it may not add, remove or reorder files. The deterministic reason "imported by <N> files" shall be shown if LLM gives no reason. The plan's approach of attaching reasons only for paths in `existing` (which is the set of paths that exist in the clone) is correct for filtering out non-existent paths, but it doesn't specify that the LLM's reasons must correspond to the exact files from the index (critical paths and reading path). The plan should clarify that the LLM's `file_reasons` array is filtered to only include entries where the path matches a file in the deterministic list (critical or reading), and for those matches, the reason is used; otherwise, the deterministic reason is used.  
Concrete fix: In `mergeTour`, map over deterministic file lists (critical and reading), for each file, find matching LLM reason by path; if found and path exists, use LLM reason; else use deterministic reason.

**XR-4**  
Severity: major  
AC/Plan section: AC-35, R35, step 6 helpers  
What is wrong: The plan's `orientationChecklist` function in step 6 returns items with `path: null, reason: null, reason_source: 'deterministic'`. However, AC-35 says each checklist item is a title with no path and a deterministic reason source. It doesn't specify that reason is null; the reason source is `deterministic`, but the reason text itself is not defined. The spec says "Each item is a title with no path and a deterministic reason source." This might imply the reason is empty or derived from the title. The plan should define what the `reason` field is for checklist items (likely empty string or null).  
Concrete fix: Define checklist items with `reason: ''` or `reason: null` and `reason_source: 'deterministic'`. Ensure client rendering handles null reason.

**XR-5**  
Severity: minor  
AC/Plan section: AC-41, R40, step 6 helpers  
What is wrong: The plan's `buildModelInput` caps routes at 50, README at 4000 chars, folders at 20, but doesn't explicitly cap the number of files in critical and reading lists. AC-41 says "no more files than the caps of the critical and reading lists". The caps are MAX_CRITICAL=5 and MAX_READING=10. The plan should ensure `buildModelInput` receives already-capped lists.  
Concrete fix: In `buildModelInput`, assume the incoming `criticalFiles` and `readingFiles` are already capped to 5 and 10 respectively, or cap them inside the function.

**XR-6**  
Severity: major  
AC/Plan section: AC-19, R19, step 8 service  
What is wrong: The plan's `generate` method in step 8 says: "(b) `unavailable` → skeleton `index_unavailable`, 0 calls." However, AC-19 says this applies when "the code index of a repository that has supported source files is unavailable". The condition `unavailable` in the plan's `toIndexStatus` includes cases where `sourceFiles === 0`? Actually, `toIndexStatus` returns `unsupported_languages` when `sourceFiles === 0`, so `unavailable` would not include that. But there's also the case where the index is unavailable but there are supported source files. The plan's logic is correct, but it should explicitly check that there are supported source files (i.e., `sourceFiles > 0`) before treating as `index_unavailable`. Otherwise, if `sourceFiles === 0`, it should be `unsupported_languages` (handled elsewhere).  
Concrete fix: In `generate`, after collecting facts, if index status is `unavailable` and `sourceFiles > 0`, then skeleton with `index_unavailable`; if `sourceFiles === 0`, it should be `unsupported_languages` (which is a different status).

**XR-7**  
Severity: critical  
AC/Plan section: AC-25, R25, step 8 service  
What is wrong: The plan's step 8 says: "(d) A skeleton result when the stored tour parses with `source: 'llm'` → keep it with `last_failure = { reason, at: now, llm }` (AC-25, any of the four reasons)." However, AC-25 applies only when "a regeneration ends in the skeleton while the repository already has a tour written by the LLM". The plan's condition is correct, but it doesn't specify that the earlier LLM-written tour is kept as the repository's tour. The plan says "keep it" but "it" refers to the skeleton? Actually, "keep it" likely means keep the earlier LLM tour. The wording is ambiguous.  
Concrete fix: Clarify: if the new result is a skeleton (`source: 'skeleton'`) and there is an existing stored tour with `source: 'llm'`, then do NOT save the skeleton; keep the existing LLM tour, record `last_failure`, and log the generation outcome as `llm_failed`/`timed_out`/etc.

**XR-8**  
Severity: major  
AC/Plan section: AC-23, R23, step 8 service  
What is wrong: The plan's `generate` method says: "On a throw, `log.error('onboarding: fact collection failed for <repo> — <err>')`, then build the skeleton with `skeleton_reason 'error'` from what was collected, `llm.calls 0`, and outcome `error` (AC-23)." However, AC-23 requires showing the page status line "Some facts couldn't be read — showing what was collected from code". The plan's skeleton building should include that status line. The skeleton built by `buildSkeleton` does not automatically include that status line; it must be added as a page-level status line. The plan doesn't specify how the status line is stored/rendered.  
Concrete fix: The status line is likely part of the tour's metadata or rendered by client based on `skeleton_reason`. Ensure `skeleton_reason: 'error'` maps to the correct status line text in client.

**XR-9**  
Severity: minor  
AC/Plan section: AC-14, R14, step 12 client  
What is wrong: The plan's step 12 says the subline uses ICU plural for "LLM call(s)". However, AC-14 says "subline shall show '<n> LLM call(s) · <cost> · <provider/model>'", with "—" for null cost. The plan's implementation is correct, but it doesn't mention handling of null cost. The `formatCost` helper should return "—" for null.  
Concrete fix: Ensure `formatCost` returns "—" for null/undefined cost.

**XR-10**  
Severity: major  
AC/Plan section: AC-29, R29, step 12 client  
What is wrong: The plan's step 12 says "The copy `<button aria-label='Copy {command}'>` writes `item.command` only, then shows 'Copied'." However, AC-29 requires that when the user activates a command's copy button, the system shall copy exactly the command text, without the note, and confirm the copy. The plan is correct, but it doesn't specify that the note is stored separately from the command in the item. The item structure has `command` and `note` fields. The copy should use `item.command`.  
Concrete fix: Ensure `CommandRows` component copies `item.command` only, not `item.note`.

**XR-11**  
Severity: critical  
AC/Plan section: AC-16, R16, step 8 service  
What is wrong: The plan includes a test `onboarding-review-isolation.it.test.ts` for AC-16, but the test description says "tour marker never reaches a review prompt". However, the plan doesn't specify how the isolation is ensured. The spec says "The system shall not include any part of a tour in any review prompt." The plan should ensure that the tour repository or service does not expose tour content to review prompts. The test is red-first, but the implementation must not accidentally leak tour content.  
Concrete fix: Ensure no code in review modules imports or queries onboarding tour content.

**XR-12**  
Severity: minor  
AC/Plan section: AC-37, R37, step 12 client  
What is wrong: The plan's step 12 says "The overview renders `Markdown` (no `rehype-raw`), then `MermaidDiagram` only when `diagramAllowed`." However, AC-37 requires rendering Markdown with no raw HTML, no executable markup, no active `javascript:` link, and file paths as inline code. The vendored `Markdown` component may not sanitize `javascript:` links by default. The plan mentions a risk about react-markdown defaults.  
Concrete fix: Verify the vendored `Markdown` component's configuration; if needed, add props to disable raw HTML and transform URLs to blank `javascript:` links.

**XR-13**  
Severity: major  
AC/Plan section: AC-10, R10, step 8 service  
What is wrong: The plan's `generate` method uses `deadline(llm.completeStructured(...), LLM_DEADLINE_MS)`. However, AC-10 says "exactly one LLM call and shall not retry it on failure". The `completeStructured` may have internal retries (provider-level). The plan sets `maxRetries: 0` in the request, but as noted in Risks, the SDK may still transport-retry. This could result in more than one call in terms of billing? The spec counts LLM calls as requests to the provider; retries count as additional calls.  
Concrete fix: Ensure the LLM provider configuration disables retries at the transport level, or document that retries are counted as multiple calls (violating AC-10). The test mocks may not catch this.

**XR-14**  
Severity: minor  
AC/Plan section: AC-31, R31, step 6 helpers  
What is wrong: The plan's `orderReadingPath` uses `pagerank*(1+hotness)` where hotness is 0. However, AC-31 says "recent-change activity is 0 while no change history exists." The plan is correct, but it doesn't specify that `hotness` is stored in `RankedFileRow` and may be non-zero in the future. The calculation should be `pagerank * (1 + hotness)`.  
Concrete fix: Implement `orderReadingPath` with `rank = pagerank * (1 + hotness)`.

**XR-15**  
Severity: major  
AC/Plan section: Lane DAG ordering  
What is wrong: The lane DAG shows lane 4 (onboarding service) depends on lanes 1, 2, 3. However, lane 4 also depends on lane 0 (contracts) because it uses the shared contracts. The plan says lane 4 after 1,2,3, but lane 0 is level 0. This is fine, but lane 4's step 8 uses types from step 1 (repo-intel reads), which itself depends on lane 0. The ordering is correct, but the description could be clearer.  
Concrete fix: Ensure lane 4 runs after lanes 0,1,2,3 are complete.

**XR-16**  
Severity: minor  
AC/Plan section: AC-22, R22, step 6 helpers  
What is wrong: The plan's `buildSkeleton` for architecture overview includes items for stack and folders. However, AC-22 says "an Architecture overview listing the detected stack and the top-level folders with their file counts, with no prose and no diagram". The plan's skeleton architecture has `body: ''`, which is correct. But it also includes items for stack and folders. The client rendering must display these items as a list, not as prose.  
Concrete fix: Ensure client renders architecture items as a list (stack chips, folder rows) when `body` is empty and items exist.

**XR-17**  
Severity: critical  
AC/Plan section: AC-27, R27, step 6 helpers  
What is wrong: The plan's `mergeTour` says "a note attaches by exact command". However, AC-27 says "The LLM may add a one-line note to a derived command, but no command of its own." The plan must filter out any `command_notes` where the command is not in the derived commands list.  
Concrete fix: In `mergeTour`, filter `command_notes` to only those where `command` matches exactly a command in the deterministic command list.

**XR-18**  
Severity: minor  
AC/Plan section: AC-39, R39, step 12 client  
What is wrong: The plan's step 12 says Share link copies `${location.origin}/repos/${repoId}/onboarding`. However, the tour page is under `/repos/[repoId]/onboarding`. The plan is correct, but it doesn't specify that `repoId` is the repository ID (numeric), not the full name.  
Concrete fix: Use the `repoId` from route params.

**XR-19**  
Severity: major  
AC/Plan section: AC-34, R34, step 11 helpers  
What is wrong: The plan's `githubBlobUrl` function in step 11 constructs a URL. However, AC-34 requires opening the file on GitHub at the commit the tour was built from. The tour's `commit_sha` is used. The plan is correct, but it doesn't specify encoding of path segments. The path may contain spaces or special characters.  
Concrete fix: Ensure `githubBlobUrl` encodes the path segments properly (encodeURIComponent for each segment?).

**XR-20**  
Severity: minor  
AC/Plan section: AC-8, R8, step 12 client  
What is wrong: The plan's step 12 says "`generating` → `role='status'` 'Generating…', with Generate and Regenerate `disabled`". However, AC-8 says "WHILE a generation for the repository is in progress, the page shall show a generating state and disable Generate and Regenerate." The plan is correct, but it doesn't mention that the Regenerate button should be disabled (it says both Generate and Regenerate disabled).  
Concrete fix: Disable both Generate and Regenerate buttons when `state === 'generating'`.

**Verdict:** needs changes

---

## Run log

| run | model | settings | result | cost |
|---|---|---|---|---|
| 1 | deepseek/deepseek-v4-pro | default reasoning | empty content (not recorded) | unknown |
| 2 | deepseek/deepseek-v4-pro | reasoning effort medium, max_tokens 24k | empty, finish_reason=length, 24,000 reasoning tokens | $0.0125 |
| 3 | deepseek/deepseek-v4-pro | reasoning max_tokens 16k, max_tokens 40k | empty, finish_reason=length, 39,999 reasoning tokens (budget ignored) | $0.0190 |
| 4 | deepseek/deepseek-v4-pro | reasoning effort low, max_tokens 120k | no response within 30 min, killed | unknown |
| 5 | deepseek/deepseek-v3.2 | reasoning disabled, max_tokens 16k | this review, 87 s | $0.0110 |

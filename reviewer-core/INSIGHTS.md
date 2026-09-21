# reviewer-core — insights

Findings that are true about this code but not visible in it. Maintained by the
`engineering-insights` skill: read before working here, add an entry after a
non-trivial task, skip routine changes. Append-only — never rewrite or delete an
entry; correct a stale one with a dated sub-bullet beneath it. Sections are
fixed — add to the one that fits.

## What Works

## What Doesn't Work

- **2026-09-21** — The way `renderSkillsBlock` embeds a skill breaks the prompt's own structure in two confirmed ways. **(1) Headings collide:** a trusted skill is wrapped as `### name`, but seeded and extracted bodies carry their own `# Title` and `## Flag / ## Severity / ## Do not flag` — so inside `## Skills / rules` a skill's `##` sits at the same level as the prompt's `## PR description` and `## Diff to review`, and nothing marks where one skill ends, the next begins, or the prompt resumes. **(2) A vetted imported skill is told to be ignored:** `source: imported_url` renders inside `<untrusted source="skill-N">`, and `INJECTION_GUARD` in the same prompt says everything in `<untrusted>` is "DATA … never instructions" and warns specifically against text telling reviewers to "not flag" — while every seeded skill has a `## Do not flag` section. Enabling an imported skill therefore adds rules the model is instructed not to follow. Before trusting any with/without-skills comparison, read the assembled prompt (`run_traces.trace.prompt_assembly.user`) rather than the skill rows. Evidence: `reviewer-core/src/prompt.ts:86`, `reviewer-core/src/prompt.ts:87`, `reviewer-core/src/prompt.ts:164`, `reviewer-core/src/prompt.ts:17`

## Codebase Patterns

- **2026-09-20** — `wrapUntrusted(label, content)` neutralises `</untrusted>` in the **content** but interpolates `label` straight into `source="${label}"`. Every caller before skills passed a literal (`'diff'`, `'pr-description'`, `` `spec-${i}` ``), so it had never mattered. Any new caller must pass a constant label and put caller-controlled text **inside** the block — a quote in a label would otherwise close the attribute. Evidence: `reviewer-core/src/prompt.ts:33`, `reviewer-core/src/prompt.ts:86`

## Tool & Library Notes

- **2026-09-21** — A review defaults to `temperature: 0`, so running the same agent on the same diff N times is **not** N samples: on PR #8 the raw text differed between runs but the verdict, finding count and score were identical every time within a configuration (e.g. 65 ×4, 100 ×4). "4/4" means the decision is stable at temp 0, not that it held across four independent draws. For an experiment that needs a rate, vary the input or pass an explicit `temperature`. Evidence: `reviewer-core/src/llm/openrouter.ts:72`
  - **2026-09-21** — Refined: repeats also agree because OpenRouter keeps routing to one backend for a while, and that expires. About 15 providers serve `deepseek/deepseek-v4-flash`. `completeStructured` sends no `provider` preference and keeps only the content and `usage`, so nothing records who answered. On PR #8 one byte-identical prompt counted 7186 prompt tokens and approved (×4, 07:02–07:04 UTC), then counted 5854 and blocked (08:41). For an experiment, pin one provider (`provider: { order: [<name>], allow_fallbacks: false }`). Two signs of a backend switch: `tokens_in` jumps on an identical prompt, or `tokens_out` sits at the content length (171 tokens for 678 chars: no reasoning) where it used to run far above it (2676 for 1938 chars). Evidence: `reviewer-core/src/llm/openrouter.ts:69`

## Recurring Errors & Fixes

## Session Notes

- **2026-09-21** — Ran H1 on skills dilution. The effect stopped reproducing, and the evidence points at unpinned OpenRouter routing (not yet proven) → Tool & Library Notes (comment), Open Questions (comment). Evidence: `reviewer-core/src/llm/openrouter.ts:69`

- **2026-09-21** — Investigated why the API Contract Reviewer lost a breaking change once more than one skill was linked → What Doesn't Work, Tool & Library Notes, Open Questions. Evidence: `reviewer-core/src/prompt.ts:80`

- **2026-09-20** — `PromptParts.skills` went `string[]` → `PromptSkill[]` and `renderSkillsBlock` now owns the trusted/untrusted split → Codebase Patterns. Evidence: `reviewer-core/src/prompt.ts:80`

## Open Questions

- **2026-09-21** — Why does one skill catch a breaking change that two miss? On PR #8 (`POST /agents` 201 → 200) `breaking-change` alone blocks, and `breaking-change` plus any one of `repo-conventions`, `semver-discipline` or `deprecation-policy` approves at score 100 with a false claim that the route "already answered 200". Ruled out: the diff being truncated (the `- reply.status(201)` line is in every prompt), the updated test assertions in the diff, and the skill's "default branch" wording. Not yet separated: the heading collision and `<untrusted>` wrapping above, the stacked `## Do not flag` sections, and plain dilution. Next discriminator: link a same-size skill with no rules at all — if it also flips the verdict, it is volume, not content. Evidence: `docs/handoff/2026-09-21-skills-dilution.md`
  - **2026-09-21** — Refined: the H1 run could not decide it. `breaking-change` plus a rule-free skill (one sentence, then 1997 chars of prose) still blocked. So did `breaking-change` + `repo-conventions` and all five skills, both of which approved that morning. Every pair row behind the question ran with the reworded v2 body, and the whole morning series came from a different backend (see the `temperature: 0` note). The open question is now whether one provider causes the flip. Next discriminator: the same prompt pinned to each provider (H5). Evidence: `docs/handoff/2026-09-21-skills-dilution.md:202`
  - **2026-09-21** — Refined (H5): the flip is provider × skills. It reproduces only on OpenInference, the one provider that counts 7186 prompt tokens for the all-five prompt. Pinned there with `provider: { order: ['open-inference/fp8'], allow_fallbacks: false }`, all five skills caught the 201 → 200 change 1/9. `breaking-change` alone caught it 5/6 and no skills 5/6. `breaking-change` plus 1997 chars of neutral prose, one neutral sentence or `repo-conventions` caught it 6/6 each. The other providers caught it with all five in 10/11 calls. A no-reasoning backend is not the cause: DeepInfra and DigitalOcean spent 0 reasoning tokens and caught it. Still open: which of the other four skills, or how much volume, flips it on OpenInference. Evidence: `docs/handoff/2026-09-21-skills-dilution.md:231`

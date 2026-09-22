# api-contract-house-rules — v1.5.0

A DevDigest skill for the **API Contract Reviewer**. It holds three contract rules about this
repository that a diff does not reveal, and nothing else. It replaces the reviewer's previous
five skills (`breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy`,
`repo-conventions`).

`SKILL.md` is the skill. Its body is what reaches the model. This README is for people: it
records why the skill looks the way it does, how it was measured, and every source used.

## What it checks

| # | Rule | Why a model misses it | Severity | Evidence |
|---|---|---|---|---|
| 1 | Fields in `Review` / `Finding` use `.nullish()`, not `.optional()` | The schemas double as the strict LLM output schema. An optional field reads as safe; under `strict: true` it becomes required | warning (agent band) | `.claude/rules/shared-contracts.md:15-18`, `server/src/vendor/shared/contracts/findings.ts:56`, `reviewer-core/src/llm/openrouter.ts:123` |
| 2 | A shared contract changes in both copies in the same diff | The client copy is a hand mirror with no sync script, and a one-sided change looks complete | warning (agent band) | `.claude/rules/shared-contracts.md:9-14`, `client/AGENTS.md:24-25` |
| 3 | Client requests surface errors as `ApiError` | Pages branch on `instanceof ApiError`, which the diff does not show | warning (agent band) | `client/src/lib/api.ts:44-58`, `client/src/app/repos/[repoId]/pulls/page.tsx:111` |

Rule 1 was checked in code. `toJsonSchema` (`reviewer-core/src/llm/structured.ts:19`) puts a
`.optional()` field into `required` with no `nullable`, and the OpenAI SDK only prints a
warning. Rule 3 is the rule the Conventions Extractor produced as `repo-conventions`, rewritten
as a check with its reason and its one legitimate exception (non-JSON responses such as
downloads).

The skill names no severity. The agent's own bands grade all three as warnings: none breaks a
deployed caller, and its WARNING band names "the two shared contract copies disagreeing"
outright. When the skill wrote "warning" under each rule, the model carried that grade over to
unrelated findings (iterations 1.3.0–1.5.0 below). The skill makes the reviewer **find** these
defects. It does not make it block the merge.

## Why three rules, not a catalogue

The general catalogue of breaking changes (removed or renamed fields, new required inputs,
changed status codes) is knowledge the model already applies. Without any skill, the reviewer
caught PR #8's `201 → 200` change in 4 of 4 runs on both providers. A skill only adds a catch
where the model cannot know the rule. So every candidate rule was first tested against the
**no-skills baseline**, and only the ones the baseline misses went in.

No-skills baseline, the finding had to be about the planted defect:

| Case | Parasail (reasons) | OpenInference (no reasoning) | In the skill? |
|---|---|---|---|
| `.optional()` in a strict LLM schema | 0/6 | 0/6 | yes (rule 1) |
| client request bypasses `ApiError` | 0/8 | 0/8 | yes (rule 3) |
| contract changed in the server copy only | 2/6 | 0/6 | yes (rule 2) |
| `GET /pulls/:id` stops syncing from GitHub | 4/4 | 5/6 | no, the diff shows it |
| a camelCase field among snake_case siblings | 6/6 | 4/6 | no, the diff shows it |
| status code 201 → 200 (PR #8) | 4/4 | 4/4 | no, general knowledge |
| `res.json()` on a 204 | 4/4 | 4/4 | no, general knowledge |

The previous five skills failed for reasons measured in
`docs/handoff/2026-09-21-skills-deep-analysis/`:

- 59% of their 56 rules were general knowledge.
- Their `## Do not flag` sections vetoed each other. `semver-discipline`'s "an internal
  refactor is a patch" alone suppressed the PR #8 catch (0/6).
- Five skills together caught less than one alone did.
- The one repo-specific rule they had fired only on a provider that reasons.

## How it was built

Eval-first, following the loop of Anthropic's `skill-creator`. It was adapted because
DevDigest skills are always pasted into the prompt: nothing is triggered by a description, and
every run goes through the reviewer's own prompt assembly on OpenRouter.

1. **Research.** Three parallel reviews: how to write rules a model applies, how production
   AI reviewers take team rules, and API compatibility standards plus this repo's own
   conventions. They produced 48 sources, listed below; every URL was checked on 2026-09-21.
2. **Test cases before the skill.** Nine cases: three the baseline should miss, four it
   already catches, PR #8 as a regression guard, and a clean change that must draw no finding.
3. **Baseline.** No skills, and the old five skills, on two pinned providers.
4. **Write the skill** under the design rules below.
5. **Measure** against pre-registered criteria (see Evaluation).

Design rules, each traced to sources:

- **Only what the model cannot infer.** Build the eval first and write just enough to close
  the gap. (Anthropic skill-authoring best practices; CodeRabbit path instructions: "add an
  instruction only after a consistent gap"; Frömmgen et al., Google.)
- **No global exemptions.** An exception lives inside its rule with its condition, and the
  skill says it narrows nothing else. Every production reviewer scopes rules and treats them
  as additive. (Greptile custom rules, Sourcery review rules, CodeRabbit, Graphite; the
  Instruction Hierarchy paper: models do not infer which instruction outranks which.)
- **Positive, checkable phrasing, with the reason.** (skill-creator "explain the why";
  IFEval's verifiable instructions; negative-constraint work, used as a hypothesis only.)
- **Severity on the rule itself**, not in the agent's role prompt. (Greptile's rule schema
  carries `severity`; oasdiff makes per-check severity configurable.)
- **A real example from this repo with `path:line`** for every rule, and the citation must
  point at the added line in the diff, because a finding on the wrong line is dropped by
  DevDigest's grounding gate. (Graphite "rule, bad, good, reasoning"; HalluJudge; Lu et al.,
  ICML 2025.)
- **Few rules, most important first.** (Lost in the Middle; Multi-IF; FollowBench.)

## Evaluation

### Current configuration: v1.5.0, agent prompt v6, reviews routed to Parasail

On the harness, Parasail, n = 6, with the agent's current system prompt. Found (blocks); for
the clean case, false positives.

| Case | No skills | v1.5.0 |
|---|---|---|
| `.optional()` in a strict LLM schema | 0 (0) / 6 | **6 (0) / 6** |
| client request bypasses `ApiError` | 0 (0) / 6 | **6 (0) / 6** |
| contract changed in the server copy only | 3 (0) / 6 | **5 (0) / 6** |
| PR #8, status code 201 → 200 | 6 (6) / 6 | 6 (6) / 6 |
| clean change, false positives | 0 / 5 | 0 / 6 |
| new enum member, server copy only | 6 (4) / 6 | 6 (2) / 6 |
| `res.json()` on a 204 | 4 (4) / 5 | 6 (6) / 6 |
| `GET /pulls/:id` stops syncing | 5 (2) / 6 | 5 (0) / 6 |
| camelCase field among snake_case | 6 (0) / 6 | 6 (0) / 6 |

In the app, which adds repo map and callers to the prompt, with provider routing on. Every run
logged the provider that answered: Parasail, and StreamLake as a fallback.

| PR | No skills | v1.5.0 |
|---|---|---|
| #10 `demo/finding-related-ids` (`.optional()` in `Finding`) | 0/2 | **3/3** found |
| #11 `demo/findings-csv-export` (plain `Error`, not `ApiError`) | 0/2 | **3/3** found |
| #8 status code 201 → 200 | found and blocks 2/2 | found 6/6, blocks 5/6 |

On #11, both arms sometimes add a CRITICAL claiming the download "omits authentication
headers". This app has no request authentication, and the claim appears without the skill too.

All pre-registered criteria are met on Parasail. The 150 s request deadline and the provider
routing are in `reviewer-core/src/llm/openrouter.ts` (ADR
`../decisions/2026-09-21-openrouter-provider-routing.md`, outside the repo).

### History: v1.0.0–v1.2.0 under the previous agent prompt

Setup: the API Contract Reviewer's real system prompt and the real `assemblePrompt`, with
repo map and callers left out. `deepseek/deepseek-v4-flash`, temperature 0, pinned to
Parasail (reasons before answering) and OpenInference (does not reason, and pastes the JSON
schema into the prompt). A third provider, DeepInfra, answered 429 to nearly every call and
was dropped. There were 6 runs per cell, and a few cells have more.

Found means a finding names the planted defect. For the clean case the number is false
positives, where lower is better. Cells read Parasail | OpenInference.

| Case | No skills | Old five skills | v1.0.0 | v1.1.0 | **v1.2.0** |
|---|---|---|---|---|---|
| `.optional()` in a strict LLM schema | 0/6 \| 0/6 | — | 6/6 \| 6/6 | 6/6 \| 6/6 | **6/6 \| 6/6** |
| client request bypasses `ApiError` | 0/8 \| 0/8 | 4/4 \| 0/4 | 9/9 \| 6/6 | 6/6 \| 6/6 | **6/6 \| 6/6** |
| contract changed in the server copy only | 2/6 \| 0/6 | — | 5/6 \| 0/6 | 6/6 \| 0/6 | **5/6** \| 0/6 |
| PR #8, status code 201 → 200 (regression guard) | 8/8 \| 8/8 | 4/4 \| 3/4 | 11/11 \| 6/6 | 6/6 \| 6/6 | **6/6 \| 5/6** |
| clean change, false positives | 0 \| 0 | 0 \| 0 | 0 \| 0 | 0 \| 2 | **0 \| 0** |
| new enum member, server copy only | 7/8 \| 4/8 | 3/4 \| 2/4 | 6/6 \| 5/6 | 5/6 \| 4/6 | 5/5 \| 6/6 |
| `res.json()` on a 204 | 7/7 \| 7/8 | 4/4 \| 1/4 | 6/6 \| 6/6 | 6/6 \| 6/6 | 6/6 \| 2/6 |
| `GET /pulls/:id` stops syncing | 4/4 \| 5/6 | — | 2/4 \| 4/6 | 5/6 \| 5/5 | 4/6 \| 4/6 |
| camelCase field among snake_case | 6/6 \| 4/6 | — | 2/6 \| 2/6 | 2/6 \| 0/6 | 6/6 \| 1/6 |

In v1.2.0, PR #8 blocks in 11 of 12 runs, and 11 of 12 citations point inside the diff. With
the old five skills on OpenInference, the change was found in 3 of 4 runs, but none of those
citations landed in the diff, so DevDigest's grounding gate would have dropped every one.

Against the criteria set before the first run:

- **Parasail: met.** The three cases the baseline misses are found 6/6, 6/6 and 5/6. PR #8
  still blocks, there are no false positives, and no other case falls clearly below the
  baseline.
- **OpenInference: partly met.** The two strongest rules work (6/6 and 6/6), PR #8 blocks,
  and there are no false positives. The server-only contract change is never found (0/6 in
  every version), and two general cases drop below the baseline (`res.json()` on a 204:
  2/6; camelCase: 1/6).

The skill was not tuned further for OpenInference. It is the backend that already broke the
old skills, and wording aimed at one faulty provider would overfit. Excluding that provider is
an OpenRouter routing decision, outside this skill.

Iterations:

- **1.0.0.** Three rules. The two uplift rules worked. Two general cases regressed: the model
  approved camelCase and the `GET` change with no findings at all. The agent's system prompt
  says of the skills "apply exactly those: they are the review", so a skill holding only house
  rules switched off the general review.
- **1.1.0.** An opening line told the model to review as it would with no skills. This brought
  back the `GET` case, but not camelCase, because the line only mentioned breaking changes.
  Rule 2 got an explicit list-and-compare check. OpenInference began reporting satisfied rules
  as warnings: 2 false positives on the clean case.
- **1.2.0.** The opening line now covers everything the model would report without skills,
  inconsistencies included. It also says a rule the diff satisfies is not a finding. Rule 2
  names its most visible form: server copy changed, client copy untouched. This cleared the
  false positives and brought camelCase back on Parasail.

On Parasail, 1.2.0 is the better version. On OpenInference it is a trade, not a clear gain.
1.1.0 keeps `res.json()` on a 204 at 6/6 but has 2 false positives and camelCase at 0/6.
1.2.0 has no false positives but drops the 204 case to 2/6, and camelCase recovers only to
1/6. This data does not settle which to ship. The criterion "no other case below the
baseline" fails on OpenInference for both. **1.2.0 was chosen** (Glib, 2026-09-21). The
decision record is `../decisions/2026-09-21-api-contract-skill-rebuild.md`, outside the repo.

Later the same day a check in the app itself, with repo map and callers, found a severity
regression. That check led to 1.3.0–1.5.0 and to the agent prompt change:

- **1.3.0.** With 1.2.0, PR #8 blocked in 1 of 3 app runs against 3 of 3 without it: the model
  applied the rules' "warning" to the status-code finding. The opening now says general
  findings keep their grade, which gave 3 of 4.
- **Agent prompt v5 → v6** (approved by Glib). "Read them and apply exactly those: they are
  the review" became "apply every one of them on top of your own review, never instead of it".
  On the harness this removed most of the narrowing: new enum member 9/11 → 6/6, camelCase
  5/6 → 6/6. Its first wording, "unless a skill sets its own", let a skill's severity spread
  (PR #8 blocked 0 of 3). Scoping it to "applies to that rule only" gave 2 of 4.
- **1.4.0.** The opening's reason "they are warnings because none breaks a deployed caller" was
  removed, because the model applied that reasoning to the status code. PR #8: 4 of 6.
- **1.5.0.** The per-rule "Severity: warning" lines were removed; every finding is graded by
  the agent's bands. PR #8: 5 of 6, and the two demo PRs are unchanged.

Grading note: the grader for the `.optional()` case first required the field name. Two v1.0.0
findings were titled "New field in `Finding` uses `.optional()` instead of `.nullish()`"
without naming it, so the pattern was widened. The diff adds exactly one field, and no
baseline finding mentions `.optional()` or `.nullish()` at all. The `GET` baseline counts only
the rerun with the corrected case description. The first description leaked the defect.

Limits: 6 runs per cell cannot separate 5/6 from 6/6, so only large gaps count. Two
providers. Repo map and callers were left out, while the app includes them. Each case was
written for this evaluation, so these are not real PRs.

## Using it in DevDigest

- **Applied on 2026-09-21.** The skill was created as a manual skill, so it renders trusted.
  It is the API Contract Reviewer's only skill. The old five, `repo-conventions` included,
  stay in the library unlinked. The agent runs on system prompt v6.
- **Import.** Zip this folder and import it on `/skills`. The importer takes `SKILL.md` and
  lists every other file without processing it (`server/src/modules/skills/import.ts:64-71`),
  and it ignores the `version` key in the front matter. An imported skill is stored with
  `imported_url` provenance, lands disabled, and is rendered inside `<untrusted>` under the
  trust model of 2026-09-20. In earlier measurements a skill behaved differently wrapped that
  way than rendered trusted. That is why it was created manually, with this body.

## Re-running the evaluation

The harness, the nine cases and every result row live in
`docs/handoff/2026-09-21-skills-deep-analysis/rebuild/evals/`. See `rebuild/E-eval-harness.md`
there for setup. One arm is one command, run from `reviewer-core/`:

```sh
node_modules/.bin/tsx <harness>/run.ts run --skills <dir with 01-name/SKILL.md> \
  --label <arm> --cases <ids> --providers parasail/fp8,open-inference/fp8 --n 6 --out <file>
```

Pin providers. OpenRouter routes this model to about 15 providers, and a verdict depends on
which one answers. Temperature 0 is not deterministic, even on one provider.

## Changelog

- **1.5.0** (2026-09-21): no per-rule severity; every finding is graded by the agent's bands.
- **1.4.0** (2026-09-21): the opening no longer gives a reason for the rules' grade.
- **1.3.0** (2026-09-21): the opening says general findings keep their usual grade.
- **1.2.0** (2026-09-21): the opening covers everything a no-skills review would report,
  and a satisfied rule is not a finding. Rule 2 flags a server-only contract change directly.
- **1.1.0** (2026-09-21): opening line keeping the general review on; rule 2 as an explicit
  list-and-compare check.
- **1.0.0** (2026-09-21): first version. Three rules, chosen by baseline measurement.

## Sources

### Skill and prompt authoring

- **Skill authoring best practices** — Anthropic. Official documentation.
  https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. The model already knows general facts; build evaluations first and write only what closes a measured gap.
- **Introducing Agent Skills** — Anthropic, 2025. https://claude.com/blog/skills. Skills exist to keep instructions out of an always-loaded prompt. DevDigest skills are always loaded, so the size budget matters more.
- **skill-creator** — Anthropic. https://github.com/anthropics/skills/tree/main/skills/skill-creator (`SKILL.md`, `agents/grader.md`, `agents/comparator.md`, `references/schemas.md`). The eval loop: with-skill and baseline runs side by side, explain the why instead of MUSTs, assertions a wrong output cannot pass, and variance tracked per configuration.
- **Demystifying evals for AI agents** — Anthropic. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents. Grade the output with structured rubrics. pass@k and pass^k diverge, so a single run proves little.
- **Develop test cases** — Anthropic. https://platform.claude.com/docs/en/docs/build-with-claude/develop-tests. Specific, measurable success criteria, plus edge cases, decided before the prompt.
- **Evaluation best practices** — OpenAI. https://developers.openai.com/api/docs/guides/evaluation-best-practices. Define the eval objective first, and mix real data with adversarial cases.
- **The Instruction Hierarchy** — Wallace et al. (OpenAI), 2024. https://arxiv.org/abs/2404.13208. Models do not infer which instruction outranks which unless taught, which is why an exemption must say its own scope.
- **Lost in the Middle** — Liu et al., TACL 2024. https://arxiv.org/abs/2307.03172. Information in the middle of a long context is used least.
- **Multi-IF** — He et al. (Meta), 2024. https://arxiv.org/abs/2410.15553. Instruction-following accuracy falls as constraints accumulate.
- **FollowBench** — Jiang et al., ACL 2024. https://github.com/YJiangcm/FollowBench. Adding constraints one at a time isolates the cost of each. Caution: project page read, not the full paper.
- **IFEval** — Zhou et al. (Google), 2023. https://arxiv.org/abs/2311.07911. Verifiable instructions: a check a grader can execute without judgement.
- **Semantic Gravity Wells: Why Negative Constraints Backfire** — Rana, 2026. https://arxiv.org/abs/2601.08070. Naming a forbidden behaviour may prime it. Caution: single-author preprint, used as a hypothesis only.
- **Negation: A Pink Elephant in the Large Language Models' Room?** — Vrabcová et al., 2025. https://arxiv.org/abs/2503.22395. Negation remains a weak spot for LLMs. General corroboration only.
- **CheckList** — Ribeiro et al., ACL 2020. https://arxiv.org/abs/2005.04118. Specific, named test types find far more failures than one aggregate score.
- **Judging LLM-as-a-Judge: Rubric Artifacts** — Bagaria et al., 2026. https://arxiv.org/abs/2609.02942. Rubric wording carries signal of its own. Grade on outcomes, not on keyword overlap.

### LLM code review in practice and research

- **Resolving Code Review Comments with ML** — Frömmgen et al. (Google), ICSE-SEIP 2024. https://research.google/blog/resolving-code-review-comments-with-ml/ and https://research.google/pubs/resolving-code-review-comments-with-machine-learning/. Precision is tuned first, because wrong suggestions cost trust.
- **AI-Assisted Fixes to Code Review Comments at Scale** — Maddila, Rigby et al. (Meta), 2025. https://arxiv.org/html/2507.13499v1. 68% offline turned into 19.75% in production: offline evals overstate usefulness.
- **Enhancing Code Quality at Scale with AI-Powered Code Reviews** — Microsoft. https://devblogs.microsoft.com/engineering-at-microsoft/enhancing-code-quality-at-scale-with-ai-powered-code-reviews/. Repository-specific guidelines on top of a general reviewer, and suggestions labelled by impact.
- **"Go Home Copilot, You're Drunk"** — Cynthia, Widyasari, Roy, Zhang, Lo, 2026. https://arxiv.org/html/2607.21997v1. The top reason maintainers reject AI review comments is an intentional design decision the agent did not know about. Repo facts matter.
- **CodeReviewer** — Li et al. (Microsoft), ESEC/FSE 2022. https://arxiv.org/abs/2203.09095. The standard framing of automated review tasks. Caution: abstract read, not the full paper.
- **Path-based review instructions** — CodeRabbit. https://docs.coderabbit.ai/configuration/path-instructions. Rules are scoped to paths, supplement rather than override, and are added only after a consistent gap.
- **Context Engineering: Level up your AI Code Reviews** — CodeRabbit. https://coderabbit.ai/blog/context-engineering-ai-code-reviews. Separate mechanisms for scope, instructions and learnings, and verification before showing a comment.
- **Custom rules / custom standards** — Greptile. https://greptile.com/docs/how-greptile-works/custom-rules and https://greptile.com/docs/code-review/custom-standards. A rule is `{id, rule, scope, severity}`, and rules are additive.
- **Best practices / additional configurations** — Qodo (PR-Agent). https://docs.qodo.ai/qodo-documentation/code-review/qodo-merge/features/best-practices, https://qodo-merge-docs.qodo.ai/usage-guide/additional_configurations/, https://github.com/qodo-ai/pr-agent/wiki/.pr_agent_auto_best_practices. A size cap on the rules file, and layered files applied additively.
- **Write review rules** — Sourcery. https://docs.sourcery.ai/reviews/review-rules/. A path glob plus plain prose. Rules add to the standard checks and never replace them.
- **Customizing AI code review tools** — Graphite. https://graphite.dev/guides/customizing-ai-code-review-tools. Rule, bad example, good example, reasoning. "What to flag" and "never flag" are separate mechanisms.
- **HalluJudge** — Tantithamthavorn et al., FSE 2026. https://arxiv.org/html/2601.19072v3. A comment unsupported by the diff counts as a hallucination, and detection tops out at about F1 0.85.
- **Towards Practical Defect-Focused Automated Code Review** — Lu et al., ICML 2025. https://arxiv.org/pdf/2505.17928. Line localization and redundancy filtering are pipeline stages, not prompt wording.
- **Refute-or-Promote** — Agarwal, 2026. https://arxiv.org/pdf/2604.19049. A second pass that must refute a finding before it is kept. Caution: single-author preprint.
- **An Empirical Study of Security Calibration in LLMs for Code** — Siddiq, Rahman, Santos, 2026. https://arxiv.org/html/2606.31159v1. Report calibration and false trust, not accuracy alone.
- **Are LLMs reliable code reviewers? Systematic overcorrection in requirement conformance judgement** — Automated Software Engineering (Springer), 2026. https://doi.org/10.1007/s10515-026-00638-5. LLM reviewers over-flag correct code. Caution: paywalled, abstract only, not verified.

### API compatibility standards and tools

- **AIP-180: Backwards compatibility** — Google. https://google.aip.dev/180
- **AIP-181: Stability levels** — Google. https://google.aip.dev/181
- **AIP-185: API versioning** — Google. https://google.aip.dev/185
- **Azure REST API Guidelines (vNext)** — Microsoft. https://raw.githubusercontent.com/microsoft/api-guidelines/vNext/azure/Guidelines.md
- **RESTful API Guidelines: Compatibility** — Zalando. https://github.com/zalando/restful-api-guidelines/blob/main/chapters/compatibility.adoc. Rule 108: clients must tolerate unknown fields and extensible enums.
- **RESTful API Guidelines: Deprecation** — Zalando. https://github.com/zalando/restful-api-guidelines/blob/main/chapters/deprecation.adoc
- **RFC 8594: The Sunset HTTP Header Field** — IETF, 2019. https://www.rfc-editor.org/rfc/rfc8594.html
- **RFC 9745: The Deprecation HTTP Response Header Field** — IETF, 2025. https://www.rfc-editor.org/rfc/rfc9745.html
- **OpenAPI breaking changes: the complete list of rules** — oasdiff. https://www.oasdiff.com/docs/breaking-changes. Adding an enum value is breaking by default there, non-breaking for GitHub: the policy-dependent boundary.
- **Breaking change rules and categories** — Buf. https://buf.build/docs/breaking/rules/
- **APIs as infrastructure: future-proofing Stripe with versioning** — Stripe. https://stripe.com/blog/api-versioning
- **REST API breaking changes** — GitHub. https://docs.github.com/en/rest/about-the-rest-api/breaking-changes
- **REST API versions** — GitHub. https://docs.github.com/en/rest/about-the-rest-api/api-versions
- **Semantic Versioning 2.0.0** — semver.org. https://semver.org/

The API compatibility sources establish what the model already knows. That is why the
catalogue stays out of the skill.

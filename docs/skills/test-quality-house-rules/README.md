# test-quality-house-rules — v1.1.0

A DevDigest skill for the **Test Quality Reviewer**. It holds one test-quality rule about this
repository that a diff does not reveal, and nothing else. It replaces the reviewer's previous
two skills, `branch-coverage-gate` and `test-smells`. It was built with the same method as
`../api-contract-house-rules/`: research, test cases, a no-skills baseline, then the skill.

`SKILL.md` is the skill, and its body is what reaches the model. This README is for people.

## What it checks

| # | Rule | Why a model misses it | Severity | Evidence |
|---|---|---|---|---|
| 1 | A test of code that resolves its model through the registry mocks every provider id | The mock matches today's default, so the test passes. Nothing in the diff shows that the default can move | warning (agent band) | `server/src/modules/settings/feature-models.ts:51`, `server/src/modules/conventions/routes.ts:23`, `server/test/conventions.it.test.ts:85-90`, `server/INSIGHTS.md:26`, commit `f5323f7` |

When the registry default moves, a test that mocked only today's provider sends a real, paid
call to the live model and asserts against whatever comes back. That already happened in this
repo once.

## Why one rule

The test-review knowledge a model already applies stays out of the skill: missing tests,
untested branches, assertion-free tests, over-mocking, flaky patterns. The agent's own prompt
also carries the impact band that decides the obvious cases ("an untested path that swallows
an error, skips an authorization or tenancy check… is CRITICAL"). Each candidate was measured
against the no-skills baseline first:

| Case | No skills, Parasail | No skills, AtlasCloud | Old two skills, Parasail | In the skill? |
|---|---|---|---|---|
| Integration test mocks only today's default provider | 0/6 | 0/3 | 0/6 | yes |
| DB-touching test named `*.test.ts`, not `*.it.test.ts` | 1/6 | 1/4 | 0/6 | not yet (see below) |
| `not.toBeNull()` on a Drizzle column nothing populates | 6/6 | 2/4 | 6/6 | no, general knowledge |
| PR #6, a new module with no tests (regression guard) | 6/6 | 3/4 | 6/6 | no, general knowledge |

The old two skills added nothing measurable on any case.

The misnamed-test case is not in the skill yet, for two reasons. Its fixture carried a second,
unrelated defect, so the measurement is confounded. And its real consequence is milder than it
looks: the unit CI job runs on `ubuntu-latest`, which has Docker, so such a test still runs,
only it slows the job that is meant to be hermetic. It is the next rule to test once the
fixture is clean.

## Evaluation

### Current configuration: v1.1.0, agent prompt v5

With the agent's current prompt, where skills add to the review instead of replacing it.
Found, or false positives for the clean case. Parasail | AtlasCloud.

| Case | No skills | v1.1.0 |
|---|---|---|
| Provider-mock gap | 0/5 \| 0/4 | **6/6 \| 4/4** |
| Drizzle `not.toBeNull()` | 6/6 \| 3/4 | 6/6 \| 3/4 |
| Clean, correctly covered change (false positives) | 1/6 \| 2/4 | 0/6 \| 0/4 |
| PR #6 regression guard | 6/6 \| 2/4 | 4/4 \| 3/4 |

The rule is caught every time. There is no false positive, and PR #6 holds. The narrowing that
v1.0.0 showed on AtlasCloud is gone, as it is for the API Contract skill. The misnamed-test
case is not a rule yet (see above), and neither arm finds it reliably.

In the app, with repo map, callers and provider routing, on demo PR #12
(`demo/conventions-model-override-test`, based on `feat/agent-skills`), a new integration test
whose mock is registered under `openrouter` only:

| | Without skills | v1.1.0 |
|---|---|---|
| Names the one-provider mock | 0 / 3 | **3 / 3** (2 warnings, 1 suggestion) |

Without the skill, every run senses the gap and reports the generic "the test does not prove
the scan uses the resolved model", once as a CRITICAL, but never names the mechanism. Log:
`docs/handoff/2026-09-21-skills-deep-analysis/rebuild/app-runs/6-tq-v1.1-prompt-v5.txt`.

### History: v1.0.0 under the previous agent prompt

Two providers: Parasail (where reviews are routed) and AtlasCloud (a reasoning fallback).

| Case | No skills | Old two skills | v1.0.0 |
|---|---|---|---|
| Provider-mock gap, Parasail \| AtlasCloud | 0/6 \| 0/3 | 0/6 \| 0/4 | **6/6 \| 4/4** |
| Drizzle `not.toBeNull()` | 6/6 \| 2/4 | 6/6 \| 3/4 | 6/6 \| 4/4 |
| Clean, correctly covered change (false positives) | 0/5 \| 1/4 | 0/6 \| 0/4 | 0/5 \| 1/4 |
| PR #6 regression guard | 6/6 \| 3/4 | 6/6 \| 3/4 | 5/6 \| 1/4 |

The one AtlasCloud false positive appears with and without the skill. It is a pedantic warning
about relying on an implicit default. The PR #6 drop on AtlasCloud shows the same narrowing
that hit the API Contract Reviewer. It was measured before the agents' system prompts stopped
telling the model to apply only the skills (2026-09-21). The re-run under the new prompt is the
current configuration above.

Cases, harness and results: `docs/handoff/2026-09-21-skills-deep-analysis/rebuild/evals-tq/`.

## Using it in DevDigest

Applied on 2026-09-21. The skill was created as a manual skill with the body of `SKILL.md`, so
it renders trusted; the importer would store it as untrusted and disabled. It is the Test
Quality Reviewer's only skill. `branch-coverage-gate` and `test-smells` stay in the library
unlinked. The agent runs on system prompt v5.

Changed on 2026-09-22: the lab expects the reviewer to carry its seeded skills, so it links
`branch-coverage-gate`, `test-smells`, then this skill last. Pre-registered bar: #12 names the
one-provider mock at least 2/3, #6 flags the missing tests 2/2. Measured in the app:

| PR | Without skills | Three skills |
|---|---|---|
| #12 names the one-provider mock | 0/3 (2026-09-21) | **3/3** |
| #6 flags a new module with no tests | — | 2/2 |
| #9 names the untested branches of `shouldSweep` | 3/3 | 3/3, each branch named |

PR #9, the happy-path-only fixture, does not separate the arms: the model finds its untested
branches without any skill. `branch-coverage-gate` makes the findings sharper, one per branch,
including the "not old enough" boundary, but the control experiment's "misses without, catches
with" is PR #12. Skills block: 1,219 tokens.

## Changelog

- **1.1.0** (2026-09-21): no per-rule severity; every finding is graded by the agent's bands.
  The same change fixed a severity carry-over in the API Contract skill.
- **1.0.0** (2026-09-21): first version. One rule, chosen by baseline measurement.

## Sources

Skill-authoring and LLM-review sources are shared with the API Contract skill. They are listed
in full in `../api-contract-house-rules/README.md`. The central ones: Anthropic's
[skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices),
[skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator),
[The Instruction Hierarchy](https://arxiv.org/abs/2404.13208) and
[Lost in the Middle](https://arxiv.org/abs/2307.03172).

Test-quality domain (checked 2026-09-21):

- **Software Engineering at Google, ch. 12 "Unit Testing"** — Winters, Manshreck, Wright (eds.). https://abseil.io/resources/swe-book/html/ch12.html. Test behaviours, not methods. Clear failure messages.
- **Software Engineering at Google, ch. 13 "Test Doubles"** — same editors. https://abseil.io/resources/swe-book/html/ch13.html. Prefer real implementations and fakes. A mock that drifts from the real thing proves nothing.
- **Testing on the Toilet: Test Behaviors, Not Methods** — Google Testing Blog, 2014. https://testing.googleblog.com/2014/04/testing-on-toilet-test-behaviors-not.html
- **Flaky Tests at Google and How We Mitigate Them** — Google Testing Blog, 2016. https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
- **Code Coverage Best Practices** — Ivanković, Petrović (Google Testing Blog), 2020. https://testing.googleblog.com/2020/08/code-coverage-best-practices.html. Coverage thresholds are a team policy, not a universal number.
- **TestCoverage** — Martin Fowler. https://martinfowler.com/bliki/TestCoverage.html
- **State of Mutation Testing at Google** — Petrović, Ivanković, ICSE-SEIP 2018. https://research.google/pubs/state-of-mutation-testing-at-google/. A test that cannot fail is the defect mutation testing exposes.
- **Mutant states and metrics** — Stryker Mutator. https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/
- **Refactoring Test Code** — van Deursen, Moonen, van den Bergh, Kok, XP 2001. The origin of the test-smells vocabulary. Caution: not opened, described through secondary sources.
- **Test smells catalog** — testsmells.org. https://testsmells.org/pages/testsmells.html
- **tsDetect** — Peruma et al., ESEC/FSE 2020. https://github.com/TestSmells/TSDetect. Most smells are mechanically detectable, which is why the skill leaves them to the model's general knowledge or to a linter.
- **Guiding Principles** — Testing Library. https://testing-library.com/docs/guiding-principles/
- **About Queries** — Testing Library. https://testing-library.com/docs/queries/about/
- **Mocking** — Vitest. https://vitest.dev/guide/mocking
- **Getting Started** — Testcontainers. https://testcontainers.com/getting-started/
- **Are Coding Agents Generating Over-Mocked Tests? An Empirical Study** — Hora, Robbes, 2026. https://arxiv.org/html/2602.00409v1
- **On the Evaluation of Large Language Models in Unit Test Generation** — Yang et al., 2024. https://arxiv.org/abs/2406.18181
- **Quality Assessment of Python Tests Generated by Large Language Models** — Alves et al., 2025. https://arxiv.org/abs/2506.14297
- **LLM-as-a-Judge for Scalable Test Coverage Evaluation: Accuracy, Operational Reliability, and Cost** — Huang, Chew, Dutkiewicz, Wang, 2025. https://arxiv.org/abs/2512.01232

Repo evidence for the rule comes from the repository itself: `server/INSIGHTS.md:26`, commit
`f5323f7` and `server/test/conventions.it.test.ts:85-90`.

# Test Quality Reviewer — domain research (Researcher T1)

Scope: domain knowledge behind grading a PR's tests. No repo reading — another analyst covers
DevDigest's own conventions. All sources below were opened and read by me unless flagged
"not verified".

## 1. Most actionable principles

1. **The single highest-value check is "can this test fail for the reason it claims to test."**
   Assertion-free tests (van Deursen's catalog names it *Unknown Test*; testsmells.org calls the
   no-assertion case out explicitly), tautological assertions, and tests that pass against both
   correct and mutated code are the concrete, mechanical thing a small model can check without
   deep reasoning. Two 2024-25 studies on LLM-generated tests found this is exactly where they
   fail most: assertion errors were 64% of all defects found in LLM-written Python tests (Alves
   et al. 2025), and 87% of injected defects went undetected because generated tests didn't even
   compile or exercise the right input (Yang et al. 2024). This restates general knowledge
   (Finding 1) — the value isn't the rule, it's turning it into a per-assertion, mechanically
   answerable question.

2. **Teach the mutation-testing mindset as a procedure, not a fact.** Google's mutation testing
   (Petrović & Ivanković 2018) and Stryker's kill/survive framing give a concrete review
   technique: for each assertion, ask "if I flipped this conditional / off-by-one / boundary in
   the code under test, would this assertion still pass?" A survived mutant *is* a missing test
   case, named exactly. Given Finding 4 (terse extracted rules don't fire on non-reasoning
   backends), this needs to be written as an explicit step-by-step check, not a one-line maxim
   like "write tests that can fail."

3. **Coverage numbers and smell severities are policy, not universal fact — say so explicitly in
   the skill.** Even Google frames its 60/75/90 coverage bands as a starting example, not a
   mandate ("Code Coverage Best Practices," 2020), and Fowler's warns that coverage is diagnostic,
   not a target. This is the direct fix for Finding 5 (severity lives in the wrong place): a
   skill that says "prefer branch coverage over line coverage" adds nothing (already known); a
   skill that says "an uncovered error-handling branch on a changed file = CRITICAL" adds a
   decision the model cannot infer on its own.

4. **Mocking hierarchy: real > fake > stub > mock, and interaction-test only state-changing
   calls.** This is Google's SWE-book chapter 13 verbatim, and it is empirically still violated
   at scale by coding agents: a 2026 mining study of 1.2M commits found agents add mocks in 36%
   of test commits vs. 26% for human commits, and use "mock" almost exclusively (95%) versus
   humans' broader mock/fake/spy mix (Hora & Robbes, MSR 2026). That gap is the argument for
   keeping an explicit over-mocking check even though the underlying rule is "obvious" —
   obviousness hasn't stopped agents from doing it.

5. **Give findings a shared, precise vocabulary instead of prose description.** The test-smells
   catalog (van Deursen's original 11, extended to ~19-21 by testsmells.org/tsDetect) names
   Assertion Roulette, Eager Test, Mystery Guest, Sensitive Equality, Sleepy Test, etc., each with
   a one-line mechanical definition. tsDetect shows these are detectable at 96%/97%
   precision/recall by static analysis alone — meaning a reasoning model doesn't need to be
   taught *how* to spot them, just prompted to check for them by name and asked to name the smell
   in its finding. This turns fuzzy prose into a fixed enum, useful for consistent
   severity-mapping later.

6. **Scope every exemption to the axis it's written for.** Not from the literature — this is the
   direct fix for Finding 2 (skills veto each other via unscoped "Do not flag" sections). Any
   "don't flag X" clause in a test-quality skill must say what it does *not* exempt (e.g. "this
   PR is exempt from *new-test-required*, not from *no-assertion-tests-already-present*").

7. **Put the check most likely to get suppressed last, and keep it small.** Finding 3 showed
   moving the key skill to load last restored a 0/6 catch to 5/6. No external source addresses
   prompt-ordering, so this is a build-time decision for the orchestrator, not new domain
   knowledge — flagging it here because principles 1-2 are the ones most worth protecting from
   dilution.

8. **Flaky-test smells are diagnosable from a diff, without running anything.** Sleepy Test
   (raw `sleep`/`setTimeout` instead of fake timers or explicit waits), Mystery Guest (hitting a
   real file/network/DB instead of a fixture or Testcontainers instance), and shared mutable
   state between tests are Google's own top reported causes of flakiness (Testing Blog, 2016) and
   match named smells in the catalog. Vitest's own docs flag the two tool-specific traps that
   cause the same failure mode: `vi.mock` hoisting confusion and forgetting to clear/restore
   mocks between tests, which silently pollutes later tests.

## 2. Sources

Format: Title — Author/Org — URL — Date — Type — Takeaways — Relation to Findings 1–6.

1. **Software Engineering at Google, Ch. 12 "Unit Testing"** — Google / Winters, Manshreck,
   Wright (eds.) — https://abseil.io/resources/swe-book/html/ch12.html — undated (book: 2020) —
   official doc/book chapter. Takeaways: tests should be complete+concise+behavior-focused;
   "test behaviors, not methods"; prefer DAMP over DRY in test helpers; failure messages must
   distinguish expected from actual. **Supports Finding 1** — canonical example of knowledge a
   capable model already has; restating it adds nothing.

2. **Software Engineering at Google, Ch. 13 "Test Doubles"** — Google (same eds.) —
   https://abseil.io/resources/swe-book/html/ch13.html — undated — official doc. Takeaways:
   preference order real > fake > stub > mock; stubbing more than a few calls makes tests
   "unclear, brittle, ineffective"; interaction-test only state-changing functions; fakes must be
   contract-tested against the real thing. **Supports Finding 1**; also underlies principle 4.

3. **"Testing on the Toilet: Test Behaviors, Not Methods"** — Google Testing Blog —
   https://testing.googleblog.com/2014/04/testing-on-toilet-test-behaviors-not.html —
   2014-04-14 — engineering blog. Takeaways: name and structure tests by behavior, not by which
   method they call; one behavior per test. **Supports Finding 1.**

4. **"Flaky Tests at Google and How We Mitigate Them"** — Google Testing Blog —
   https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html — 2016-05-27 —
   engineering blog. Takeaways: root causes are timing/sleeps, external deps, shared state, test
   ordering; mitigation is statistical flakiness tracking + quarantine, not blanket re-run; "a
   persistently failing test is giving a clear signal ... even if it means fixing the test."
   **New** — gives diagnosable flaky-test signatures usable at diff-review time.

5. **"Code Coverage Best Practices"** — Google Testing Blog, Ivanković & Petrović —
   https://testing.googleblog.com/2020/08/code-coverage-best-practices.html (full text verified
   via mirror googblogs.com/code-coverage-best-practices after the original page rendered only
   comments) — 2020-08-07 — engineering blog. Takeaways: coverage proves execution, not
   correctness; recommends mutation testing (naming Stryker for JS) to catch "false coverage";
   the 60/75/90 bands are offered as a contextual example, explicitly not a universal mandate.
   **Supports Finding 5** directly.

6. **"TestCoverage" (bliki)** — Martin Fowler — https://martinfowler.com/bliki/TestCoverage.html
   — undated (long-standing, industry-standard secondary reference) — engineering blog.
   Takeaways: coverage is a diagnostic for finding untested code, not a quality score; "high
   coverage numbers are too easy to reach with low quality testing"; branch coverage more
   meaningful than line coverage. **Supports Finding 5.**

7. **"State of Mutation Testing at Google"** — Petrović & Ivanković, ICSE-SEIP 2018 —
   https://research.google/pubs/state-of-mutation-testing-at-google/ — 2018 — paper (official
   pub page, abstract + summary read; full PDF not parsed). Takeaways: mutation analysis
   "subsumes a number of other coverage criteria"; a diff-based probabilistic approach makes it
   affordable at PR-review scale; deployed in code review to ~6,000 engineers. **Extends** —
   supplies the concrete technique behind principle 2, not just restated general knowledge.

8. **"Mutant states and metrics"** — Stryker Mutator docs —
   https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/ —
   undated (current) — tool docs. Takeaways: killed/survived/timeout/no-coverage states; score =
   detected/valid×100; a survived mutant names an exact missing test case. **Supports Finding 5**
   (score thresholds are configurable) and gives reusable vocabulary for a TS/JS repo.

9. **"Refactoring Test Code"** — van Deursen, Moonen, van den Bergh, Kok, XP 2001 — **not
   verified**: every fetch attempt (ceur-ws citation PDF, ResearchGate) returned binary/403 and
   could not be read directly; described here only via secondary corroboration (citing papers,
   testsmells.org attribution, ACM/ScienceDirect listings). Reported contribution: originated
   the term "test smell," defined an initial catalog of 11 smells with matching refactorings.
   **Supports Finding 1** as the foundational instance of "textbook knowledge already in the
   model."

10. **Test Smells catalog** — testsmells.org (SCANL Lab / Peruma et al.) —
    https://testsmells.org/pages/testsmells.html — undated — official project doc. Takeaways: ~19
    named, precisely defined smells (Assertion Roulette, Eager Test, Mystery Guest, Sensitive
    Equality, Sleepy Test, Unknown/Empty Test = no assertions, Magic Number Test, etc.).
    **Supports Finding 1 and 6** — a fixed vocabulary for labeling findings consistently.

11. **tsDetect** — Peruma et al., ESEC/FSE 2020 Tool Demos —
    https://github.com/TestSmells/TSDetect — 2020 — tool + paper. Takeaways: mechanically detects
    19 Java test smells at ~96% precision / 97% recall, proving these are objective, rule-based
    patterns, not subjective judgment calls. **Extends Finding 1** — if a smell is this
    mechanically detectable, the skill's job is to prompt the check, not teach detection logic.

12. **"Guiding Principles"** — Testing Library (Kent C. Dodds / org) —
    https://testing-library.com/docs/guiding-principles/ — undated (current) — official doc.
    Takeaway: "the more your tests resemble the way your software is used, the more confidence
    they can give you"; avoid testing implementation details. **Supports Finding 1.**

13. **"About Queries"** — Testing Library — https://testing-library.com/docs/queries/about/ —
    undated (current) — official doc. Takeaways: explicit priority order — getByRole /
    getByLabelText first, getByText lower, getByTestId last resort; `container.querySelector`
    by class/id is "invisible to the user" and discouraged. **Supports Finding 1**, but is
    concrete enough to phrase as a grep-able check (relevant to Finding 4: needs to be an
    explicit rule, not a restated philosophy, to fire on a non-reasoning backend).

14. **"Mocking"** — Vitest guide — https://vitest.dev/guide/mocking — undated (versioned,
    current) — official doc. Takeaways: `vi.mock()` factories are hoisted above imports (a
    frequent source of confusion); mocks must be cleared/restored between tests or state leaks
    across the suite; mocking a module doesn't affect that module's own internal calls. **New**
    — tool-specific mechanics relevant to this repo's actual test runner.

15. **"Getting Started"** — Testcontainers —
    https://testcontainers.com/getting-started/ — undated (current) — official doc. Takeaway:
    "write tests that depend on the same services you use in production without mocks or
    in-memory services"; disposable, isolated containers avoid cross-test state pollution.
    **Supports Finding 1** for the general principle; the repo-specific tie-in (server's
    `.it.test.ts` files) is left to the repo analyst.

16. **"Are Coding Agents Generating Over-Mocked Tests? An Empirical Study"** — Hora & Robbes,
    MSR 2026 — https://arxiv.org/html/2602.00409v1 — 2026 — paper. Takeaways: across 1.2M commits
    in 2,168 repos, coding agents add mocks in 36% of test commits vs. 26% for humans, and use
    "mock" almost exclusively (95%) vs. humans' broader mock/fake/spy mix; recommend explicit
    "when not to mock" guidance in agent configs. **Extends Finding 1** — the underlying rule is
    "obvious" yet agents still violate it at scale, which justifies keeping an explicit check.

17. **"An Empirical Study of Unit Test Generation with Large Language Models"** — Yang, Yang,
    Gao et al. — arXiv:2406.18181 — 2024-06-26 — paper. Takeaways: 34-62% of LLM-generated tests
    don't compile; GPT-4's line coverage (40%) is roughly half EvoSuite's (79%); of undetected
    defects, 75% trace to missing specific trigger inputs vs. only ~1% to bad assertions.
    **Extends** — nuances principle 1: for defect-catching, input/scenario coverage dominates
    over assertion polish, a non-obvious finding worth its own check.

18. **"Quality Assessment of Python Tests Generated by Large Language Models"** — Alves,
    Bezerra, Machado, Rocha, Virgínio, Silva, EASE 2025 — https://arxiv.org/abs/2506.14297 —
    2025-06-17 — paper. Takeaways: assertion errors are 64% of all identified defects in
    LLM-written tests; "Lack of Cohesion of Test Cases" is the most frequent smell (41%); prompt
    style (Text2Code vs Code2Code) shifts the error/smell mix. **Extends Finding 1** — pinpoints
    assertion *correctness*, not just presence, as the dominant LLM failure mode.

19. **"LLM-as-a-Judge for Scalable Test Coverage Evaluation: Accuracy, Operational Reliability,
    and Cost"** — Huang, Chew, Dutkiewicz, Wang — arXiv:2512.01232 — 2025-12-01 — paper.
    Takeaways: a smaller model (GPT-4o Mini) out-judged larger ones on a 4-dimension weighted
    rubric (scenario completeness, acceptance-criteria alignment, method-specific concerns,
    assertion quality); judge reliability (completion rate) and cost vary independently of
    accuracy, up to 175× in cost. **New** — a methodological lesson for how DevDigest should
    itself design/evaluate a test-quality skill: a structured rubric beats unstructured judgment,
    and reliability must be measured separately from accuracy.

## Universal vs policy

**Universal (a capable model applies unprompted — don't spend skill budget restating):**
assertions must exist and must actually exercise the claimed behavior (not tautological); prefer
testing behavior/public API over private implementation; mocking hierarchy real > fake > stub >
mock, interaction-test only state-changing calls; named smells like Sleepy Test, Mystery Guest,
Sensitive Equality, Assertion Roulette; Testing Library query priority (role/label text over
testId/querySelector); Vitest `vi.mock` hoisting and mock-cleanup mechanics.

**Policy (a threshold or severity this team must choose — worth a line in the skill, since the
model cannot infer it):** what coverage % or "no coverage on this branch" triggers CRITICAL vs
WARNING vs nothing; how many mocked dependencies in one test is "too many"; whether a missing
test for a diff is CRITICAL or WARNING; whether a Sleepy-Test/Mystery-Guest pattern blocks merge
or just warns; scope of any "do not flag" exemption (which other checks it does *not* silence).

**House (left to the repo analyst; not researched here):** DevDigest's actual severity schema
mapping (CRITICAL/WARNING/SUGGESTION) for each of the above; whether mutation testing or
coverage tooling is wired into CI at all; which packages use Testcontainers today and for what.

## Open questions

- Is running Stryker (or any mutation tool) against a PR diff feasible in DevDigest's pipeline,
  or must "mutation mindset" stay a mental checklist the LLM applies by reading code, with no
  tool backing? Changes whether principle 2 becomes a real gate or stays advisory.
- Given Finding 6 ("skill wrapped as untrusted data behaved differently from trusted" —
  unexplained), does trust-framing change severity of test-quality checks specifically, or was
  that confounder scoped to the fixtures already tested? Worth a follow-up probe before final
  skill wording.
- Mechanically-detectable smells (tsDetect: 96%/97% precision/recall) raise the question of
  whether some checks (e.g., no-assertion, sleep-in-test) belong in a deterministic lint/static
  pass rather than the LLM prompt at all — outside this research's scope but worth flagging to
  the orchestrator.
- Yang et al.'s finding that input/scenario coverage — not assertion polish — drives most missed
  defects suggests the skill's highest-leverage question may be "does this test set cover the
  boundary/edge inputs implied by the diff," not "does every test assert." Worth weighing against
  principle 1 when the three researchers' outputs are merged.

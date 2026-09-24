# R2 — What makes LLM code review catch real defects, and how tools inject rules

## Principles (actionable, tied to sources)

1. **Put repo facts and policy in a skill; leave general engineering knowledge out.** Google's
   own production system only pays off once suggestions clear a precision bar tuned against real
   usage, not against what a model "knows" in general (Frömmgen et al., ICSE-SEIP 2024). The
   commercial tools converge on the same split: CodeRabbit's docs tell teams to add a path
   instruction only "when built-in logic consistently misses something," i.e. a repo-specific
   gap, not a restatement of general practice. Directly explains Finding 1: the 59% general-
   knowledge rules in the seeded skills were dead weight by construction; the ~4 repo-fact rules
   are the only ones that could add a catch.

2. **Scope every rule to a path or condition — never write a repo-wide rule.** Every commercial
   reviewer's rule format has a scope field: Greptile's `config.json` rules carry `"scope": [...]`
   glob patterns and per-directory override via `id`; CodeRabbit's `path_instructions` bind to a
   glob; Sourcery review rules apply "only to changed files matching the path patterns"; Graphite
   file-based rules use globs too. None of these tools ship a global "ignore this category
   everywhere" primitive — scope is the unit a rule is written in. This is the direct fix for
   Finding 2: `semver-discipline`'s exemption had no path/condition attached, so it fired outside
   its own domain. A DevDigest skill's "do not flag" clause should carry the same condition the
   rule itself needs (a path, a diff shape), not stand alone as a bare heading.

3. **Attach severity to the rule, not to a role-prompt band.** Greptile's custom-rule schema puts
   `"severity": "high|medium|low"` on the rule object itself. DevDigest's Finding 5 problem —
   CRITICAL decided by the agent's role prompt while every repo rule is WARNING/unrated — is
   exactly the failure mode this schema prevents: severity travels with the fact that earns it,
   so a repo-specific rule can actually block a merge instead of being structurally capped below
   the bar that matters.

4. **Ground every claim to the diff, and don't trust prompt-only grounding on a non-reasoning
   model.** HalluJudge (Tantithamthavorn et al., FSE'26) formalizes "context misalignment" —
   comments that are fluent but not supported by any diff element — and even its best detector
   (Tree-of-Thoughts) tops out at F1 0.85, meaning grounding failures are common and hard to catch
   even with dedicated tooling. "Towards Practical Defect-Focused Automated Code Review" (Lu et
   al., ICML 2025) responds by adding line-number localization and redundant-comment filtering as
   pipeline stages *outside* the base LLM call. This extends Finding 4: a terse rule that only
   fires on reasoning backends is a symptom of leaving grounding to the prompt; the working fix
   elsewhere is a structural check (does this comment cite a line that changed?), not better
   wording.

5. **Repository/design intent is the defect class LLMs miss, and no skill fixes it if the model
   never sees the intent.** In the largest real-world sample (54,713 review comments across 341
   repos, three production agents), the single biggest reason maintainers rejected an AI comment
   was "Intentional Design Decision" — 72% of core-developer rejections (Cynthia, Widyasari, Roy,
   Zhang, Lo, arXiv 2607.21997). The model wasn't wrong about the pattern; it didn't know the team
   had already chosen it on purpose. That is a repo fact, and it is exactly the kind of thing
   worth a skill line — "we do X on purpose because Y" — versus a general rule the model already
   has.

6. **Treat precision as the metric you tune down for, and expect production to be harder than
   offline eval.** Google tuned its model until "50% of suggested edits on our evaluation dataset
   are correct" and still added serving-time filtering on top because wrong suggestions cost more
   trust than they were worth (Frömmgen et al., ICSE-SEIP 2024). Meta's MetaMateCR shows the gap
   between offline and production starkly: 68% exact-match offline for its best model fell to
   19.75% "ActionableToApplied" once reviewers actually judged it (Maddila & Rigby et al., arXiv
   2507.13499). Any skill-size or skill-count experiment should report both a lab metric and a
   "would a human actually act on this" metric — they diverge a lot.

7. **Design who sees an unverified finding, not just what it says.** Meta found that showing AI
   patches to *reviewers* slowed review by over 5%, because reviewers felt obliged to validate
   every patch; collapsing patches for reviewers while showing them to authors removed the
   regression without changing acceptance (arXiv 2507.13499). This is a UX/actionability finding,
   not a rule-content one, but it argues for the same instinct DevDigest needs on severity: an
   unverified or low-confidence finding should be visibly downgraded (collapsed, non-blocking),
   not phrased identically to a grounded one.

8. **A verify/refute pass beats piling more rules into one prompt when precision matters.**
   "Refute-or-Promote" (Agarwal, arXiv 2604.19049 — single-author preprint, treat with caution)
   proposes a second adversarial LLM pass that must refute a candidate defect before it is kept,
   explicitly to cut false positives that a single pass produces. This is a plausible mechanism
   behind Finding 3 ("more skills, fewer catches"): five competing rule-sets crammed into one
   context compete inside a single forward pass, whereas splitting generation and verification
   into separate passes avoids that interference. Worth testing as an alternative to a bigger
   single prompt, not just a smaller one.

## Sources

1. **Resolving Code Review Comments with Machine Learning** — Frömmgen, Austin, Choy, Ghelani,
   Kharatyan, Surita, Khrapko, Lamblin, Manzagol, Revaj, Tabachnyk, Tarlow, Villela, Zheng,
   Chandra, Maniatis (Google). research.google/blog/resolving-code-review-comments-with-ml/ and
   research.google/pubs/resolving-code-review-comments-with-machine-learning/. 2024, ICSE-SEIP
   2024. Type: paper + engineering blog (primary, read directly).
   Takeaways: tuned to 50% precision on eval data and added serving-time heuristics on top because
   wrong suggestions "reduce the developers' trust"; preview rate roughly doubled (20%→40%) after
   a UX change, not a model change; acceptance was 40–50% in the standalone preview surface but
   over 70% inside the review tool itself, i.e. surface placement changed outcomes as much as
   model quality. Supports Findings 1 and extends the precision/trust framing behind 5 and 6.

2. **AI-Assisted Fixes to Code Review Comments at Scale (MetaMateCR)** — Chandra Maddila, Peter C.
   Rigby, et al. (Meta Platforms). arxiv.org/html/2507.13499v1. 2025 (arXiv preprint), industry
   paper. Type: engineering paper (primary, read directly).
   Takeaways: best model reached 68% exact-match offline but only 19.75%
   "ActionableToApplied" in production — offline metrics overstate usefulness; showing unverified
   AI patches to reviewers (not authors) slowed review >5% because reviewers felt obliged to
   validate them, fixed by collapsing patches for reviewers only. Supports Findings 1, 5, 6; new
   angle on UX/trust design.

3. **Enhancing Code Quality at Scale with AI-Powered Code Reviews** — Engineering@Microsoft
   (Microsoft), devblogs.microsoft.com/engineering-at-microsoft/enhancing-code-quality-at-scale-
   with-ai-powered-code-reviews/. Undated (2025/2026), engineering blog. Type: engineering blog
   (primary, read directly).
   Takeaways: categorizes each suggestion by impact type (exception handling, null check,
   sensitive data) so severity is legible at a glance; explicitly lets teams add "repository
   specific guidelines" and custom review prompts; reports adoption/speed (90% of PRs, 10–20%
   faster PR completion across 5,000 repos) but discloses no precision/false-positive numbers.
   Supports Finding 5's premise (severity should be visible per-finding) but is not verified on
   precision claims — the post omits them.

4. **"Go Home Copilot, You're Drunk": Understanding Developer Responses to Agent-Generated Code
   Review Comments** — Shamse Tasnim Cynthia, Ratnadira Widyasari, Banani Roy, Ting Zhang, David
   Lo. arxiv.org/html/2607.21997v1. 2026 (arXiv preprint). Type: academic paper (primary, read
   directly).
   Takeaways: across 54,713 comments from Copilot/Cursor/Codex on 341 repos, resolution ranged
   65% overall (Copilot 72.9%, Cursor 67.2%, Codex 54.8%); comments with an inline code suggestion
   resolved far more often (75.5% vs 64.6%, OR 1.62); the top rejection reason among core
   developers was "Intentional Design Decision" (72%) — the agent was right about the pattern but
   wrong about the team's intent. Supports Finding 1 (repo facts matter) and is the strongest
   single evidence for "which defect classes LLMs miss without project knowledge."

5. **CodeReviewer: Pre-Training for Automating Code Review Activities** — Zhiyu Li et al.
   (Microsoft Research Asia / LinkedIn). arxiv.org/abs/2203.09095, ESEC/FSE 2022. Type: academic
   paper (primary, abstract/summary read; full PDF not fully read — partially verified).
   Takeaways: established the three-task framing (needs-review classification, comment
   generation, code refinement) and the multilingual PR dataset most later work benchmarks
   against; predates instruction-following LLMs, so it is background/context rather than direct
   evidence for any of Findings 1–6 (new / background).

6. **Path-based review instructions** — CodeRabbit, docs.coderabbit.ai/configuration/path-
   instructions. Undated. Type: official tool docs (primary, read directly).
   Takeaways: format is a glob `path` plus free-text `instructions`; explicit warning that path
   instructions "do not disable other features that inspect the same code" — a scoped rule is a
   supplement, not an override; recommends adding an instruction only after observing a
   consistent gap, not preemptively. Supports Findings 1 and 2.

7. **Context Engineering: Level up your AI Code Reviews** — CodeRabbit engineering blog,
   coderabbit.ai/blog/context-engineering-ai-code-reviews. Undated. Type: engineering blog
   (primary, read directly).
   Takeaways: keeps "a 1:1 ratio of code-to-context" in prompts deliberately, i.e. caps context
   volume rather than maximizing it; runs suggestions through verification scripts before showing
   them, to keep signal-to-noise high; layers path filters, path instructions, and "chat
   learnings" (feedback-derived adjustments) as separate mechanisms rather than one big rule file.
   Supports Finding 3 (volume degrades quality) from the vendor side.

8. **Custom Rules** and **Custom Standards & Rules** — Greptile, greptile.com/docs/how-greptile-
   works/custom-rules and greptile.com/docs/code-review/custom-standards. Undated. Type: official
   tool docs (primary, read directly).
   Takeaways: rule schema is `{id, rule, scope, severity}` in `config.json`, or free-form prose in
   `rules.md` scoped to its own directory; child directories override a parent rule by matching
   `id`, giving one documented mechanism for "this exemption applies here, not everywhere";
   dashboard-configured and repo-file-configured rules "both still apply" (additive, not one
   replacing the other) — an explicit non-suppression design choice. Also separately documents
   "learned rules" inferred from team comments/reactions on past PRs (a feedback loop). Supports
   Findings 2 and 3 directly; the clearest schema-level answer to "how do tools keep one rule from
   suppressing another" (scope + explicit additive combination, never a bare global override).

9. **Best Practices** (best_practices.md), **Additional Configurations** (extra_instructions), and
   **auto_best_practices** — Qodo / PR-Agent, docs.qodo.ai/qodo-documentation/code-review/qodo-
   merge/features/best-practices, qodo-merge-docs.qodo.ai/usage-guide/additional_configurations/,
   github.com/qodo-ai/pr-agent/wiki/.pr_agent_auto_best_practices. Undated / open-source repo.
   Type: official tool docs (primary, read directly).
   Takeaways: caps `best_practices.md` at "under 800 lines... AI models may not process
   effectively very long documents"; combines global/group/repo-local best-practice files
   additively with local always applied last, rather than one overriding another; ships a
   monthly job that mines *accepted* suggestions into a learned best-practices file, labeling
   matches "Learned best practice" so the source of a rule stays visible. Supports Findings 1
   (size hurts), 2/3 (additive combination, not override).

10. **Write review rules** — Sourcery, docs.sourcery.ai/reviews/review-rules/. Undated. Type:
    official tool docs (primary, read directly).
    Takeaways: a rule is path-glob + up to 3,000 characters of plain-language "what to flag and
    what you want to see instead"; explicit statement that "rules add to existing checks; they
    don't replace standard review findings" (additive, non-suppressing by design); a rule "only
    looks at the lines the pull request changes" — scope is enforced at the diff level, not just
    the file level. Supports Findings 2 and 4 (line-level scoping).

11. **AI Reviews / Customization** — Graphite (Diamond), graphite.com/docs/ai-review-customization
    and graphite.dev/guides/customizing-ai-code-review-tools. Undated. Type: official tool docs
    (primary, read directly).
    Takeaways: recommends rules as "Rule → Bad example → Good example → Reasoning," one concern
    per rule; separates "custom rules" (what to flag) from "comment exclusions" (what never to
    flag) as two distinct mechanisms rather than one rule type doing both; warns generically that
    "too many files can reduce review quality" for file-based context but documents no rule-
    conflict handling. Supports Finding 2 (rule/exemption as separate typed objects); silent on
    Finding 3's cross-rule interference, which is itself informative — vendors don't yet document
    this failure mode.

12. **HalluJudge: A Reference-Free Hallucination Detection for Context Misalignment in Code
    Review Automation** — Kla Tantithamthavorn, Hong Yi Lin, Patanamon Thongtanunam, Wachiraphan
    Charoenwet, Minwoo Jeong, Ming Wu. arxiv.org/html/2601.19072v3, FSE'26 (2026). Type: academic
    paper (primary, read directly).
    Takeaways: defines "context misalignment" — a comment that is fluent and plausible but not
    supported by any element of the actual diff; every claim in a review must be traceable to a
    diff element or the review counts as hallucinated; best detector (Tree-of-Thoughts prompting)
    reaches only F1 0.85, at higher cost than direct zero-shot judging. Supports/extends Finding 4
    — grounding is a real, only-partially-solved problem, not something terse prompt wording
    fixes.

13. **Towards Practical Defect-Focused Automated Code Review** — Junyi Lu, Lili Jiang, Xiaojia Li,
    Jianbing Fang, Fengjun Zhang, Li Yang, Chun Zuo. arxiv.org/pdf/2505.17928, ICML 2025. Type:
    academic paper (primary, PDF opened; summarized from extracted text, not line-by-line).
    Takeaways: adds code-slicing for repo context, multi-role LLM review, redundant-comment
    filtering, and explicit line-number localization as pipeline stages around the LLM call, not
    prompt instructions; reports large precision gains (2x over plain LLM prompting, 10x over
    prior baselines) on industrial C++ code by doing so. Extends Finding 4 (grounding needs
    machinery) and Finding 3 (filtering redundant/competing outputs is itself a design problem,
    solved outside the prompt).

14. **Refute-or-Promote: An Adversarial Stage-Gated Multi-Agent Review Methodology for
    High-Precision LLM-Assisted Defect Discovery** — Abhinav Agarwal. arxiv.org/pdf/2604.19049,
    2026. Type: single-author arXiv preprint, not peer-reviewed — **lower confidence, treat as a
    hypothesis, not settled**.
    Takeaways: proposes a second LLM pass whose only job is to refute a first pass's candidate
    defects before any are kept, explicitly to cut false positives versus one-shot generation.
    New / plausible mechanism behind Finding 3, unverified at production scale.

15. **An Empirical Study of Security Calibration in Large Language Models for Code** — Mohammed
    Latif Siddiq, Md. Nafiu Rahman, Joanna C. S. Santos. arxiv.org/html/2606.31159v1, 2026. Type:
    academic paper (primary, read directly). Note: this is about *code generation*, not code
    review — included because it names the metric DevDigest's severity problem needs.
    Takeaways: argues accuracy without calibration hides "False Trust" — high-confidence, wrong
    output; proposes ECE, Brier score, and a False-Trust-rate (confidence ≥0.8 but wrong) as the
    metrics to report. Extends Finding 5: severity/confidence needs its own calibration metric,
    not just a location in the prompt.

16. **Are LLMs reliable code reviewers? Systematic overcorrection in requirement conformance
    judgement** — Automated Software Engineering (Springer), 10.1007/s10515-026-00638-5. Type:
    academic paper. **Not verified — paywalled, only the search-result abstract snippet was seen,
    full text was not opened.** Reported (unverified) finding: LLM reviewers systematically
    over-flag correct code as violating a stated requirement, i.e. an overcorrection bias
    distinct from ordinary false positives. If accurate, extends Finding 5 (severity/precision
    miscalibration) but should be re-verified against the actual paper before citing further.

## Open questions

- No vendor doc (CodeRabbit, Greptile, Sourcery, Graphite, Qodo) discusses what happens when two
  *scoped* rules with overlapping paths genuinely conflict (e.g., both fire on the same line with
  opposite advice) — only Greptile's parent/child override-by-`id` addresses same-rule conflict,
  not cross-rule conflict. This is squarely DevDigest's Finding 2 territory and none of the
  reviewed docs solve it.
- I found no primary source that isolates prompt *length/volume alone* (independent of rule
  competition) as a cause of degraded catches — Finding 3's "size-matched neutral prose also
  degrades" result may be genuinely novel; CodeRabbit's "1:1 code-to-context ratio" is the closest
  vendor acknowledgment, but it's a design heuristic, not a measured result.
- Nothing found on "skill rendered as untrusted data vs. trusted" changing model behavior
  (Finding 6's last point) — likely needs a dedicated search on prompt-injection/data-vs-
  instruction framing literature that I did not have budget for.

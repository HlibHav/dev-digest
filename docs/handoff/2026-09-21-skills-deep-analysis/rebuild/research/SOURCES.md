# Research Sources: Consolidated Bibliography

## 1. Skill and prompt authoring

- **Skill authoring best practices** — Anthropic, undated (current docs). Type: official doc. https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices. Assume the model already knows general facts; only pay for what it doesn't. Build evaluations first, verify gaps against baseline before writing rules. [R1]

- **Introducing Agent Skills** — Anthropic (Claude), undated (2025 launch post). Type: engineering/product blog. https://claude.com/blog/skills. Skills exist to avoid monolithic system prompts that consume tokens regardless of relevance; progressive disclosure by description is the design bet DevDigest's flat architecture can't use. [R1]

- **skill-creator SKILL.md** — local tool docs, undated. Type: tool documentation (local file). /Users/Glebazzz/.claude/skills/synced/6c1f793a-cc4b-41ef-9655-fc8556486402_2ee7a444-c415-4231-b1a6-a6fa3ed70c30/skill-creator/SKILL.md. Explain why things matter instead of heavy-handed MUSTs; keep prompts lean and run evaluation-driven iteration with both baseline and with-skill runs in the same turn. [R1]

- **skill-creator agents/grader.md** — local tool docs, undated. Type: tool documentation (local file). /Users/Glebazzz/.claude/skills/synced/6c1f793a-cc4b-41ef-9655-fc8556486402_2ee7a444-c415-4231-b1a6-a6fa3ed70c30/skill-creator/agents/grader.md. A passing grade on weak assertions creates false confidence; hunt for assertions that would pass for clearly wrong outputs. [R1]

- **skill-creator agents/comparator.md** — local tool docs, undated. Type: tool documentation (local file). /Users/Glebazzz/.claude/skills/synced/6c1f793a-cc4b-41ef-9655-fc8556486402_2ee7a444-c415-4231-b1a6-a6fa3ed70c30/skill-creator/agents/comparator.md. Use blind A/B comparison and build task-specific rubrics with named criteria (correctness, completeness, organization, formatting, usability) rather than one holistic score. [R1]

- **skill-creator references/schemas.md** — local tool docs, undated. Type: tool documentation (local file). /Users/Glebazzz/.claude/skills/synced/6c1f793a-cc4b-41ef-9655-fc8556486402_2ee7a444-c415-4231-b1a6-a6fa3ed70c30/skill-creator/references/schemas.md. Variance across runs is a first-class field in benchmark results; track mean±stddev per configuration. [R1]

- **Demystifying evals for AI agents** — Anthropic, undated (2025/2026). Type: engineering blog. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents. Grade what the agent produced, not its path; use clear structured rubrics and isolated LLM judges rather than one grading all dimensions; pass@k and pass^k diverge sharply. [R1]

- **First steps: develop test cases** — Anthropic, undated. Type: official documentation. https://platform.claude.com/docs/en/docs/build-with-claude/develop-tests. Success criteria should be SMART (Specific, Measurable, Achievable, Relevant); grade with a different model than the one generating output; always include edge cases (irrelevant/nonexistent input, overly long input, ambiguity). [R1]

- **Evaluation best practices** — OpenAI, undated. Type: official documentation. https://developers.openai.com/api/docs/guides/evaluation-best-practices. Define eval objective before building; mix production data with expert-authored edge and adversarial cases; use pairwise comparison or pass/fail for more reliability over free-form scoring. [R1]

- **The Instruction Hierarchy: Training LLMs to Prioritize Privileged Instructions** — Wallace, Xiao, Leike, Weng, Heidecke, Beutel (OpenAI), April 2024. Type: academic paper. https://arxiv.org/abs/2404.13208. Untrained models treat system and user text as equal priority by default; priority must be explicitly taught, not inferred; the fix generalizes to unseen conflict types when hierarchy signal is present during training. [R1]

- **Lost in the Middle: How Language Models Use Long Contexts** — Liu, Lin, Hewitt, Paranjape, Bevilacqua, Petroni, Liang, 2024. Type: academic paper (TACL 2024, vol. 12). https://arxiv.org/abs/2307.03172. Performance is highest when relevant information occurs at beginning or end of context and degrades significantly in the middle; effect holds even for models built for long context and implies position, not just presence, determines use. [R1]

- **Multi-IF: Benchmarking LLMs on Multi-Turn and Multilingual Instructions Following** — He, Jin, Wang, Bi, Mandyam, et al. (Meta), October 2024. Type: academic paper. https://arxiv.org/abs/2410.15553. Accuracy drops as constraints accumulate across turns (o1-preview: 0.877 → 0.707 from turn 1 to turn 3); effect holds across all tested models and compounds with additional complexity. [R1]

- **FollowBench: A Multi-level Fine-grained Constraints Following Benchmark for LLMs** — Jiang, Wang, Zeng, Zhong, Li, Mi, Shang, Jiang, Liu, Wang, ACL 2024. Type: academic paper. https://github.com/YJiangcm/FollowBench. Benchmark incrementally adds one constraint at a time to isolate effect of constraint count; introduces Consistent Satisfaction Levels metric. [R1], caution: project page read, not full paper PDF — partially verified

- **Instruction-Following Evaluation for Large Language Models (IFEval)** — Zhou, Lu, Mishra, Brahma, Basu, Luan, Zhou, Hou (Google), November 2023. Type: academic paper. https://arxiv.org/abs/2311.07911. Defines verifiable instructions as objective checkable constraints (e.g., "more than 400 words," "mention AI ≥3 times"); this is the direct template for how severity/pass criteria should be phrased as explicit thresholds rather than vague standards. [R1]

- **Semantic Gravity Wells: Why Negative Constraints Backfire** — Shailesh Rana, January 2026. Type: academic paper. https://arxiv.org/abs/2601.08070. Claims naming a forbidden word primes the model to produce it via semantic pressure, with the very act raising intrinsic probability; proposes this as dominant failure mode of negative constraints. [R1], caution: single author, very recent preprint — treat as plausible mechanism hypothesis, not established fact

- **Negation: A Pink Elephant in the Large Language Models' Room?** — Vrabcová, Kadlčík, Sojka, Štefánik, Spiegel, March 2025. Type: academic paper. https://arxiv.org/abs/2503.22395. Negation is persistent weak spot in LLM textual-entailment performance across model families; effect is language-dependent, worse for non-projective languages. [R1]

- **Beyond Accuracy: Behavioral Testing of NLP Models with CheckList** — Ribeiro, Wu, Guestrin, Singh, ACL 2020 (Best Paper). Type: academic paper. https://arxiv.org/abs/2005.04118. Aggregate accuracy hides specific correctable failures; checklist of specific named test types finds teams ~2x more tests and ~3x more bugs than ad hoc testing; settling on one holistic score is insufficient. [R1]

- **Judging LLM-as-a-Judge: Concerning Rubric Artifacts in LLM-based Automated Text Generation Evaluation** — Bagaria, Sundaram, Krishnan, Ravindran, August 2026. Type: academic paper. https://arxiv.org/abs/2609.02942. Rubric wording itself encodes recoverable evaluative signal independent of model outputs; judges often fail to reliably update decisions when criteria are reversed, a reliability warning for any severity/rubric design for LLM-judge grading. [R1]

## 2. LLM code review in practice and research

- **Resolving Code Review Comments with Machine Learning** — Frömmgen, Austin, Choy, Ghelani, Kharatyan, Surita, Khrapko, Lamblin, Manzagol, Revaj, Tabachnyk, Tarlow, Villela, Zheng, Chandra, Maniatis (Google), 2024, ICSE-SEIP 2024. Type: paper + engineering blog. https://research.google/blog/resolving-code-review-comments-with-ml/ and https://research.google/pubs/resolving-code-review-comments-with-machine-learning/. Tuned to 50% precision on eval data; added serving-time heuristics because wrong suggestions reduce developer trust; surface placement changed outcomes as much as model quality did. [R2]

- **AI-Assisted Fixes to Code Review Comments at Scale (MetaMateCR)** — Chandra Maddila, Peter C. Rigby, et al. (Meta Platforms), 2025 (arXiv preprint). Type: industry paper. https://arxiv.org/html/2507.13499v1. Best model reached 68% exact-match offline but only 19.75% actionable-in-production; offline metrics overstate usefulness; showing unverified patches to reviewers (not authors) slowed review >5% because reviewers felt obliged to validate them. [R2]

- **Enhancing Code Quality at Scale with AI-Powered Code Reviews** — Engineering@Microsoft (Microsoft), undated (2025/2026). Type: engineering blog. https://devblogs.microsoft.com/engineering-at-microsoft/enhancing-code-quality-at-scale-with-ai-powered-code-reviews/. Categorize each suggestion by impact type so severity is legible at a glance; explicitly let teams add repository-specific guidelines and custom review prompts; reports adoption across 5,000 repos but discloses no precision numbers. [R2]

- **"Go Home Copilot, You're Drunk": Understanding Developer Responses to Agent-Generated Code Review Comments** — Shamse Tasnim Cynthia, Ratnadira Widyasari, Banani Roy, Ting Zhang, David Lo, 2026 (arXiv preprint). Type: academic paper. https://arxiv.org/html/2607.21997v1. Across 54,713 comments on 341 repos, top rejection reason among core developers was "Intentional Design Decision" (72%); the agent was right about the pattern but didn't know the team chose it on purpose — repo facts matter. [R2]

- **CodeReviewer: Pre-Training for Automating Code Review Activities** — Zhiyu Li et al. (Microsoft Research Asia / LinkedIn), ESEC/FSE 2022. Type: academic paper. https://arxiv.org/abs/2203.09095. Established three-task framing (needs-review classification, comment generation, code refinement) and the multilingual PR dataset most later work benchmarks against. [R2], caution: abstract/summary read, full PDF not fully read — partially verified

- **Path-based review instructions** — CodeRabbit, undated. Type: official tool documentation. https://docs.coderabbit.ai/configuration/path-instructions. Format is glob path plus free text; explicit warning that path instructions supplement, not override, other features; add an instruction only after observing consistent gap, not preemptively. [R2]

- **Context Engineering: Level up your AI Code Reviews** — CodeRabbit engineering blog, undated. Type: engineering blog. https://coderabbit.ai/blog/context-engineering-ai-code-reviews. Keeps 1:1 code-to-context ratio deliberately; runs suggestions through verification scripts before showing them; layers path filters, path instructions, and chat learnings (feedback-derived adjustments) as separate mechanisms rather than one big rule file. [R2]

- **Custom Rules and Custom Standards & Rules** — Greptile, undated. Type: official tool documentation. https://greptile.com/docs/how-greptile-works/custom-rules and https://greptile.com/docs/code-review/custom-standards. Rule schema is {id, rule, scope, severity}; child directories override parent rule by matching id; dashboard-configured and repo-file-configured rules both still apply (additive, not override) — documented mechanism for keeping one rule from suppressing another. [R2]

- **Best Practices, Additional Configurations, and auto_best_practices** — Qodo / PR-Agent, undated / open-source repository. Type: official tool documentation. https://docs.qodo.ai/qodo-documentation/code-review/qodo-merge/features/best-practices, https://qodo-merge-docs.qodo.ai/usage-guide/additional_configurations/, https://github.com/qodo-ai/pr-agent/wiki/.pr_agent_auto_best_practices. Caps best_practices.md at under 800 lines as effective upper bound; combines global/group/repo-local files additively with local applied last; ships monthly job mining accepted suggestions into learned best-practices file. [R2]

- **Write review rules** — Sourcery, undated. Type: official tool documentation. https://docs.sourcery.ai/reviews/review-rules/. Rule is path-glob plus up to 3,000 characters of plain-language prose; explicit statement that rules add to existing checks and don't replace standard findings; scope enforced at diff level, not just file level. [R2]

- **AI Reviews / Customization** — Graphite (Diamond), undated. Type: official tool documentation. https://graphite.dev/guides/customizing-ai-code-review-tools. Recommends rules as Rule → Bad example → Good example → Reasoning; separates custom rules (what to flag) from comment exclusions (what never to flag) as two distinct mechanisms rather than one rule type doing both. [R2]

- **HalluJudge: A Reference-Free Hallucination Detection for Context Misalignment in Code Review Automation** — Kla Tantithamthavorn, Hong Yi Lin, Patanamon Thongtanunam, Wachiraphan Charoenwet, Minwoo Jeong, Ming Wu, FSE'26 (2026). Type: academic paper. https://arxiv.org/html/2601.19072v3. Defines context misalignment (comment fluent but unsupported by diff); every claim must trace to actual diff element or counts as hallucinated; best detector reaches F1 0.85, meaning grounding is real, partially-solved problem. [R2]

- **Towards Practical Defect-Focused Automated Code Review** — Junyi Lu, Lili Jiang, Xiaojia Li, Jianbing Fang, Fengjun Zhang, Li Yang, Chun Zuo, ICML 2025. Type: academic paper. https://arxiv.org/pdf/2505.17928. Adds code-slicing for repo context, multi-role LLM review, redundant-comment filtering, explicit line-number localization as pipeline stages around LLM call, not prompt instructions; reports 2x precision over plain prompting. [R2]

- **Refute-or-Promote: An Adversarial Stage-Gated Multi-Agent Review Methodology for High-Precision LLM-Assisted Defect Discovery** — Abhinav Agarwal, 2026. Type: arXiv preprint. https://arxiv.org/pdf/2604.19049. Second LLM pass must refute first pass's candidate defects before any are kept, explicitly to cut false positives versus one-shot generation. [R2], caution: single-author preprint, not peer-reviewed — lower confidence, treat as hypothesis not settled

- **An Empirical Study of Security Calibration in Large Language Models for Code** — Mohammed Latif Siddiq, Md. Nafiu Rahman, Joanna C. S. Santos, 2026. Type: academic paper. https://arxiv.org/html/2606.31159v1. Accuracy without calibration hides False Trust (high-confidence wrong output); proposes ECE, Brier score, and False-Trust-rate (confidence ≥0.8 but wrong) as metrics to report instead. [R2]

- **Are LLMs reliable code reviewers? Systematic overcorrection in requirement conformance judgement** — Automated Software Engineering (Springer). Type: academic paper. https://doi.org/10.1007/s10515-026-00638-5. LLM reviewers systematically over-flag correct code as violating stated requirements. [R2], caution: paywalled, only search-result abstract seen, full text not opened — not verified

## 3. API compatibility standards and tools

- **AIP-180: Backwards Compatibility** — Google / aip.dev, undated (living document). Type: official standard. https://google.aip.dev/180. New fields/enum values may be added without breaking unaware clients; new required fields on existing messages are forbidden; removal/rename prohibited in-version; resource names must never change even across major versions. [R3]

- **AIP-181: Stability Levels** — Google / aip.dev, undated. Type: official standard. https://google.aip.dev/181. Alpha/beta/stable each carry different compatibility guarantees and required notice periods; stable forbids breaking changes except with governance-level exception treated with equal or greater gravity as creating new major version. [R3]

- **AIP-185: API Versioning** — Google / aip.dev, undated. Type: official standard. https://google.aip.dev/185. Expose only major versions (no minor/patch in API surface); new major version must not depend on previous one; channel-based (alpha/beta/stable) versioning preferred over parallel version numbers; beta needs 180 days' notice before removal. [R3]

- **Microsoft Azure REST API Guidelines (vNext)** — Microsoft / Azure organization, undated (vNext, actively maintained). Type: official guidelines. https://raw.githubusercontent.com/microsoft/api-guidelines/vNext/azure/Guidelines.md. Breaking changes include new required fields past v1, removed enum values, required→optional flips; versioning is required query parameter api-version (YYYY-MM-DD[-preview]) not URL path segment; deprecation needs Breaking-Change-Review-Board-approved azure-deprecating header. [R3]

- **Zalando RESTful API Guidelines — Compatibility** — Zalando SE, undated, actively maintained. Type: organization guidelines. https://github.com/zalando/restful-api-guidelines/blob/main/chapters/compatibility.adoc. Input-only schemas may extend enums; output schemas must never extend enum ranges without client opt-in; Rule 108: clients must tolerate unknown fields and extensible enums. [R3]

- **Zalando RESTful API Guidelines — Deprecation** — Zalando SE, undated. Type: organization guidelines. https://github.com/zalando/restful-api-guidelines/blob/main/chapters/deprecation.adoc. Deprecation must be part of OpenAPI spec (deprecated: true plus description of alternative); producers must get all clients' consent on sunset date before shutdown; both Deprecation and Sunset headers used with earliest-affected-element date. [R3]

- **RFC 8594 — The Sunset HTTP Header Field** — Erik Wilde / IETF, May 2019. Type: informational RFC. https://www.rfc-editor.org/rfc/rfc8594.html. Single HTTP-date value signaling resource will become unresponsive; explicitly a hint, not guarantee; appropriate only when resource genuinely stops working stage, not earlier "preferred but still works" stage. [R3]

- **RFC 9745 — The Deprecation HTTP Response Header Field** — IETF HTTPAPI working group, March 2025. Type: standards-track RFC. https://www.rfc-editor.org/rfc/rfc9745.html. Value is Structured-Fields Date (e.g., @1688169599); timestamp must not be later than paired Sunset header; also defines deprecation link relation for pointing at migration docs. [R3]

- **oasdiff — OpenAPI Breaking Changes: The Complete List of Rules** — Tufin/oasdiff project, undated (actively released tool). Type: tool documentation (open source). https://www.oasdiff.com/docs/breaking-changes. Severity per check is overridable per-org via severity-levels file; readOnly/writeOnly properties provably safe because they can never appear on other side of wire; enum additions breaking by default unless x-extensible-enum used. [R3]

- **Buf — Breaking Change Rules and Categories** — Buf Technologies, undated. Type: tool documentation (protobuf/gRPC). https://buf.build/docs/breaking/rules/. Four strictness tiers (FILE > PACKAGE > WIRE_JSON > WIRE) trade source-compat for wire-compat, chosen once per repo; renaming field breaks FILE/PACKAGE/WIRE_JSON but not WIRE; changing field type breaks every tier. [R3]

- **Stripe — APIs as infrastructure: future-proofing Stripe with versioning** — Stripe (company engineering blog), undated (present on Stripe's current blog). Type: engineering blog. https://stripe.com/blog/api-versioning. Every account pinned to API version at signup and stays there until explicit upgrade; breaking = removes or alters existing fields; versions are dated rolling releases, not big-bang majors; safety engineered structurally (account pinning) rather than caught at review time. [R3]

- **GitHub REST API — Breaking Changes** — GitHub, undated (current documentation). Type: official documentation. https://docs.github.com/en/rest/about-the-rest-api/breaking-changes. Breaking includes removing/renaming operation/parameter/response field, new required parameter, optional→required, type changes, removed enum values, new validation rules, changed auth requirements; non-breaking explicitly includes adding enum values and adding response fields. [R3]

- **GitHub REST API — API Versions** — GitHub, undated (current documentation). Type: official documentation. https://docs.github.com/en/rest/about-the-rest-api/api-versions. Date-based version string via required X-GitHub-Api-Version header (default 2022-11-28 if omitted); ≥24 months support after newer version ships; Deprecation (RFC 7231 date) and Sunset (RFC 8594) headers appear during closing-down window; expired versions return 410 Gone. [R3]

- **Semantic Versioning 2.0.0** — Tom Preston-Werner et al. / semver.org, 2013. Type: community-maintained standard. https://semver.org/. MAJOR = incompatible API changes, MINOR = backward-compatible additions, PATCH = backward-compatible fixes; compatibility defined by contrast (does dependent code still work unchanged) rather than exhaustive rules; direct ancestor of DevDigest's own SEMVER_DISCIPLINE skill. [R3]

---

Checked: 44 URLs resolved (HTTP 200) on 2026-09-21; none.

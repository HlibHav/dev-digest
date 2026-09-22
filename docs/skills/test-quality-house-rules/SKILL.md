---
name: test-quality-house-rules
description: A test-quality rule specific to this repo that a diff does not reveal — tests of code that picks its model through the shared registry must mock every provider id.
type: convention
version: 1.1.0
---

# Test quality house rules

Review the tests exactly as you would with no skills attached. Everything you would report
then is still a finding. This skill adds a fact about this repository that a diff alone does
not show. Grade every finding, this one included, by the severity levels in your
instructions. Report the rule only when its flag condition holds; a test that satisfies it is
not a finding. It narrows or cancels nothing else you report. Cite the added line in the diff
(a `+` line) that breaks the rule.

## 1. A test of code that resolves its model through the registry mocks every provider

Some features pick their LLM provider at run time: `resolveFeatureModel`
(`server/src/modules/settings/feature-models.ts:51`) returns the workspace override or else a
registry default, and the conventions scan uses it (`server/src/modules/conventions/routes.ts:23`).
A test that builds the app with `overrides.llm` and registers its `MockLLMProvider` only under
today's default provider id passes now. When the default moves, the call goes past the mock
into a real, paid API, and the test asserts against whatever the live model says. This
happened once already (commit `f5323f7`, `server/INSIGHTS.md:26`).

- Flag: a test of a code path that resolves its model through `resolveFeatureModel` or a
  feature-model default, whose `overrides.llm` registers the mock under fewer than all three
  provider ids (`openai`, `anthropic`, `openrouter`).
- A test that creates its own agent with an explicit provider does not go through the
  registry, and may register only that provider.
- How the repo does it, `server/test/conventions.it.test.ts:85-90`:

```ts
// Registered under EVERY provider id, not just the one the feature
// defaults to today.
llm: Object.fromEntries(
  (['openai', 'anthropic', 'openrouter'] as const).map((id) => [
    id,
    new MockLLMProvider('openai', { structuredBySchema: { [EXTRACTION_SCHEMA_NAME]: extraction(rules) } }),
  ]),
),
```

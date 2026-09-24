Adds an integration test for the conventions extractor's model resolution: when a workspace hasn't picked a model, the scan should use the registry's current default rather than erroring.

Follows the existing `conventions.it.test.ts` pattern (real Postgres via testcontainers, `MockGitClient`/`MockGitHubClient`/`MockLLMProvider`, one seeded repo). No production code changes — test-only.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

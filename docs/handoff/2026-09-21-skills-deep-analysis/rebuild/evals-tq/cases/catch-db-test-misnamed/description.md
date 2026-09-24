Adds a test for the per-repo run cost total (`SUM(cost_usd) GROUP BY pr_id` on the PR list) — inserts two completed runs for the same PR and checks the sum.

Uses the existing Postgres test fixture; no production code changes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

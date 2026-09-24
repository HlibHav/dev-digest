Adds a `retry_count` column to `agent_runs` (nullable, for a future auto-retry feature) and a test that the column round-trips through a real insert/select.

Migration is a straightforward additive nullable column.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

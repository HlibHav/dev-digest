The nightly sweep should never delete a run that blocked a merge, whatever its age. Adds the `keepBlocking` guard to `shouldSweep` plus tests for both sides of the new branch (kept when blocking+flag on, swept when the flag is off) alongside the two pre-existing cases.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

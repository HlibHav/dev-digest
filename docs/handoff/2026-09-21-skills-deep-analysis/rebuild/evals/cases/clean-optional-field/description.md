Add optional `tags` to findings

Some reviewers want a lightweight way to label a finding ("flaky", "needs-repro",
"followup") without adding a whole new taxonomy or a migration. This adds an
optional `tags: string[]` field to the `Finding` contract (max 5 short strings),
mirrored in both the server and client copies of the shared contract as usual.

Nothing existing changes shape: `tags` is `nullish()`, so every finding already in
the DB and every agent that doesn't set it keeps working exactly as before. The
findings panel renders the tags as small chips next to the existing category tag
when a finding happens to have any; when it doesn't, the card looks identical to
today.
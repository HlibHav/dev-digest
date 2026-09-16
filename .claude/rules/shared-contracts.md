---
paths:
  - "server/src/vendor/shared/**"
  - "client/src/vendor/shared/**"
---

# Shared contracts (@devdigest/shared)

- Canonical copy: `server/src/vendor/shared`. `reviewer-core` compiles against
  it via a path alias.
- `client/src/vendor/shared` is a hand copy with no sync script, and it
  already differs in several files. Edit the server copy first, mirror to the
  client in the same change, then check
  `diff -rq server/src/vendor/shared client/src/vendor/shared`.
- `Review` and `Finding` (`contracts/findings.ts`) double as the LLM
  structured-output schema, sent with `strict: true`:
  - optional fields must be `.nullish()` or `.nullable()` — `.optional()`
    silently becomes a required property (only a console warning, not an error);
  - `.describe()` text is read by the model — editing it changes what reviews say;
  - enum values are stored in plain text DB columns and rendered by the
    client, so renaming one needs a data migration and a UI change too.
- Verify with the typecheck of `reviewer-core`, `server`, and `client`.

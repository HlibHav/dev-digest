---
name: api-contract-house-rules
description: Three contract rules specific to this repo that a diff does not reveal — strict LLM-output schemas, the hand-mirrored shared contracts, and client errors surfaced as ApiError.
type: convention
version: 1.1.0
---

# API contract house rules

Review the contract exactly as you would with no skills attached: any change that breaks or
surprises an existing caller is still a finding, whether or not a rule below names it. This
skill adds three facts about this repository that a diff alone does not show. Each rule adds a
finding when its condition holds, and none of them narrows or cancels anything else you
report. Cite the added line in the diff (a `+` line) that breaks the rule.

## 1. Fields in `Review` and `Finding` use `.nullish()`, not `.optional()`

`Review` and `Finding` in `contracts/findings.ts` are also the JSON schema the reviewer model
fills in, sent with `strict: true`. Strict mode lists every property as required, so a field
marked `.optional()` is not optional to the model: it has to produce a value on every finding
and will invent one. `.nullish()` lets it answer `null`. The only symptom is a console warning
(`.claude/rules/shared-contracts.md:15-18`).

- Flag: a field added to or changed in `Review` or `Finding`, in either copy of
  `contracts/findings.ts`, that uses `.optional()`.
- Severity: warning.
- How the repo does it, `server/src/vendor/shared/contracts/findings.ts:56`:

```ts
suggestion: z.string().nullish(), // markdown
```

## 2. A shared contract changes in both copies in the same diff

`server/src/vendor/shared/` is canonical. `client/src/vendor/shared/` is a hand copy with no
sync script (`.claude/rules/shared-contracts.md:9-14`, `client/AGENTS.md:24-25`). A change to
one copy compiles and looks complete on its own, and the client silently drifts from what the
server sends and accepts. This holds even for a change that is safe for callers, such as a
new optional field.

- Check: list the files this diff changes under `server/src/vendor/shared/`, then the files it
  changes under `client/src/vendor/shared/`. Each path in one list should appear in the other
  with the same edit.
- Flag: a path that is changed in one copy and not in the other, or changed differently.
- Severity: warning.
- Only the lines this diff changes count. The two copies already differ in places, and those
  older differences are not this PR's finding.

## 3. Client requests surface errors as `ApiError`

Pages decide what to show from `error instanceof ApiError`: the server's message, the status
and the error `code` (`client/src/app/repos/[repoId]/pulls/page.tsx:111`). `apiFetch` builds
that `ApiError` from the server's `{ error: { code, message, details } }` body
(`client/src/lib/api.ts:44-58`). A request that throws a plain `Error` shows the user a
generic message and loses the status and the code.

- Flag: client code under `client/src/` that calls the engine with `fetch` directly and, on a
  non-2xx response, throws anything other than `ApiError` or returns the error body as data.
- Severity: warning.
- A response that is not JSON, such as a file download, may call `fetch` directly. Its error
  path still throws `ApiError` with the status, and with the code and message read from the
  error body.
- How the repo does it, `client/src/lib/api.ts:44-58`:

```ts
if (!res.ok) {
  // … read code, message and details from body.error when the body is JSON
  throw new ApiError(message, res.status, code, details);
}
```

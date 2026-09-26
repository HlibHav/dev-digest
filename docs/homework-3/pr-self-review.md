# pr-self-review — Smart Diff (pre-PR mode)

Mode: pre-PR (base `origin/main` = `17cc44a`, uncommitted tree at review time, committed as `4630a6c`).
The diff was over the routing skill's delegation threshold (25 files), so each surface got its own
read-only sonnet reviewer with that surface's skills. Verdict: **ready** (0 critical). The verdict
artifact is `pr-self-review-verdict.json`.

## Server slice

```
Surface:   server (9 files)
Routed:    onion-architecture (routing check only), fastify-best-practices, security, zod
Findings:  0
Notes:
  - drizzle-orm-patterns: skipped — the diff has no Drizzle code. `service.ts` declares
    `SmartDiffStorePort` as a plain local interface (structurally satisfied by `ReviewRepository`);
    `routes.ts`/`service.ts`/`classify.ts`/`constants.ts` import no `drizzle-orm`, no `src/db/**`,
    no `fastify` in application code.
  - onion layering / import direction / route-adapter-calls: already covered by the architecture
    reviewer (lint:boundaries + route-adapter-calls.test.ts pass).
  - Fastify route (`routes.ts:22-27`): `params: IdParams` (uuid-validated) is the only schema on
    the route, matching every sibling GET route in `reviews/`, `pulls/`, `conventions/`,
    `agents/` — none declares a response schema either. Grandfathered convention.
  - Security (A01 access control): `SmartDiffService.getSmartDiff` calls
    `store.getPull(workspaceId, prId)` first and returns `undefined` → the route throws
    `NotFoundError` before any unscoped `getPrFiles` / `reviewsForPull` call. Same pattern as
    `GET /pulls/:id/reviews` and `GET /pulls/:id/runs`. No IDOR: another workspace's PR and a
    missing PR both give a generic 404.
  - No secrets, no raw SQL, no string interpolation into queries; work is bounded to one PR's
    files and findings.
  - Zod: the `SmartDiffRole` enum extension is additive; tests assert the built shape with
    `SmartDiff.parse(...)` against the real contract.
  - Test quality: none of the three new test files can pass vacuously — the classifier table pins
    13 concrete cases including the three contentious ones; the build test asserts order, empty
    group omission, finding-line dedup/sort (including an empty `[]` for a file with none) and the
    `total_lines` arithmetic; the integration test seeds a real PR + review + findings and asserts
    the response shape, order, per-file `finding_lines`, `total_lines` and the 404 path.
```

## Client slice

```
Surface:   client (21 files: 13 modified + 8 new; DiffTab.test.tsx was written after this slice)
Routed:    frontend-ui-architecture, next-best-practices, react-best-practices,
           react-testing-library, security, zod
Findings:  1
  [minor] client/src/components/diff-viewer/RoleGroup/RoleGroup.tsx:54 — react-best-practices:
          key prop patterns ("never use array index as key when lists can be reordered, filtered,
          or modified"). `files.map((file, i) => <FileCard key={i} …>` used the index although
          `file.path` is a stable unique id; a refetched group with a different file set would
          attach `FileCard`'s open/closed state to the wrong file. Fixed before the commit:
          `key={file.path}`.
Notes:
  - `FindingCard` (unchanged) renders `f.rationale`/`f.suggestion` through the `Markdown`
    component and builds `fileHref` via `githubBlobUrl` — an untrusted-content sink the security
    skill flags, but its rendering/href logic is untouched and `repoFullName`/`headSha` are
    server-synced GitHub metadata. Grandfathered.
  - `useSmartDiff` fetches with `api.get<SmartDiff>(...)` and no runtime zod validation — the
    exact pattern of the sibling hooks (`usePrReviews`, `usePrRuns`, `usePrActiveRuns`).
    Grandfathered convention.
  - i18n: every new user-facing string goes through `next-intl`; no inline English in the
    changed hunks.
  - Conditional rendering, hook ordering and data-through-hooks rules hold; no `count && <X/>`
    zero-render bugs, no `fetch`/`EventSource` in components, no conditional hooks.
  - Tests use RTL query priority correctly; no implementation-detail assertions.
```

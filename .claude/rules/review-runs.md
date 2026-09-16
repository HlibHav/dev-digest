---
paths:
  - "server/src/modules/reviews/**"
  - "server/src/modules/pulls/**"
  - "server/src/modules/polling/**"
  - "server/src/platform/sse.ts"
  - "server/src/platform/run-logger.ts"
  - "client/src/lib/hooks/reviews.ts"
---

# Review runs: implicit contracts

## Lifecycle

- `ReviewService.runReview` inserts `agent_runs` rows (`running`) before any
  work starts, and returns their ids so the client can subscribe to SSE
  immediately. Execution then continues in the background — no queue, no
  retry, no concurrency cap.
- Every exit path (done, failed, cancelled, pre-work failure) must call
  `completeAgentRun`, `saveRunTrace`, and `runBus.complete`. Missing one
  leaves a run stuck `running`, or an SSE stream that never ends.
- One agent's failure must not abort the other agents of the same request.
- `RunBus` is a process-wide in-memory singleton — its buffers are never
  freed and vanish on restart. `run_traces.trace.log` is the durable copy.
- Cancellation is cooperative: `checkCancelled` is only checked before an LLM
  call.

## Diff input

- The diff normally comes from `pr_files.patch`, not `git diff`. Clones are
  depth 1 and the PR head ref is never fetched, so a real
  `git diff base...head` usually fails silently and `loadDiff` falls back
  without a visible log line.
- `pr_files` is rewritten by `GET /pulls/:id`. Changing that sync changes what
  a review sees. A PR never opened in the UI can have no patches.

## Outcome

- `score` and `blockers` are deterministic from grounded findings; `verdict`
  is still the model's own. `markReviewed(headSha)` drives needs_review /
  reviewed / stale on the PR list.

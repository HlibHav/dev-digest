# Spec: `costUsd` contract

What consumers of the engine may rely on when they read cost. The server
persists this value as-is (`server/specs/run-cost.md`).

## LLM provider (`StructuredResult.costUsd`)

- USD for the whole `completeStructured` call, including repair retries.
- `number` when priced, `null` when no price is known. Never `undefined`.
- Source precedence for `OpenRouterProvider`: OpenRouter's reported
  `usage.cost` summed over attempts, else the injected
  `estimateCost(model, tokensIn, tokensOut)`, else `null`.
- The engine holds no pricing table. Prices are injected by the caller.

## Review outcome (`reviewPullRequest(...).costUsd`)

- The sum of `costUsd` over every LLM call of the run, in both single-pass and
  map-reduce modes.
- All-or-nothing: if any call returns `null`, the run's `costUsd` is `null`. A
  partial sum would under-report and look like real data.
- A run of free calls returns `0`, which is data, not a missing value.

## Acceptance criteria

1. A single-pass review with a priced call returns that call's cost.
2. A map-reduce review returns the sum over all chunk calls.
3. One unpriced call makes the whole run `null`.
4. Computing cost adds no LLM request. `usage: { include: true }` rides on the
   existing OpenRouter request.

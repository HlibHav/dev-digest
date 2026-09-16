# Cost accounting

The engine reports cost; it never prices anything itself. This keeps the CI
runner and the server on the same code while each supplies its own prices.
The contract is `specs/run-cost.md`.

## Per call: `OpenRouterProvider.completeStructured`

1. Every request to OpenRouter carries `usage: { include: true }`
   (`src/llm/openrouter.ts:83`). OpenRouter then returns the real generation
   cost in USD as `usage.cost`, an extension missing from the OpenAI SDK type.
2. Each attempt of the parse-with-repair loop adds its tokens and, if present,
   its `usage.cost` (`src/llm/openrouter.ts:94-98`). A repair retry is billed,
   so it is counted.
3. On a successful parse the call returns
   `costFromApi ?? estimateCost?.(model, tokensIn, tokensOut) ?? null`
   (`src/llm/openrouter.ts:107`).

`estimateCost` is an optional constructor option. The server injects its
`PriceBook` (live OpenRouter prices with a static fallback). A consumer that
passes nothing gets cost only when OpenRouter reports it.

When the provider id is `openai` (OpenRouter's client pointed at another
OpenAI-compatible base URL), `usage.include` is not sent and cost comes only
from the estimator.

## Per run: `reviewPullRequest`

`src/review/run.ts` starts from `costUsd = 0` (`:159`) and folds every chunk's
call into it (`:184`):

```ts
costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
```

Once one call is unpriced the run stays `null` for the rest of the loop. The
value is returned on the outcome next to `tokensIn` and `tokensOut` (`:216`).

## Where it goes next

The server stores it on `agent_runs.cost_usd` and in the trace stats, and the
client renders it as the run cost badge. See `server/docs/run-cost-data-flow.md`.

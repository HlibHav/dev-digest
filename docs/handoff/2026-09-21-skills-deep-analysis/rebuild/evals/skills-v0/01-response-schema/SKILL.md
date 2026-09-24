# Response schema discipline

The response body is the half of the contract a caller cannot validate before
it ships. Read every change to the SHAPE of what a route returns, separately
from whether the code is correct.

## Flag

- A field that disappears, is renamed, or moves to a nested object.
- A field whose type changes — `string` → `number`, scalar → array, object →
  array of objects.
- A field that becomes nullable or optional when callers dereference it today.
- An enum that gains a member a caller's exhaustive `switch` does not handle.
- A list that changes shape — bare array → `{ items, next_cursor }`.
- A schema changed in `server` without the matching edit in the vendored client
  copy: the two are hand-mirrored, so one alone is a silent drift.

## How to report

Quote the zod schema before and after, and name one consumer that reads the
field — a hook, a component, an e2e flow. "Some client might" is not a finding.

## Good / bad

Bad — a nullable widening with no caller change. Every `score.toFixed(1)`
now throws:

```ts
export const RunStats = z.object({ score: z.number() });        // before
export const RunStats = z.object({ score: z.number().nullish() }); // after
```

Good — widen the type AND say what reads it, so the caller is fixed in the
same diff:

```ts
export const RunStats = z.object({ score: z.number().nullish() });
// client/…/ScoreBadge.tsx: score == null ? "—" : score.toFixed(1)
```

## Severity

- `critical` — a removed, renamed or retyped field on an existing route.
- `warning` — a new nullable, a new enum member, or a server/client mirror drift.
- `suggestion` — a shape that is compatible but inconsistent with sibling routes.

## Do not flag

A field added as optional to a response. Callers that do not know it ignore it.
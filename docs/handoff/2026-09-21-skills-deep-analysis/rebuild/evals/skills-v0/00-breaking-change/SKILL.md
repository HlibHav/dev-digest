# Breaking change gate

A route's shape is a contract with every client already deployed. Flag a diff
that changes what an existing caller must send or can expect.

## Flag

- **Request:** a new required field; a field that becomes required; a removed or
  renamed field; a narrowed type or enum; a stricter validator on an existing
  field; a changed path or method; a new required header or query parameter.
- **Response:** a removed or renamed field; a widened type where `null` becomes
  possible; a changed status code, including a 200 that becomes 201 or 204; a
  changed error `code`; a changed shape of a list (array → paginated object).
- **Defaults:** a changed default value that alters behaviour for a caller that
  sends nothing.
- **Semantics:** the same request now does something materially different —
  deletes where it archived, or applies a limit it did not apply before.

## How to report

Name the route and method, quote the old and the new shape, say which caller
breaks (client hook, e2e flow, CI runner, or an external consumer), and give the
compatible alternative: add the field as optional, add a new route, or keep
accepting the old name for one release.

## Severity

- `critical` — a removed or renamed field, a new required field, or a changed
  status code on a route that exists in the default branch.
- `warning` — a narrowed type, a stricter validator, or a changed default.
- `suggestion` — a change that is compatible today but pins the design into a
  corner.

## Good / bad

Bad — the field is renamed, and every deployed caller reading `cost_usd` gets
`undefined`:

```ts
// before
return { id: run.id, cost_usd: run.costUsd };
// after
return { id: run.id, cost: run.costUsd };
```

Good — add the new name, keep the old one for one release, and say when it goes:

```ts
return {
  id: run.id,
  cost: run.costUsd,
  /** @deprecated use `cost`; removed in v3. */
  cost_usd: run.costUsd,
};
```

## Do not flag

A route the diff itself introduces — nothing calls it yet.
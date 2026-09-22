# Branch coverage gate

Every conditional the diff adds or changes needs a test for each side of it.

## Flag

- A new `if`, `else`, ternary, `switch` case, `??`, `||` or optional-chaining
  fallback whose alternative path no test exercises.
- A new `throw` or early `return` guard with no test that triggers it.
- A `catch` block that the tests never enter. An untested `catch` is where a
  swallowed error lives.
- A new exported function with no test at all.

## How to report

Cite the exact `path:line` of the uncovered branch, name the input that would
reach it, and say which existing test file the case belongs in
(`*.test.ts` for unit, `*.it.test.ts` for anything needing Postgres).

## Severity

- `critical` — an untested branch that swallows an error or skips a security or
  tenancy check.
- `warning` — an untested branch in changed business logic.
- `suggestion` — an untested branch in formatting, logging or display code.

## Do not flag

Branches the diff only moved or reindented, and defensive branches that cannot
be reached from a public entry point.

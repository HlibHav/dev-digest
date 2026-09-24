# Test smells

Judge what a test would catch if the code under it broke. A test that cannot
fail is worse than no test: it reports safety that does not exist.

## Flag

- **Assertion-free test.** A test whose body only calls the code, or whose only
  assertion is `expect(x).toBeDefined()` / `not.toBeNull()`. On a Drizzle row a
  missing column reads as `undefined`, so `not.toBeNull()` passes before the
  feature exists — assert a value or a type instead.
- **Over-mocking.** The unit under test is mocked, or so much is mocked that the
  test only proves the mocks were called. Mocking the module you are testing, or
  asserting on `mock.calls` where a real return value was available, both
  qualify.
- **Testing the mock.** An assertion that only restates what the stub was told to
  return.
- **Shared mutable fixture.** A module-level object mutated inside `it`, so the
  tests pass in file order and fail alone.
- **Flake sources.** `Date.now()` or `new Date()` without a fixed clock, a real
  `setTimeout` wait instead of awaiting the thing itself, randomness with no
  seed, reliance on object key order, a hardcoded port, or a test that depends on
  a previous test having written a row.
- **Snapshot as the only assertion** for behaviour that has a specific expected
  value.

## How to report

Quote the assertion (or the missing one) with its `path:line` and state the
change to the production code that this test would not catch. That sentence is
the finding: without it you are reporting style.

## Severity

- `critical` — a test that cannot fail guarding security, tenancy or money.
- `warning` — over-mocking or an assertion-free test in changed logic.
- `suggestion` — naming, shared fixtures, and flake sources that are unlikely to
  fire.

## Do not flag

A deliberate smoke test that says so, and `expect(...).not.toThrow()` where not
throwing is the actual contract.

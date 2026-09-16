---
paths:
  - "server/src/db/**"
  - "server/drizzle.config.ts"
---

# DB schema and migrations

- Edit `src/db/schema/*.ts`, then `pnpm db:generate`, then `pnpm db:migrate`.
  Typecheck and integration tests pass without the last step, because they
  migrate a fresh testcontainer — your dev DB only fails at request time.
- Never hand-edit `src/db/migrations/meta/` or renumber migration files. The
  journal has needed repair before.
- Tables no starter code touches (`memory`, `eval_*`, `ci_*`, …) are
  intentional lesson scaffolding — don't drop them.
- `findings` has no `workspace_id`; tenancy flows through `reviews`.
- `seed.ts` must stay idempotent. `LocalNoAuthProvider` looks up the system
  user and default workspace by the exact names `seed.ts` inserts.

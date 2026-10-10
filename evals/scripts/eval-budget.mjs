/**
 * Spend guard for the eval CI. OpenRouter reports a key's lifetime usage in USD; the workflow reads
 * it before the eval jobs and again after, and fails when the run spent more than its budget.
 *
 *   node scripts/eval-budget.mjs usage                       # print the key's usage (USD)
 *   node scripts/eval-budget.mjs check <usage-before> <budget-usd>
 *
 * Plain Node, no deps, so the CI jobs that call it skip `pnpm install`.
 *
 * The usage is per key, so another run on the same key at the same time counts too; the guard
 * errs toward failing. It catches an overspend after the fact; a hard cap is a credit limit on the
 * CI key itself (OpenRouter → Keys → limit).
 */

export function spentUsd(before, now) {
  return Math.max(0, now - before);
}

export function overBudget(before, now, budget) {
  return spentUsd(before, now) > budget;
}

async function usage() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`OpenRouter /key returned ${res.status}`);
  const body = await res.json();
  const u = body.data?.usage;
  if (typeof u !== "number") throw new Error("OpenRouter /key response has no data.usage");
  return u;
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "usage") {
    console.log((await usage()).toFixed(6));
    return;
  }
  if (cmd === "check") {
    const before = Number(a);
    const budget = Number(b);
    if (!Number.isFinite(before) || !Number.isFinite(budget)) {
      console.error("usage: node scripts/eval-budget.mjs check <usage-before> <budget-usd>");
      process.exit(1);
    }
    const now = await usage();
    const spent = spentUsd(before, now);
    if (overBudget(before, now, budget)) {
      console.log(`::error title=Eval budget::spent $${spent.toFixed(4)} > budget $${budget.toFixed(2)}`);
      process.exit(1);
    }
    console.log(`spent $${spent.toFixed(4)} of $${budget.toFixed(2)} budget`);
    return;
  }
  console.error("usage: node scripts/eval-budget.mjs usage | check <usage-before> <budget-usd>");
  process.exit(1);
}

if (process.argv[1]?.endsWith("eval-budget.mjs")) {
  main().catch((e) => {
    console.error(String(e));
    process.exit(1);
  });
}

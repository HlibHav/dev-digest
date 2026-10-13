/**
 * Fail a CI eval job when its log shows a provider outage (see provider-errors.ts).
 *
 *   pnpm eval:provider-check vitest.log
 *
 * Exit 1 on any credits/auth error, 0 otherwise; failed cases and timeouts stay report-only.
 */

import { readFileSync } from "node:fs";
import { findProviderErrors } from "./provider-errors.js";

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: eval:provider-check <vitest log>");
    process.exit(2);
  }
  const errors = findProviderErrors(readFileSync(path, "utf8"));
  if (errors.length === 0) {
    console.log("no provider errors in the eval log");
    return;
  }
  for (const e of errors.slice(0, 5)) console.error(`::error::provider ${e.kind} error: ${e.line.slice(0, 300)}`);
  console.error(`${errors.length} provider error line(s): the eval results above are not a measurement.`);
  process.exit(1);
}

main();

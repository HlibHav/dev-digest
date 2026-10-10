/**
 * Turn the records of a plain `vitest run` (CI) into a labeled series that `eval:delta` can diff
 * against a committed baseline.
 *
 *   pnpm eval:report --label ci                  # every record in results/records.jsonl
 *   pnpm eval:report --label ci --since 120      # only records appended after line 120
 *
 * Node ids are made relative to evals/ (`skills/x/x.eval.ts > …`), so a baseline recorded on one
 * machine matches a run on another. Baselines live in evals/baselines/<suite>.json; to compare,
 * copy one to results/repeat-baseline.json and run `pnpm eval:delta baseline ci`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RESULTS_DIR } from "./artifacts/paths.js";
import { gitInfo } from "./git.js";
import { aggregate, loadRecords, type EvalRecord } from "./records/stats.js";

/** `/any/path/evals/skills/x/x.eval.ts > …` → `skills/x/x.eval.ts > …`. */
export function relativeNodeid(nodeid: string): string {
  const i = nodeid.lastIndexOf("/evals/", nodeid.indexOf(" > ") === -1 ? undefined : nodeid.indexOf(" > "));
  return i === -1 ? nodeid : nodeid.slice(i + "/evals/".length);
}

export function relativize(records: EvalRecord[]): EvalRecord[] {
  return records.map((r) => ({ ...r, nodeid: relativeNodeid(r.nodeid) }));
}

function main(): void {
  const argv = process.argv.slice(2);
  let label: string | undefined;
  let since = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--label") label = argv[++i];
    else if (argv[i] === "--since") since = Number(argv[++i]);
  }
  if (!label) {
    console.error("usage: pnpm eval:report --label <name> [--since <line>]");
    process.exit(1);
  }
  const records = relativize(loadRecords(since));
  if (records.length === 0) {
    console.error("no records to report (did the eval run write any?)");
    process.exit(1);
  }
  const tests = aggregate(records);
  const git = gitInfo();
  mkdirSync(RESULTS_DIR, { recursive: true });
  const file = join(RESULTS_DIR, `repeat-${label}.json`);
  const times = Math.max(...Object.values(tests).map((t) => t.pass.total));
  writeFileSync(file, JSON.stringify({ label, git_sha: git.sha, dirty: git.dirty, times, tests }, null, 2));
  const passed = Object.values(tests).filter((t) => t.pass.rate === 1).length;
  console.log(`${label}: ${passed}/${Object.keys(tests).length} cases at 100% over ${times} run(s) -> ${file}`);
}

if (process.argv[1]?.endsWith("report.ts")) main();

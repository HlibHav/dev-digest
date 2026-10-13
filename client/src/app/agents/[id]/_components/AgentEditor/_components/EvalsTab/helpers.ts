/* Pure helpers for the Evals tab and the Case Editor. No React import. */
import type { EvalCaseView, EvalExpectation, PrFile } from "@devdigest/shared";
import { EvalExpectedOutput } from "@devdigest/shared/contracts/eval-pipeline";
import { MASK, SECRET_PATTERNS } from "./constants";

export type ExpectedOutputCheck = { ok: true; value: EvalExpectation[] } | { ok: false; error: string };

/** Parse and shape-check the expected-output text; `error` is the first problem found. */
export function validateExpectedOutput(text: string): ExpectedOutputCheck {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const parsed = EvalExpectedOutput.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue && issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return { ok: false, error: `${where}${issue?.message ?? "invalid"}` };
}

/** Append one `must_find` template with empty file and line fields. Unparseable text is left alone. */
export function appendFindingSkeleton(text: string): string {
  let list: unknown[] = [];
  if (text.trim() !== "") {
    try {
      const raw: unknown = JSON.parse(text);
      if (!Array.isArray(raw)) return text;
      list = raw;
    } catch {
      return text;
    }
  }
  list.push({ type: "must_find", file: "", start_line: null, end_line: null });
  return JSON.stringify(list, null, 2);
}

/** New-side line ranges of every hunk, per file path of a unified diff. */
export function hunkRangesByFile(diff: string): Map<string, [number, number][]> {
  const out = new Map<string, [number, number][]>();
  let current: [number, number][] | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).trim().replace(/^b\//, "");
      if (path === "/dev/null") {
        current = null;
      } else {
        current = out.get(path) ?? [];
        out.set(path, current);
      }
      continue;
    }
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m && current) {
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      current.push([start, start + Math.max(count - 1, 0)]);
    }
  }
  return out;
}

type Located = Pick<EvalExpectation, "file" | "start_line" | "end_line">;

/** Indexes of expectations whose line range touches no hunk of their file (AC-41). Incomplete entries are skipped. */
export function unmatchableExpectations(diff: string, list: readonly Located[]): number[] {
  const ranges = hunkRangesByFile(diff);
  const bad: number[] = [];
  list.forEach((e, i) => {
    if (!e.file || typeof e.start_line !== "number" || typeof e.end_line !== "number") return;
    const hunks = ranges.get(e.file) ?? [];
    const hit = hunks.some(([from, to]) => e.start_line <= to && e.end_line >= from);
    if (!hit) bad.push(i);
  });
  return bad;
}

/** Replace anything shaped like a credential with a mask; `found` says whether anything was hidden. */
export function maskSecrets(text: string): { masked: string; found: boolean } {
  let masked = text;
  let found = false;
  for (const pattern of SECRET_PATTERNS) {
    masked = masked.replace(pattern, () => {
      found = true;
      return MASK;
    });
  }
  return { masked, found };
}

/** Split a unified diff into the per-file shape the diff viewer renders. */
export function diffToPrFiles(diff: string): PrFile[] {
  const files: PrFile[] = [];
  let path: string | null = null;
  let patch: string[] = [];
  const flush = () => {
    if (path === null) return;
    let additions = 0;
    let deletions = 0;
    for (const l of patch) {
      if (l.startsWith("+")) additions++;
      else if (l.startsWith("-")) deletions++;
    }
    files.push({ path, additions, deletions, patch: patch.join("\n") });
  };
  const lines = diff.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("--- ") && lines[i + 1]?.startsWith("+++ ")) {
      flush();
      const p = lines[i + 1]!.slice(4).trim().replace(/^b\//, "");
      path = p === "/dev/null" ? null : p;
      patch = [];
      i++;
      continue;
    }
    if (line.startsWith("diff --git ")) {
      flush();
      path = null;
      patch = [];
      continue;
    }
    if (path !== null && (patch.length > 0 || line.startsWith("@@"))) patch.push(line);
  }
  flush();
  return files;
}

/** Cases whose last run passed, out of all cases. */
export function passingCount(cases: readonly EvalCaseView[]): { passed: number; total: number } {
  return { passed: cases.filter((c) => c.last_result?.status === "passed").length, total: cases.length };
}

/** Which chip label a case's expectations get. */
export function expectationChipKey(list: readonly EvalExpectation[]): "mustFind" | "mustNotFlag" | "expectClean" | "mixed" {
  if (list.length === 0) return "expectClean";
  if (list.every((e) => e.type === "must_find")) return "mustFind";
  if (list.every((e) => e.type === "must_not_flag")) return "mustNotFlag";
  return "mixed";
}

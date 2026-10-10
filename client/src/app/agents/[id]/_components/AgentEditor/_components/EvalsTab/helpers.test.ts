import { describe, it, expect } from "vitest";
import type { EvalCaseView } from "@devdigest/shared";
import {
  appendFindingSkeleton,
  diffToPrFiles,
  expectationChipKey,
  hunkRangesByFile,
  maskSecrets,
  passingCount,
  runningProgress,
  unmatchableExpectations,
  validateExpectedOutput,
} from "./helpers";

const DIFF = [
  "--- a/src/config.ts",
  "+++ b/src/config.ts",
  "@@ -10,6 +10,7 @@",
  " a",
  '+  stripeKey: "sk_live_51H8xq2Ka"',
  " b",
  "--- a/src/other.ts",
  "+++ b/src/other.ts",
  "@@ -1 +1,2 @@",
  " x",
  "+y",
].join("\n");

describe("validateExpectedOutput", () => {
  it("reports JSON errors, shape errors naming the field, and accepts a valid list", () => {
    const bad = validateExpectedOutput("[");
    expect(bad.ok).toBe(false);
    const noFile = validateExpectedOutput('[{"type":"must_find","start_line":1,"end_line":1}]');
    expect(noFile.ok).toBe(false);
    if (!noFile.ok) expect(noFile.error).toContain("file");
    const good = validateExpectedOutput('[{"type":"must_find","file":"a.ts","start_line":1,"end_line":2}]');
    expect(good.ok).toBe(true);
    expect(validateExpectedOutput("[]")).toEqual({ ok: true, value: [] });
  });
});

describe("appendFindingSkeleton", () => {
  it("adds one must_find template with empty file and null lines", () => {
    const parsed = JSON.parse(appendFindingSkeleton("[]"));
    expect(parsed).toEqual([{ type: "must_find", file: "", start_line: null, end_line: null }]);
    expect(JSON.parse(appendFindingSkeleton(appendFindingSkeleton("[]")))).toHaveLength(2);
    expect(appendFindingSkeleton("[")).toBe("[");
  });
});

describe("unmatchableExpectations", () => {
  it("flags a range outside every hunk of its file", () => {
    expect(hunkRangesByFile(DIFF).get("src/config.ts")).toEqual([[10, 16]]);
    expect(unmatchableExpectations(DIFF, [{ file: "src/config.ts", start_line: 40, end_line: 40 }])).toEqual([0]);
    expect(unmatchableExpectations(DIFF, [{ file: "src/config.ts", start_line: 12, end_line: 12 }])).toEqual([]);
    expect(unmatchableExpectations(DIFF, [{ file: "nope.ts", start_line: 1, end_line: 1 }])).toEqual([0]);
  });
});

describe("maskSecrets", () => {
  it("hides each credential shape", () => {
    for (const secret of [
      "sk_live_51H8xq2Ka",
      "ghp_abcdefghijklmnop1234",
      "AKIAABCDEFGHIJKLMNOP",
      "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----",
    ]) {
      const { masked, found } = maskSecrets(`k = "${secret}" done`);
      expect(found).toBe(true);
      expect(masked).not.toContain(secret.split("\n")[0]!.slice(-12));
      expect(masked).toContain("done");
    }
    expect(maskSecrets("nothing here")).toEqual({ masked: "nothing here", found: false });
  });
});

describe("diffToPrFiles", () => {
  it("splits files with counts and patch", () => {
    const files = diffToPrFiles(DIFF);
    expect(files.map((f) => f.path)).toEqual(["src/config.ts", "src/other.ts"]);
    expect(files[0]).toMatchObject({ additions: 1, deletions: 0 });
    expect(files[0]!.patch).toContain("@@ -10,6 +10,7 @@");
    expect(files[1]!.patch).not.toContain("sk_live_");
  });
});

describe("passingCount and chips", () => {
  it("counts passed cases and picks the chip key", () => {
    const mk = (status: "passed" | "failed" | null) =>
      ({ last_result: status ? { status } : null }) as unknown as EvalCaseView;
    expect(passingCount([mk("passed"), mk("failed"), mk(null)])).toEqual({ passed: 1, total: 3 });
    const e = (type: "must_find" | "must_not_flag") => ({ type, file: "a", start_line: 1, end_line: 1 });
    expect(expectationChipKey([])).toBe("expectClean");
    expect(expectationChipKey([e("must_find")])).toBe("mustFind");
    expect(expectationChipKey([e("must_not_flag")])).toBe("mustNotFlag");
    expect(expectationChipKey([e("must_find"), e("must_not_flag")])).toBe("mixed");
  });
});

describe("runningProgress", () => {
  const r = (id: string, status: "running" | "done", cases_done = 1) => ({ id, status, cases_done, cases_total: 3 });
  it("counts a tracked id without a response as running, and lets a running suite beat a finished one", () => {
    expect(runningProgress({ trackedId: "s1", suite: undefined, resumed: null, casesTotal: 3 })).toEqual({ done: 0, total: 3 });
    expect(runningProgress({ trackedId: "s1", suite: r("s1", "running"), resumed: null, casesTotal: 3 })).toEqual({ done: 1, total: 3 });
    expect(runningProgress({ trackedId: "s1", suite: r("s1", "done", 3), resumed: r("s2", "running", 2), casesTotal: 3 })).toEqual({ done: 2, total: 3 });
    // a stale history entry for the suite we saw finish is not running
    expect(runningProgress({ trackedId: "s1", suite: r("s1", "done", 3), resumed: r("s1", "running"), casesTotal: 3 })).toBeNull();
    expect(runningProgress({ trackedId: null, suite: undefined, resumed: null, casesTotal: 3 })).toBeNull();
  });
});

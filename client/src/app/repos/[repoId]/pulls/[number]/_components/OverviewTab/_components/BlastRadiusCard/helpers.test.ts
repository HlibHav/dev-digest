import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { blastStats, pickLinkSha, toGraphModel } from "./helpers";

describe("blastStats", () => {
  it("blastStats counts per the count rules", () => {
    // Count rules (plan "Contracts & data"):
    //  - symbols = changed_symbols.length (3: "baz" has no downstream group)
    //  - callers = distinct file:line pairs across all downstream[].callers
    //      (b.ts:10) is shared by two groups -> counted once;
    //      (b.ts:99) is the same file at a different line -> counted separately;
    //      (c.ts:20) is a third distinct pair.
    //      => 3 distinct callers, not 4.
    //  - endpoints = distinct strings across all endpoints_affected
    //      ("GET /x" repeats in both groups -> counted once; "POST /y" is new)
    //      => 2 distinct endpoints.
    //  - crons = distinct strings across all crons_affected => 1.
    const blast: BlastRadius = {
      changed_symbols: [
        { name: "foo", file: "a.ts", kind: "function" },
        { name: "bar", file: "a.ts", kind: "function" },
        { name: "baz", file: "a.ts", kind: "function" },
      ],
      downstream: [
        {
          symbol: "foo",
          callers: [
            { name: "foo", file: "b.ts", line: 10 },
            { name: "foo", file: "c.ts", line: 20 },
          ],
          endpoints_affected: ["GET /x"],
          crons_affected: [],
        },
        {
          symbol: "bar",
          callers: [
            { name: "bar", file: "b.ts", line: 10 },
            { name: "bar", file: "b.ts", line: 99 },
          ],
          endpoints_affected: ["GET /x", "POST /y"],
          crons_affected: ["nightly-job"],
        },
      ],
      summary: "3 changed symbol(s) · 3 caller(s) · 2 endpoint(s) · 1 cron/job(s)",
    };

    expect(blastStats(blast)).toEqual({ symbols: 3, callers: 3, endpoints: 2, crons: 1 });
  });

  it("counts zero for an empty blast radius", () => {
    const blast: BlastRadius = { changed_symbols: [], downstream: [], summary: "" };
    expect(blastStats(blast)).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
  });
});

describe("pickLinkSha", () => {
  it("pickLinkSha prefers lastIndexedSha, falls back to headSha, else null", () => {
    expect(pickLinkSha("abc1234", "def5678")).toBe("abc1234");
    // review-focus case: lastIndexedSha === '' for a repo with no index yet.
    expect(pickLinkSha("", "def5678")).toBe("def5678");
    expect(pickLinkSha(null, "def5678")).toBe("def5678");
    expect(pickLinkSha(undefined, "def5678")).toBe("def5678");
    expect(pickLinkSha("", null)).toBeNull();
    expect(pickLinkSha("", "")).toBeNull();
    expect(pickLinkSha(undefined, undefined)).toBeNull();
    expect(pickLinkSha(null, null)).toBeNull();
  });
});

describe("toGraphModel", () => {
  it("toGraphModel builds three columns and deduped edges", () => {
    // Two changed symbols ("foo", "bar") are each called from the SAME
    // caller (b.ts:10), and both groups report the same endpoint
    // ("GET /x"); only "bar" also reports a cron ("nightly"). This forces:
    //  - the caller node to be deduped across the two groups (1, not 2);
    //  - the endpoint node to be deduped across the two groups (1, not 2);
    //  - the symbol -> caller edges to stay distinct (different `from`);
    //  - the caller -> endpoint edge to be deduped to exactly one.
    const blast: BlastRadius = {
      changed_symbols: [
        { name: "foo", file: "a.ts", kind: "function" },
        { name: "bar", file: "a.ts", kind: "function" },
      ],
      downstream: [
        {
          symbol: "foo",
          callers: [{ name: "foo", file: "b.ts", line: 10 }],
          endpoints_affected: ["GET /x"],
          crons_affected: [],
        },
        {
          symbol: "bar",
          callers: [{ name: "bar", file: "b.ts", line: 10 }],
          endpoints_affected: ["GET /x"],
          crons_affected: ["nightly"],
        },
      ],
      summary: "",
    };

    const model = toGraphModel(blast);

    expect(model.symbols).toHaveLength(2);
    expect(model.symbols).toEqual(
      expect.arrayContaining([
        { id: "sym:foo", label: "foo", kind: "symbol" },
        { id: "sym:bar", label: "bar", kind: "symbol" },
      ]),
    );

    // Deduped: one caller node, not two, even though it's linked from both groups.
    expect(model.callers).toHaveLength(1);
    expect(model.callers[0]).toEqual({ id: "caller:b.ts:10", kind: "caller", label: expect.any(String) });

    // Deduped: the endpoint appears once even though both groups report it;
    // the cron is its own node, distinct from the endpoint.
    expect(model.targets).toHaveLength(2);
    expect(model.targets).toEqual(
      expect.arrayContaining([
        { id: "ep:GET /x", label: "GET /x", kind: "endpoint" },
        { id: "cron:nightly", label: "nightly", kind: "cron" },
      ]),
    );

    // symbol->caller (x2, distinct `from`) + caller->endpoint (deduped to 1)
    // + caller->cron (1) = 4 edges, not 5.
    expect(model.edges).toHaveLength(4);
    expect(model.edges).toEqual(
      expect.arrayContaining([
        { from: "sym:foo", to: "caller:b.ts:10" },
        { from: "sym:bar", to: "caller:b.ts:10" },
        { from: "caller:b.ts:10", to: "ep:GET /x" },
        { from: "caller:b.ts:10", to: "cron:nightly" },
      ]),
    );
  });

  it("empty downstream builds empty callers, targets and edges but keeps changed symbols", () => {
    const blast: BlastRadius = {
      changed_symbols: [{ name: "foo", file: "a.ts", kind: "function" }],
      downstream: [],
      summary: "",
    };
    const model = toGraphModel(blast);
    expect(model.symbols).toEqual([{ id: "sym:foo", label: "foo", kind: "symbol" }]);
    expect(model.callers).toEqual([]);
    expect(model.targets).toEqual([]);
    expect(model.edges).toEqual([]);
  });
});

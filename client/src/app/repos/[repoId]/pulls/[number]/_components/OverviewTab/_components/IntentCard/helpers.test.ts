import { describe, it, expect } from "vitest";
import type { IntentSource } from "@devdigest/shared";
import { usedSources, missingSources } from "./helpers";
import { MAX_SOURCES_SHOWN } from "./constants";

function source(over: Partial<IntentSource> = {}): IntentSource {
  return { kind: "title", ref: "title", used: true, note: null, ...over };
}

describe("usedSources", () => {
  it("keeps only sources marked used", () => {
    const sources = [
      source({ kind: "title", used: true }),
      source({ kind: "description", used: false }),
      source({ kind: "issue", ref: "#7", used: true }),
    ];
    expect(usedSources(sources).map((s) => s.kind)).toEqual(["title", "issue"]);
  });

  it("returns an empty array for null/undefined", () => {
    expect(usedSources(null)).toEqual([]);
    expect(usedSources(undefined)).toEqual([]);
  });

  it("returns an empty array when nothing was used", () => {
    expect(usedSources([source({ used: false })])).toEqual([]);
  });

  it("caps at MAX_SOURCES_SHOWN", () => {
    const many = Array.from({ length: MAX_SOURCES_SHOWN + 5 }, (_, i) =>
      source({ kind: "commits", ref: `c${i}`, used: true }),
    );
    expect(usedSources(many)).toHaveLength(MAX_SOURCES_SHOWN);
  });
});

describe("missingSources", () => {
  it("keeps only sources marked NOT used", () => {
    const sources = [
      source({ kind: "title", used: true }),
      source({ kind: "description", used: false }),
      source({ kind: "issue", used: false }),
    ];
    expect(missingSources(sources).map((s) => s.kind)).toEqual(["description", "issue"]);
  });

  it("returns an empty array for null/undefined", () => {
    expect(missingSources(null)).toEqual([]);
    expect(missingSources(undefined)).toEqual([]);
  });

  it("caps at MAX_SOURCES_SHOWN", () => {
    const many = Array.from({ length: MAX_SOURCES_SHOWN + 3 }, (_, i) =>
      source({ kind: "commits", ref: `c${i}`, used: false }),
    );
    expect(missingSources(many)).toHaveLength(MAX_SOURCES_SHOWN);
  });
});

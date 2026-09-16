import { describe, it, expect } from "vitest";
import { shortDescription } from "./helpers";

describe("shortDescription", () => {
  it("strips markdown emphasis, code ticks and headings", () => {
    expect(shortDescription("## Why\n**Live** key in `config.ts`.")).toBe("Why Live key in config.ts.");
  });

  it("clips long text on a word boundary with an ellipsis", () => {
    const text = "word ".repeat(60).trim();
    const out = shortDescription(text, 40);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  it("keeps underscores inside identifiers and strips only emphasis markers", () => {
    expect(shortDescription("Line 12 contains a literal `sk_live_…` key; _really_ bad for user_id.")).toBe(
      "Line 12 contains a literal sk_live_… key; really bad for user_id.",
    );
  });

  it("leaves short text alone", () => {
    expect(shortDescription("Short.")).toBe("Short.");
  });
});

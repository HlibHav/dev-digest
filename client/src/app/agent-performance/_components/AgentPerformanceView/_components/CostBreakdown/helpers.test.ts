import { describe, it, expect } from "vitest";
import { donutGradient, roundedSumDiffers } from "./helpers";

describe("CostBreakdown helpers", () => {
  it("roundedSumDiffers true when cents of parts ≠ cents of total", () => {
    // 0.004 + 0.004 + 0.004 rounds to 0¢ each, but the 0.012 total rounds to 1¢
    expect(roundedSumDiffers([0.004, 0.004, 0.004], 0.012)).toBe(true);
    expect(roundedSumDiffers([0.07, 0.008, 0.01, 0.01], 0.098)).toBe(false);
    // an unpriced bucket adds nothing; a missing total never differs
    expect(roundedSumDiffers([0.05, null], 0.05)).toBe(false);
    expect(roundedSumDiffers([0.05], null)).toBe(false);
  });

  it("donutGradient splits priced parts and is null when nothing is priced", () => {
    expect(donutGradient([3, null, 1], ["red", "blue", "green"])).toBe(
      "conic-gradient(red 0.00% 75.00%, blue 75.00% 75.00%, green 75.00% 100.00%)",
    );
    expect(donutGradient([null, 0], ["red"])).toBeNull();
  });
});

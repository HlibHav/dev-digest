import { describe, it, expect } from "vitest";
import { formatPercent, formatDuration } from "./helpers";

describe("model-split formatters", () => {
  it("formatPercent(0.818) → '82%'; null → '—'", () => {
    expect(formatPercent(0.818)).toBe("82%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(null)).toBe("—");
  });

  it("formatDuration(6200) → '6.2s', 5000 → '5s', null → '—'", () => {
    expect(formatDuration(6200)).toBe("6.2s");
    expect(formatDuration(5000)).toBe("5s");
    expect(formatDuration(42000)).toBe("42s");
    expect(formatDuration(125000)).toBe("2m 5s");
    expect(formatDuration(null)).toBe("—");
  });
});

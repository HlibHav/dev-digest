import { describe, it, expect } from "vitest";
import { readPeriod, writePeriod, toStatsQuery, isInvalidRange } from "./helpers";

const TODAY = "2026-10-15";

describe("period-selector helpers", () => {
  it("readPeriod: no param → 30d", () => {
    expect(readPeriod(new URLSearchParams())).toEqual({ period: "30d" });
    expect(readPeriod(new URLSearchParams("period=week"))).toEqual({ period: "30d" });
  });

  it("readPeriod: period=custom&from&to round-trips", () => {
    const sel = readPeriod(new URLSearchParams("period=custom&from=2026-10-01&to=2026-10-07"));
    expect(sel).toEqual({ period: "custom", from: "2026-10-01", to: "2026-10-07" });
    expect(writePeriod(new URLSearchParams(), sel).toString()).toBe("period=custom&from=2026-10-01&to=2026-10-07");
    expect(readPeriod(new URLSearchParams("period=custom&from=nope"))).toEqual({ period: "custom", from: null, to: null });
  });

  it("writePeriod keeps tab and other params", () => {
    const sp = new URLSearchParams("tab=stats&x=1&period=custom&from=2026-10-01&to=2026-10-02");
    const out = writePeriod(sp, { period: "1d" });
    expect(out.get("tab")).toBe("stats");
    expect(out.get("x")).toBe("1");
    expect(out.get("period")).toBe("1d");
    expect(out.has("from")).toBe(false);
    expect(out.has("to")).toBe(false);
    // the input is not mutated, and a lone `from` is kept
    expect(sp.get("period")).toBe("custom");
    expect(writePeriod(sp, { period: "custom", from: "2026-10-03", to: null }).get("from")).toBe("2026-10-03");
  });

  it("toStatsQuery: custom with only from → null", () => {
    expect(toStatsQuery({ period: "custom", from: "2026-10-01", to: null }, TODAY)).toBeNull();
    expect(toStatsQuery({ period: "custom", from: null, to: "2026-10-01" }, TODAY)).toBeNull();
  });

  it("from after to → null", () => {
    expect(toStatsQuery({ period: "custom", from: "2026-10-08", to: "2026-10-07" }, TODAY)).toBeNull();
  });

  it("to after today → null", () => {
    expect(toStatsQuery({ period: "custom", from: "2026-10-01", to: "2026-10-16" }, TODAY)).toBeNull();
    expect(toStatsQuery({ period: "custom", from: "2026-10-01", to: TODAY }, TODAY)).toEqual({
      period: "custom",
      from: "2026-10-01",
      to: TODAY,
    });
  });

  it("367-day span → null", () => {
    // 2025-10-14 … 2026-10-15 is 367 days counted inclusively; one day later is 366
    expect(toStatsQuery({ period: "custom", from: "2025-10-14", to: TODAY }, TODAY)).toBeNull();
    expect(toStatsQuery({ period: "custom", from: "2025-10-15", to: TODAY }, TODAY)).not.toBeNull();
  });

  it("1d → { period: '1d' }", () => {
    expect(toStatsQuery({ period: "1d" }, TODAY)).toEqual({ period: "1d" });
    expect(toStatsQuery({ period: "30d" }, TODAY)).toEqual({ period: "30d" });
  });

  it("isInvalidRange only when both custom dates are set and the query is null", () => {
    expect(isInvalidRange({ period: "custom", from: "2026-10-08", to: "2026-10-07" }, null)).toBe(true);
    expect(isInvalidRange({ period: "custom", from: "2026-10-08", to: null }, null)).toBe(false);
    expect(isInvalidRange({ period: "1d" }, { period: "1d" })).toBe(false);
  });
});

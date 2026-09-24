import { describe, it, expect, afterEach, vi } from "vitest";
import { API_BASE, downloadFindingsCsv } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downloadFindingsCsv", () => {
  it("fetches the PR's findings.csv and resolves with the response blob", async () => {
    const blob = new Blob(["severity,title\nWARNING,Missing null check\n"], { type: "text/csv" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadFindingsCsv("pr-1");

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/pulls/pr-1/findings.csv`);
    expect(result).toBe(blob);
  });
});

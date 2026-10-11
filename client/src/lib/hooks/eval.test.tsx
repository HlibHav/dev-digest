import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { get: getMock, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
  };
});

import { ApiError } from "@/lib/api";
import { isCaseRunGone, EVAL_DASHBOARD_POLL_MS, useSuiteRun, useCaseRun, useEvalWorkspaceDashboard, useAgentEvalDashboard, useEvalCases } from "./eval";

function wrapperWith(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const suite = (status: string) => ({ id: "s1", agent_id: "a1", status });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  getMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useSuiteRun", () => {
  it("polls every 1500 ms while running and stops at done", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    getMock
      .mockResolvedValueOnce(suite("running"))
      .mockResolvedValueOnce(suite("running"))
      .mockResolvedValue(suite("done"));
    const { result } = renderHook(() => useSuiteRun("s1").query, { wrapper: wrapperWith(qc) });

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(getMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    expect(getMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(getMock).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(getMock).toHaveBeenCalledTimes(3);

    // terminal: no further polling, and the dashboard, cases and history refresh once
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(getMock).toHaveBeenCalledTimes(3);
    expect(result.current.data?.status).toBe("done");
    const keys = invalidate.mock.calls.map(([f]) => JSON.stringify((f as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(["eval-dashboard", "a1"]),
        JSON.stringify(["eval-cases", "a1"]),
        JSON.stringify(["eval-history", "a1"]),
      ]),
    );
  });

  it("does not fetch without an id", async () => {
    const qc = new QueryClient();
    renderHook(() => useSuiteRun(null), { wrapper: wrapperWith(qc) });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("useCaseRun", () => {
  it("stops at errored", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getMock
      .mockResolvedValueOnce({ id: "c1", status: "running" })
      .mockResolvedValue({ id: "c1", status: "errored" });
    const { result } = renderHook(() => useCaseRun("c1").query, { wrapper: wrapperWith(qc) });

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(getMock).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(result.current.data?.status).toBe("errored");
  });
});

describe("CR-3 / CR-6 refresh", () => {
  it("invalidates once when the first fetch is already terminal, including the workspace dashboard", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    getMock.mockResolvedValue(suite("failed"));
    renderHook(() => useSuiteRun("s1"), { wrapper: wrapperWith(qc) });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    const keys = invalidate.mock.calls.map(([f]) => JSON.stringify((f as { queryKey: unknown }).queryKey));
    expect(keys.sort()).toEqual(
      [
        JSON.stringify(["eval-cases", "a1"]),
        JSON.stringify(["eval-dashboard", "a1"]),
        JSON.stringify(["eval-history", "a1"]),
        JSON.stringify(["eval-workspace-dashboard"]),
      ].sort(),
    );
  });

  it("polls the workspace dashboard only while a run is running", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const running = { agents: [], recent_runs: [{ status: "running" }] };
    const idle = { agents: [], recent_runs: [{ status: "done" }] };
    getMock.mockResolvedValueOnce(running).mockResolvedValue(idle);
    renderHook(() => useEvalWorkspaceDashboard(), { wrapper: wrapperWith(qc) });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(getMock).toHaveBeenCalledTimes(1); // slower than the suite poll
    await act(async () => { await vi.advanceTimersByTimeAsync(EVAL_DASHBOARD_POLL_MS); });
    expect(getMock).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("does not poll the agent dashboard (the suite poll owns the refresh)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getMock.mockResolvedValue({ latest: { status: "done" }, history: [{ status: "running" }] });
    renderHook(() => useAgentEvalDashboard("a1"), { wrapper: wrapperWith(qc) });
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});

describe("SR-2 path encoding", () => {
  it("encodes the id segment", async () => {
    const qc = new QueryClient();
    getMock.mockResolvedValue([]);
    renderHook(() => useEvalCases("a/../b"), { wrapper: wrapperWith(qc) });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(getMock).toHaveBeenCalledWith("/agents/a%2F..%2Fb/eval-cases");
  });
});

describe("useCaseRun refresh and errors", () => {
  const caseRun = (status: string) => ({ id: "c1", case_id: "k1", status });
  const keysOf = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map(([f]) => JSON.stringify((f as { queryKey: unknown }).queryKey));

  it("invalidates the agent's cases and dashboard once on a terminal status, even on the first fetch", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    getMock.mockResolvedValue(caseRun("passed"));
    renderHook(() => useCaseRun("c1", "a1"), { wrapper: wrapperWith(qc) });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(keysOf(invalidate).sort()).toEqual(
      [JSON.stringify(["eval-cases", "a1"]), JSON.stringify(["eval-dashboard", "a1"])].sort(),
    );
  });

  it("keeps polling through a transient error but stops on a 404", async () => {
    const qc = new QueryClient();
    let n = 0;
    getMock.mockImplementation(async () => {
      n += 1;
      if (n <= 2) throw new ApiError("boom", 500);
      if (n === 3) return caseRun("running");
      throw new ApiError("gone", 404);
    });
    // read `error` during render: react-query only re-renders for fields the render touched
    const { result } = renderHook(
      () => {
        const q = useCaseRun("c1", "a1");
        return { error: q.query.error };
      },
      { wrapper: wrapperWith(qc) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    const calls = getMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(calls).toBeGreaterThanOrEqual(4);
    expect(isCaseRunGone(result.current.error)).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(getMock.mock.calls.length).toBe(calls);
    expect(isCaseRunGone(new ApiError("x", 500))).toBe(false);
  });

  it("CR-23 stops polling after 3 consecutive failures and reports stalled; a success resets the count", async () => {
    const qc = new QueryClient();
    getMock.mockRejectedValue(new ApiError("bad gateway", 502));
    const { result } = renderHook(
      () => {
        const q = useCaseRun("c1", "a1");
        return { error: q.query.error, stalled: q.stalled };
      },
      { wrapper: wrapperWith(qc) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(getMock.mock.calls.length).toBe(3);
    expect(result.current.stalled).toBe(true);
    expect(result.current.error).toBeInstanceOf(ApiError);

    // two failures, a success, two failures: never 3 in a row, so polling goes on
    cleanup();
    getMock.mockReset();
    let n = 0;
    getMock.mockImplementation(async () => {
      n += 1;
      if (n === 3) return caseRun("running");
      if (n <= 5) throw new ApiError("boom", 500);
      return caseRun("passed");
    });
    const second = renderHook(
      () => {
        const q = useCaseRun("c2", "a1");
        return { status: q.query.data?.status, stalled: q.stalled };
      },
      { wrapper: wrapperWith(new QueryClient()) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(second.result.current.status).toBe("passed");
    expect(second.result.current.stalled).toBe(false);
  });
});

describe("fix4 run tracking (CR-28/29/34)", () => {
  it("CR-29/CR-34 a suite poll that fails 3 times in a row stalls, even after running responses; no more polling", async () => {
    const qc = new QueryClient();
    getMock.mockResolvedValueOnce(suite("running")).mockRejectedValue(new ApiError("bad gateway", 502));
    const { result } = renderHook(
      () => {
        const run = useSuiteRun("s1");
        return { error: run.query.error, stalled: run.stalled, gone: run.gone };
      },
      { wrapper: wrapperWith(qc) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(getMock.mock.calls.length).toBe(4); // 1 good poll + 3 failed polls
    expect(result.current.stalled).toBe(true);
    expect(result.current.gone).toBe(false);
  });

  it("CR-29 two failed polls (an API restart) do not stall a suite run; it finishes", async () => {
    const qc = new QueryClient();
    getMock
      .mockResolvedValueOnce(suite("running"))
      .mockRejectedValueOnce(new ApiError("down", 502))
      .mockRejectedValueOnce(new ApiError("down", 502))
      .mockResolvedValue(suite("done"));
    const { result } = renderHook(
      () => {
        const run = useSuiteRun("s1");
        return { status: run.query.data?.status, stalled: run.stalled };
      },
      { wrapper: wrapperWith(qc) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(result.current).toEqual({ status: "done", stalled: false });
  });

  it("CR-29 each failed poll is one attempt: a case run fails once per poll, not three times", async () => {
    const qc = new QueryClient();
    getMock.mockRejectedValue(new ApiError("bad gateway", 502));
    renderHook(() => useCaseRun("c1", "a1"), { wrapper: wrapperWith(qc) });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(getMock.mock.calls.length).toBe(1); // no hidden retry inside the first poll
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(getMock.mock.calls.length).toBe(2);
  });

  it("CR-28 a 404 after earlier running responses stops polling and reports gone", async () => {
    const qc = new QueryClient();
    getMock.mockResolvedValueOnce(suite("running")).mockRejectedValue(new ApiError("gone", 404));
    const { result } = renderHook(
      () => {
        const run = useSuiteRun("s1");
        return { gone: run.gone, stalled: run.stalled };
      },
      { wrapper: wrapperWith(qc) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(getMock.mock.calls.length).toBe(2);
    expect(result.current).toEqual({ gone: true, stalled: false });
  });
});

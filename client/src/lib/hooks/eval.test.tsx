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

import { useSuiteRun, useCaseRun, useEvalWorkspaceDashboard, useAgentEvalDashboard, useEvalCases } from "./eval";

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
    const { result } = renderHook(() => useSuiteRun("s1"), { wrapper: wrapperWith(qc) });

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
    const { result } = renderHook(() => useCaseRun("c1"), { wrapper: wrapperWith(qc) });

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
    expect(getMock).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("polls the agent dashboard while a history entry is running", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getMock
      .mockResolvedValueOnce({ latest: { status: "done" }, history: [{ status: "running" }, { status: "done" }] })
      .mockResolvedValue({ latest: { status: "done" }, history: [{ status: "done" }] });
    renderHook(() => useAgentEvalDashboard("a1"), { wrapper: wrapperWith(qc) });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(getMock).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(getMock).toHaveBeenCalledTimes(2);
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

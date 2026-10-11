import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: getMock, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});

import { ApiError } from "@/lib/api";
import { decideSuite, useTrackedSuite } from "./eval-tracked-suite";

const r = (id: string, status: "running" | "done" | "failed", cases_done = 1, cases_total = 3) => ({
  id,
  status,
  cases_done,
  cases_total,
});
const detail = (id: string, status: "running" | "done", cases_done = 1) => ({
  ...r(id, status, cases_done),
  agent_id: "a1",
});

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function W({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getMock.mockReset();
});
afterEach(cleanup);

describe("decideSuite", () => {
  const base = { trackedId: null, suite: undefined, failed: false, history: undefined, casesTotal: 3 };
  it("a started id with no data counts as running; an errored one does not", () => {
    expect(decideSuite({ ...base, trackedId: "s1" }).progress).toEqual({ done: 0, total: 3 });
    expect(decideSuite({ ...base, trackedId: "s1", failed: true }).progress).toBeNull();
  });
  it("a running history suite wins over a finished tracked one; a stale row for the same id does not", () => {
    const won = decideSuite({ ...base, trackedId: "s1", suite: r("s1", "done", 3), history: [r("s2", "running", 2)] });
    expect(won.adoptId).toBe("s2");
    const stale = decideSuite({ ...base, trackedId: "s1", suite: r("s1", "done", 3), history: [r("s1", "running")] });
    expect(stale).toEqual({ adoptId: null, progress: null });
    const failedStale = decideSuite({ ...base, trackedId: "s1", failed: true, history: [r("s1", "running")] });
    expect(failedStale).toEqual({ adoptId: null, progress: null });
  });
  it("CR-28 a failed poll (404 or stall) settles the suite even when its last data said running", () => {
    const d = decideSuite({ ...base, trackedId: "s1", suite: r("s1", "running", 2), failed: true, history: [] });
    expect(d).toEqual({ adoptId: null, progress: null });
  });
  it("an unfinished tracked suite is not displaced by another running one in history", () => {
    const d = decideSuite({ ...base, trackedId: "s1", suite: r("s1", "running", 2), history: [r("s2", "running")] });
    expect(d).toEqual({ adoptId: null, progress: { done: 2, total: 3 } });
  });
});

describe("useTrackedSuite", () => {
  it("tracks a suite started here until the poll reports a terminal status", async () => {
    getMock.mockResolvedValueOnce(detail("s1", "running", 1)).mockResolvedValue(detail("s1", "done", 3));
    const { result } = renderHook(() => useTrackedSuite("a1", [], 3), { wrapper: wrapper() });
    expect(result.current.running).toBe(false);
    act(() => result.current.track("s1"));
    expect(result.current.progress).toEqual({ done: 0, total: 3 });
    await waitFor(() => expect(result.current.progress).toEqual({ done: 1, total: 3 }));
  });

  it("CR-11 an adopted suite stays tracked after history stops listing it as running", async () => {
    getMock.mockResolvedValue(detail("s3", "running", 2));
    const { result, rerender } = renderHook(({ h }) => useTrackedSuite("a1", h, 3), {
      wrapper: wrapper(),
      initialProps: { h: [r("s3", "running")] },
    });
    await waitFor(() => expect(result.current.progress).toEqual({ done: 2, total: 3 }));
    rerender({ h: [r("s3", "done", 3)] });
    expect(result.current.trackedId).toBe("s3");
    expect(result.current.running).toBe(true);
  });

  it("CR-21 a suite fetch that fails (404 or other) stops counting as running", async () => {
    getMock.mockRejectedValue(new ApiError("gone", 404));
    const { result } = renderHook(() => useTrackedSuite("a1", [], 3), { wrapper: wrapper() });
    act(() => result.current.track("s1"));
    expect(result.current.running).toBe(true);
    await waitFor(() => expect(result.current.running).toBe(false));
  });

  it("CR-24 after the tracked suite finishes, a stale history row for the same id does not bring Running back", async () => {
    getMock.mockResolvedValue(detail("s1", "done", 3));
    const stale = [r("s1", "running", 3)];
    const { result } = renderHook(() => useTrackedSuite("a1", stale, 3), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.suite?.status).toBe("done"));
    expect(result.current.running).toBe(false);
  });

  it("CR-13 a running suite in history wins over a finished tracked one", async () => {
    getMock.mockImplementation(async (path: string) =>
      path.endsWith("/s1") ? detail("s1", "done", 3) : detail("s2", "running", 2),
    );
    const { result, rerender } = renderHook(({ h }) => useTrackedSuite("a1", h, 3), {
      wrapper: wrapper(),
      initialProps: { h: [] as ReturnType<typeof r>[] },
    });
    act(() => result.current.track("s1"));
    await waitFor(() => expect(result.current.suite?.status).toBe("done"));
    rerender({ h: [r("s2", "running", 2)] });
    await waitFor(() => expect(result.current.trackedId).toBe("s2"));
    expect(result.current.running).toBe(true);
  });

  it("CR-25 switching agents does not show the other agent's suite", async () => {
    getMock.mockResolvedValue(detail("s1", "running", 1));
    const { result, rerender } = renderHook(({ id, h }) => useTrackedSuite(id, h, 3), {
      wrapper: wrapper(),
      initialProps: { id: "a1", h: [] as ReturnType<typeof r>[] | undefined },
    });
    act(() => result.current.track("s1"));
    expect(result.current.running).toBe(true);
    rerender({ id: "a2", h: undefined });
    expect(result.current.trackedId).toBeNull();
    expect(result.current.running).toBe(false);
    rerender({ id: "a1", h: [] });
    expect(result.current.running).toBe(true);
  });
});

describe("useTrackedSuite failure states (CR-28/CR-32)", () => {
  const fakeWrapper = () => {
    const qc = new QueryClient();
    return function W({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    };
  };
  const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("CR-28 a 404 after running responses settles the suite and stops polling", async () => {
    getMock.mockResolvedValueOnce(detail("s1", "running", 1)).mockRejectedValue(new ApiError("gone", 404));
    const { result } = renderHook(() => useTrackedSuite("a1", [], 3), { wrapper: fakeWrapper() });
    act(() => result.current.track("s1"));
    await tick(0);
    expect(result.current.running).toBe(true);
    await tick(30000);
    expect(result.current.running).toBe(false);
    expect(result.current.error?.message).toBe("gone");
    expect(getMock.mock.calls.length).toBe(2);
  });

  it("CR-32 a transient failure with no data keeps showing the history row's progress and keeps polling; a stall shows an error and recovers", async () => {
    getMock.mockRejectedValue(new ApiError("bad gateway", 502));
    const history = [r("s1", "running", 2)];
    const { result } = renderHook(() => useTrackedSuite("a1", history, 3), { wrapper: fakeWrapper() });
    act(() => result.current.track("s1"));
    await tick(0);
    expect(getMock.mock.calls.length).toBe(1);
    expect(result.current.progress).toEqual({ done: 2, total: 3 });
    expect(result.current.error).toBeNull();
    await tick(1500);
    expect(getMock.mock.calls.length).toBe(2);
    expect(result.current.running).toBe(true);
    await tick(30000);
    expect(getMock.mock.calls.length).toBe(3);
    expect(result.current.running).toBe(false);
    expect(result.current.error?.message).toBe("bad gateway");

    // recovery without a reload: tracking a new suite clears the error
    getMock.mockReset();
    getMock.mockResolvedValue(detail("s2", "running", 1));
    act(() => result.current.track("s2"));
    await tick(0);
    expect(result.current.error).toBeNull();
    expect(result.current.running).toBe(true);
  });
});

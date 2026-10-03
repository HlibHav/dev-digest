import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBriefResult } from "@devdigest/shared/contracts/brief";

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      get: getMock,
      post: postMock,
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

import { ApiError } from "@/lib/api";
import * as hooksBarrel from "@/lib/hooks";
import { usePrBrief, useGenerateBrief, type BriefGate } from "./brief";

const PR_ID = "pr-1";
const BRIEF_PATH = `/pulls/${PR_ID}/brief`;

function makeBrief(overrides: Partial<PrBriefResult> = {}): PrBriefResult {
  return {
    summary: "Adds a token-bucket limiter.",
    intent: null,
    blast: null,
    risks: { risks: [] },
    review_focus: [],
    history: null,
    head_sha: "abc1234def5678",
    generated_at: "2026-10-03T10:00:00.000Z",
    model: "openrouter/openai/gpt-4.1-mini",
    tokens_in: 812,
    tokens_out: 340,
    cost_usd: 0.014,
    missing_inputs: [],
    truncated_inputs: [],
    stale: false,
    ...overrides,
  };
}

function briefReads(): number {
  return getMock.mock.calls.filter(([path]) => path === BRIEF_PATH).length;
}

/** Lets pending promises and react-query notifications run; used before a "no more reads" assertion. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

let qc: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(cleanup);

describe("usePrBrief gate (AC-46a)", () => {
  it("is exported from the hooks barrel", () => {
    expect(typeof hooksBarrel.usePrBrief).toBe("function");
    expect(typeof hooksBarrel.useGenerateBrief).toBe("function");
  });

  it("no brief request while the detail gate is unsettled", async () => {
    getMock.mockResolvedValue({ brief: makeBrief() });
    const { result } = renderHook(
      () => usePrBrief(PR_ID, { settled: false, refreshedAt: 0 }),
      { wrapper },
    );

    await flush();

    expect(briefReads()).toBe(0);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("one request after it settles", async () => {
    getMock.mockResolvedValue({ brief: makeBrief() });
    const { result, rerender } = renderHook(
      ({ gate }: { gate: BriefGate }) => usePrBrief(PR_ID, gate),
      { wrapper, initialProps: { gate: { settled: false, refreshedAt: 0 } } },
    );

    // The gate settles AND refreshedAt moves in the same render: that is the first read, not a re-read.
    rerender({ gate: { settled: true, refreshedAt: 100 } });

    await waitFor(() => expect(result.current.data?.summary).toBe("Adds a token-bucket limiter."));
    await flush();

    expect(briefReads()).toBe(1);
    expect(getMock).toHaveBeenCalledWith(BRIEF_PATH);
  });

  it("returns null for a PR without a stored brief", async () => {
    getMock.mockResolvedValue({ brief: null });
    const { result } = renderHook(
      () => usePrBrief(PR_ID, { settled: true, refreshedAt: 1 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
  });

  it("makes no request without a PR id", async () => {
    getMock.mockResolvedValue({ brief: makeBrief() });
    renderHook(() => usePrBrief(null, { settled: true, refreshedAt: 1 }), { wrapper });

    await flush();

    expect(briefReads()).toBe(0);
  });

  it("each changed refreshedAt re-reads the brief (change it twice, count two extra reads)", async () => {
    getMock
      .mockResolvedValueOnce({ brief: makeBrief({ stale: false }) })
      .mockResolvedValueOnce({ brief: makeBrief({ stale: true }) })
      .mockResolvedValueOnce({ brief: makeBrief({ stale: true, summary: "Third read." }) });
    const { result, rerender } = renderHook(
      ({ gate }: { gate: BriefGate }) => usePrBrief(PR_ID, gate),
      { wrapper, initialProps: { gate: { settled: true, refreshedAt: 1 } } },
    );
    await waitFor(() => expect(briefReads()).toBe(1));
    await waitFor(() => expect(result.current.data?.stale).toBe(false));

    // Same refreshedAt on a re-render: no extra read.
    rerender({ gate: { settled: true, refreshedAt: 1 } });
    await flush();
    expect(briefReads()).toBe(1);

    rerender({ gate: { settled: true, refreshedAt: 2 } });
    await waitFor(() => expect(briefReads()).toBe(2));
    await waitFor(() => expect(result.current.data?.stale).toBe(true));

    rerender({ gate: { settled: true, refreshedAt: 3 } });
    await waitFor(() => expect(briefReads()).toBe(3));
    await waitFor(() => expect(result.current.data?.summary).toBe("Third read."));

    await flush();
    expect(briefReads()).toBe(3);
  });
});

function Probe({ detail }: { detail: { status: "pending" | "success" | "error"; updatedAt: number } }) {
  const gate: BriefGate = { settled: detail.status !== "pending", refreshedAt: detail.updatedAt };
  const brief = usePrBrief(PR_ID, gate);
  return <p>{brief.data ? brief.data.summary : "no brief yet"}</p>;
}

function renderProbe(detail: { status: "pending" | "success" | "error"; updatedAt: number }) {
  const view = render(
    <QueryClientProvider client={qc}>
      <Probe detail={detail} />
    </QueryClientProvider>,
  );
  return {
    rerenderWith: (next: typeof detail) =>
      view.rerender(
        <QueryClientProvider client={qc}>
          <Probe detail={next} />
        </QueryClientProvider>,
      ),
  };
}

describe("usePrBrief with a PR detail that failed (component level)", () => {
  it("an errored detail still reads once", async () => {
    getMock.mockResolvedValue({ brief: makeBrief({ summary: "Read despite the error." }) });

    renderProbe({ status: "error", updatedAt: 5 });

    expect(await screen.findByText("Read despite the error.")).toBeInTheDocument();
    await flush();
    expect(briefReads()).toBe(1);
  });

  it("a detail that goes from pending to error reads once, not twice", async () => {
    getMock.mockResolvedValue({ brief: makeBrief({ summary: "Read after error." }) });
    const { rerenderWith } = renderProbe({ status: "pending", updatedAt: 0 });
    await flush();
    expect(briefReads()).toBe(0);

    rerenderWith({ status: "error", updatedAt: 7 });

    expect(await screen.findByText("Read after error.")).toBeInTheDocument();
    await flush();
    expect(briefReads()).toBe(1);
  });
});

describe("useGenerateBrief", () => {
  it("posts once to /pulls/:id/brief and writes the result into the pr-brief cache", async () => {
    const generated = makeBrief({ summary: "Fresh brief.", head_sha: "bbb2222" });
    postMock.mockResolvedValue({ brief: generated });
    const { result } = renderHook(() => useGenerateBrief(PR_ID), { wrapper });

    let returned: PrBriefResult | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync();
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][0]).toBe(BRIEF_PATH);
    expect(returned).toEqual(generated);
    expect(qc.getQueryData(["pr-brief", PR_ID])).toEqual(generated);
  });

  it("surfaces the ApiError code of a failed generation and leaves the cache alone", async () => {
    const stored = makeBrief({ summary: "Stored brief." });
    qc.setQueryData(["pr-brief", PR_ID], stored);
    postMock.mockRejectedValue(new ApiError("No key", 500, "config_error"));
    const { result } = renderHook(() => useGenerateBrief(PR_ID), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toMatchObject({ code: "config_error" });
    });

    expect(qc.getQueryData(["pr-brief", PR_ID])).toEqual(stored);
  });
});

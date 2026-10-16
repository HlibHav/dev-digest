import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { AgentPerformance } from "@devdigest/shared";
import messages from "../../../../../messages/en/agentPerformance.json";

/* Review focus "double-clicking Retry": a second Retry while the first GET is in
   flight must not cancel it and issue another. */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: getMock, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() } };
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/agent-performance",
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ApiError } from "@/lib/api";
import { AgentPerformanceView } from "./AgentPerformanceView";

const EMPTY: AgentPerformance = {
  window: { period: "30d", start: "2026-09-15T12:00:00.000Z", end: "2026-10-15T12:00:00.000Z" },
  small_sample_threshold: 10,
  cost_basis: "estimate",
  billing_reconciliation: "not_connected",
  totals: {
    runs: 0,
    runs_by_status: { running: 0, done: 0, failed: 0, cancelled: 0 },
    total_cost_usd: null,
    unpriced_runs: 0,
    accepted: 0,
    dismissed: 0,
    pending: 0,
    decisions: 0,
    accept_rate: null,
    small_sample: true,
  },
  most_active: null,
  agents: [],
  deleted_agents: null,
  cost_by_agent: [],
  cost_by_model: [],
};

describe("AgentPerformanceView retry", () => {
  it("Retry twice while pending issues one GET", async () => {
    // a loaded dashboard whose background refetch then fails: react-query only cancels
    // an in-flight fetch on refetch when the query already holds data
    getMock.mockResolvedValueOnce(EMPTY);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }} timeZone="UTC" now={new Date("2026-10-15T12:00:00.000Z")}>
          <AgentPerformanceView />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    await screen.findByText("No agent runs in this period");

    getMock.mockRejectedValueOnce(new ApiError("boom", 500, "internal_error"));
    await qc.refetchQueries({ queryKey: ["agent-performance"] });
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(getMock).toHaveBeenCalledTimes(2);

    getMock.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(retry);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(getMock.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(getMock).toHaveBeenCalledTimes(3);
  });
});

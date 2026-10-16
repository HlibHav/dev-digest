import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

/* Red-first for SPEC-2026-10-15-agent-performance AC-42 and AC-48 (plan step 7):
   the agent editor's Stats tab. `StatsTab({ agent })` reads `GET /agents/:id/stats`
   through `useAgentStats` (mocked only at `@/lib/api`) and keeps the period in the
   agent page's address next to `tab=stats` (`next/navigation` mocked as a small URL
   store). Wording asserted is limited to strings the plan fixes; the rest is values. */

const { getMock, nav } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const nav = {
    sp: new URLSearchParams(),
    set(url: string) {
      const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
      nav.sp = new URLSearchParams(q);
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    get: () => nav.sp,
    router: { replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  };
  return { getMock: vi.fn(), nav };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { get: getMock, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
  };
});

vi.mock("next/navigation", async () => {
  const R = await import("react");
  return {
    useSearchParams: () => R.useSyncExternalStore(nav.subscribe, nav.get, nav.get),
    useRouter: () => nav.router,
    usePathname: () => "/agents/sec",
    useParams: () => ({ id: "sec" }),
  };
});

import { ApiError } from "@/lib/api";
import { ToastProvider } from "@/lib/toast";
import { StatsTab } from "./StatsTab";

const NOW = new Date("2026-10-15T12:00:00.000Z");

// model and name hold no digit, so "no number" checks see only metric output
const AGENT: Agent = {
  id: "sec",
  name: "Security Reviewer",
  description: "",
  provider: "openrouter",
  model: "house-model",
  system_prompt: "x",
  enabled: true,
  version: 1,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  uses_intent: false,
};

function stats(over: Partial<AgentStats> = {}): AgentStats {
  return {
    agent_id: "sec",
    agent_name: "Security Reviewer",
    runs: 7,
    findings_total: 15,
    accepted: 9,
    dismissed: 2,
    pending: 3,
    accept_rate: 9 / 11,
    dismiss_rate: 2 / 11,
    avg_findings_per_run: 2.1,
    total_cost_usd: 0.07,
    avg_cost_usd: 0.012,
    avg_latency_ms: 42000,
    findings_by_severity: { CRITICAL: 1, WARNING: 10, SUGGESTION: 4 },
    trend: [],
    window: { period: "30d", start: "2026-09-15T12:00:00.000Z", end: "2026-10-15T12:00:00.000Z" },
    runs_by_status: { running: 0, done: 6, failed: 1, cancelled: 0 },
    unpriced_runs: 1,
    decisions: 11,
    small_sample: false,
    last_run_at: "2026-10-15T11:00:00.000Z",
    by_model: [
      { model: "deepseek/deepseek-v4-flash", runs: 5, total_cost_usd: 0.05, accepted: 8, dismissed: 1, decisions: 9, accept_rate: 8 / 9 },
      { model: "openai/gpt-4.1-mini", runs: 2, total_cost_usd: 0.02, accepted: 1, dismissed: 1, decisions: 2, accept_rate: 0.5 },
    ],
    cost_basis: "estimate",
    ...over,
  };
}

function respondWith(data: AgentStats) {
  getMock.mockImplementation((path: string) =>
    String(path).startsWith("/agents/sec/stats") ? Promise.resolve(data) : Promise.reject(new Error(`unexpected GET ${path}`)),
  );
}

function statsGets(): URLSearchParams[] {
  return getMock.mock.calls
    .map((c) => String(c[0]))
    .filter((p) => p.startsWith("/agents/sec/stats"))
    .map((p) => new URLSearchParams(p.includes("?") ? p.slice(p.indexOf("?") + 1) : ""));
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }} timeZone="UTC" now={NOW}>
        <ToastProvider>
          <StatsTab agent={AGENT} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function textOutsidePeriodLabels(): string {
  return (document.body.textContent ?? "").replace(/30 days|1 day|Custom range|From \(UTC\)|To \(UTC\)/g, "");
}

afterEach(cleanup);
beforeEach(() => {
  getMock.mockReset();
  nav.router.replace.mockReset();
  nav.router.push.mockReset();
  nav.router.replace.mockImplementation((url: string) => nav.set(url));
  nav.sp = new URLSearchParams("tab=stats");
  respondWith(stats());
});

describe("StatsTab", () => {
  it("AC-42 shows the row's metrics, the split by model and the period selector", async () => {
    renderTab();
    expect(await screen.findByText("Split by model")).toBeInTheDocument();
    const gets = statsGets();
    expect(gets).toHaveLength(1);
    expect(gets[0]!.get("period")).toBe("30d");

    const text = document.body.textContent ?? "";
    // runs with per-status counts
    expect(text).toMatch(/6 done/);
    expect(text).toMatch(/1 failed/);
    // total cost, unpriced count, estimate label, avg cost
    expect(text).toContain("$0.07");
    expect(text).toMatch(/1 unpriced/);
    expect(screen.getAllByText("DevDigest estimate (token × price book)").length).toBeGreaterThanOrEqual(1);
    expect(text).toContain("$0.012");
    // avg duration
    expect(text).toContain("42s");
    // accept rate with decisions; 11 decisions → no small-sample badge
    expect(screen.getAllByText("82%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("11 decisions")).toBeInTheDocument();
    expect(screen.queryByText("small sample")).toBeNull();
    // pending and last run
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Last run")).toBeInTheDocument();
    // split by model
    const modelLine = (model: string) => {
      let el: HTMLElement | null = screen.getByText(model);
      while (el && !(el.textContent ?? "").includes("%")) el = el.parentElement;
      return el?.textContent ?? "";
    };
    expect(modelLine("deepseek/deepseek-v4-flash")).toContain("9 decisions");
    expect(modelLine("deepseek/deepseek-v4-flash")).toContain("89%");
    expect(modelLine("openai/gpt-4.1-mini")).toContain("2 decisions");
    expect(modelLine("openai/gpt-4.1-mini")).toContain("50%");
    // the same three period choices, 30 days selected
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1 day" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Custom range" })).toHaveAttribute("aria-pressed", "false");

    // picking a period keeps tab=stats in the agent page address and refetches
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    const url = String(nav.router.replace.mock.calls.at(-1)![0]);
    expect(url.startsWith("/agents/sec?")).toBe(true);
    const q = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect({ tab: q.get("tab"), period: q.get("period") }).toEqual({ tab: "stats", period: "1d" });
    await waitFor(() => expect(statsGets().at(-1)!.get("period")).toBe("1d"));
  });

  it("AC-42 small-sample badge below 10 decisions", async () => {
    respondWith(stats({ accepted: 5, dismissed: 4, decisions: 9, accept_rate: 5 / 9, small_sample: true }));
    renderTab();
    expect(await screen.findByText("small sample")).toBeInTheDocument();
    expect(screen.getAllByText("9 decisions").length).toBeGreaterThanOrEqual(1);
  });

  it("AC-48 no runs", async () => {
    respondWith(
      stats({
        runs: 0,
        findings_total: 0,
        accepted: 0,
        dismissed: 0,
        pending: 0,
        accept_rate: null,
        dismiss_rate: null,
        avg_findings_per_run: null,
        total_cost_usd: null,
        avg_cost_usd: null,
        avg_latency_ms: null,
        findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
        runs_by_status: { running: 0, done: 0, failed: 0, cancelled: 0 },
        unpriced_runs: 0,
        decisions: 0,
        small_sample: true,
        last_run_at: null,
        by_model: [],
      }),
    );
    renderTab();
    expect(await screen.findByText("No runs in this period")).toBeInTheDocument();
    // avg cost, avg duration, accept rate and last run read "—", never 0
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\$0\.00/);
    expect(text).not.toMatch(/(^|[^\d.])0%/);
  });

  it("AC-48 loading shows no digits", async () => {
    getMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderTab();
    await waitFor(() => expect(statsGets()).toHaveLength(1));
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("Split by model")).toBeNull();
    expect(textOutsidePeriodLabels()).not.toMatch(/\d/);
  });

  it("AC-48 error shows Retry", async () => {
    getMock.mockImplementation(() => Promise.reject(new ApiError("boom", 500, "internal_error")));
    renderTab();
    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(textOutsidePeriodLabels()).not.toMatch(/\d/);
    const before = statsGets().length;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(statsGets().length).toBe(before + 1));
  });
});

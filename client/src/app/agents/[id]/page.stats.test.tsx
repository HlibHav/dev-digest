import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentStats } from "@devdigest/shared";
import messages from "../../../../messages/en/agents.json";

/* Red-first for SPEC-2026-10-15-agent-performance AC-41 (plan step 7), page level:
   the real agent page, the real AgentEditor and the real Stats tab. Only the
   boundaries are mocked — `next/navigation` (the address), the agent hooks (the
   agent record) and `@/lib/api` (the stats GET). page.test.tsx keeps the
   tab-routing cases with the editor stubbed. */

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

const AGENT: Agent = {
  id: "ag1",
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
    useParams: () => ({ id: "ag1" }),
    useSearchParams: () => R.useSyncExternalStore(nav.subscribe, nav.get, nav.get),
    useRouter: () => nav.router,
    usePathname: () => "/agents/ag1",
  };
});
vi.mock("../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../lib/hooks/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/hooks/agents")>();
  return {
    ...actual,
    useAgents: () => ({ data: [] }),
    useAgent: () => ({ data: AGENT, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
    useUpdateAgent: () => ({ mutate: vi.fn() }),
  };
});

import { ToastProvider } from "@/lib/toast";
import AgentEditorPage from "./page";

const NOW = new Date("2026-10-15T12:00:00.000Z");

function stats(period: "1d" | "30d"): AgentStats {
  return {
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    runs: 4,
    findings_total: 12,
    accepted: 9,
    dismissed: 2,
    pending: 1,
    accept_rate: 9 / 11,
    dismiss_rate: 2 / 11,
    avg_findings_per_run: 3,
    total_cost_usd: 0.04,
    avg_cost_usd: 0.01,
    avg_latency_ms: 30000,
    findings_by_severity: { CRITICAL: 0, WARNING: 12, SUGGESTION: 0 },
    trend: [],
    window: { period, start: "2026-10-14T12:00:00.000Z", end: "2026-10-15T12:00:00.000Z" },
    runs_by_status: { running: 0, done: 4, failed: 0, cancelled: 0 },
    unpriced_runs: 0,
    decisions: 11,
    small_sample: false,
    last_run_at: "2026-10-15T10:00:00.000Z",
    by_model: [
      { model: "deepseek/deepseek-v4-flash", runs: 3, total_cost_usd: 0.03, accepted: 8, dismissed: 1, decisions: 9, accept_rate: 8 / 9 },
      { model: "openai/gpt-4.1-mini", runs: 1, total_cost_usd: 0.01, accepted: 1, dismissed: 1, decisions: 2, accept_rate: 0.5 },
    ],
    cost_basis: "estimate",
  };
}

function statsGets(): URLSearchParams[] {
  return getMock.mock.calls
    .map((c) => String(c[0]))
    .filter((p) => p.startsWith("/agents/ag1/stats"))
    .map((p) => new URLSearchParams(p.includes("?") ? p.slice(p.indexOf("?") + 1) : ""));
}

function renderPage(search: string) {
  nav.sp = new URLSearchParams(search);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }} timeZone="UTC" now={NOW}>
        <ToastProvider>
          <AgentEditorPage />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  getMock.mockReset();
  nav.router.replace.mockReset();
  nav.router.replace.mockImplementation((url: string) => nav.set(url));
  getMock.mockImplementation((path: string) => {
    const p = String(path);
    if (p.startsWith("/agents/ag1/stats")) {
      const period = new URLSearchParams(p.slice(p.indexOf("?") + 1)).get("period") === "1d" ? "1d" : "30d";
      return Promise.resolve(stats(period));
    }
    return Promise.reject(new Error(`unexpected GET ${p}`));
  });
});

describe("AgentEditorPage Stats tab", () => {
  it("AC-41 ?tab=stats&period=1d opens Stats with 1 day selected", async () => {
    renderPage("tab=stats&period=1d");
    expect(screen.getByRole("button", { name: "Stats" })).toBeInTheDocument();
    expect(await screen.findByText("Split by model")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 day" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(statsGets()).toHaveLength(1));
    expect(statsGets()[0]!.get("period")).toBe("1d");
    expect(screen.getByText("11 decisions")).toBeInTheDocument();
  });

  it("AC-41 ?tab=stats with no period selects 30 days", async () => {
    renderPage("tab=stats");
    expect(await screen.findByText("Split by model")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(statsGets()).toHaveLength(1));
    expect(statsGets()[0]!.get("period")).toBe("30d");
  });
});

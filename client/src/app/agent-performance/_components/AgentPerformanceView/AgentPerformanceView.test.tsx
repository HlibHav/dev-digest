import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { AgentPerformance, AgentStats, AgentStatsMetrics } from "@devdigest/shared";
import messages from "../../../../../messages/en/agentPerformance.json";

/* Red-first for SPEC-2026-10-15-agent-performance AC-25, AC-47, AC-26, AC-27, AC-46,
   AC-28 … AC-39 (docs/plans/2026-10-15-agent-performance.md, steps 5–6).

   Boundaries mocked: `@/lib/api` (`api.get`, so request counts are real react-query
   behaviour) and `next/navigation` (a small URL store: `router.replace` writes it,
   `useSearchParams` re-renders from it). Everything else is real: the view, the
   `useAgentPerformance` hook, the period selector and the model split.
   Strings asserted are the ones fixed under the plan's "Contracts & data → i18n". */

const { getMock, nav } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const nav = {
    sp: new URLSearchParams(),
    listeners,
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
    router: {
      replace: vi.fn(),
      push: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    },
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
    usePathname: () => "/agent-performance",
    useParams: () => ({}),
  };
});

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ApiError } from "@/lib/api";
import { ToastProvider } from "@/lib/toast";
import { AgentPerformanceView } from "./AgentPerformanceView";

// ---------- fixtures ----------

const NOW = new Date("2026-10-15T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const WIN30 = { period: "30d" as const, start: "2026-09-15T12:00:00.000Z", end: "2026-10-15T12:00:00.000Z" };

function metrics(over: Partial<AgentStatsMetrics> = {}): AgentStatsMetrics {
  return {
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
    trend: [],
    window: WIN30,
    runs_by_status: { running: 0, done: 0, failed: 0, cancelled: 0 },
    unpriced_runs: 0,
    decisions: 0,
    small_sample: true,
    last_run_at: null,
    by_model: [],
    cost_basis: "estimate",
    ...over,
  };
}

function agentRow(id: string, name: string, over: Partial<AgentStatsMetrics> = {}): AgentStats {
  return { ...metrics(over), agent_id: id, agent_name: name };
}

const SEC = agentRow("sec", "Security Reviewer", {
  runs: 7,
  runs_by_status: { running: 0, done: 6, failed: 1, cancelled: 0 },
  accepted: 10,
  dismissed: 10,
  pending: 1,
  decisions: 20,
  accept_rate: 0.5,
  small_sample: false,
  total_cost_usd: 0.07,
  avg_cost_usd: 0.01,
  avg_latency_ms: 42000,
  last_run_at: hoursAgo(1),
  by_model: [
    { model: "deepseek/deepseek-v4-flash", runs: 5, total_cost_usd: 0.05, accepted: 9, dismissed: 6, decisions: 15, accept_rate: 0.6 },
    { model: "openai/gpt-4.1-mini", runs: 2, total_cost_usd: 0.02, accepted: 1, dismissed: 4, decisions: 5, accept_rate: 0.2 },
  ],
});
const GEN = agentRow("gen", "General Reviewer", {
  runs: 4,
  runs_by_status: { running: 0, done: 4, failed: 0, cancelled: 0 },
  accepted: 3,
  decisions: 3,
  accept_rate: 1,
  small_sample: true,
  total_cost_usd: 0.008,
  avg_cost_usd: 0.002,
  avg_latency_ms: 50000,
  last_run_at: hoursAgo(5),
});
const PERF = agentRow("perf", "Performance Reviewer", {
  runs: 2,
  runs_by_status: { running: 0, done: 2, failed: 0, cancelled: 0 },
  pending: 1,
  total_cost_usd: 0.01,
  avg_cost_usd: 0.005,
  avg_latency_ms: 20000,
  last_run_at: hoursAgo(2),
});
const TQ = agentRow("tq", "Test Quality Reviewer");
const DELETED = metrics({
  runs: 1,
  runs_by_status: { running: 0, done: 1, failed: 0, cancelled: 0 },
  accepted: 1,
  dismissed: 1,
  decisions: 2,
  accept_rate: 0.5,
  total_cost_usd: 0.01,
  avg_cost_usd: 0.01,
  avg_latency_ms: 28000,
  last_run_at: hoursAgo(8),
});

function perf(over: Partial<AgentPerformance> = {}): AgentPerformance {
  return {
    window: WIN30,
    small_sample_threshold: 10,
    cost_basis: "estimate",
    billing_reconciliation: "not_connected",
    totals: {
      runs: 14,
      runs_by_status: { running: 1, done: 11, failed: 2, cancelled: 0 },
      total_cost_usd: 0.098,
      unpriced_runs: 1,
      accepted: 9,
      dismissed: 3,
      pending: 2,
      decisions: 12,
      accept_rate: 0.75,
      small_sample: false,
    },
    most_active: { agent_id: "sec", agent_name: "Security Reviewer", runs: 7, accept_rate: 0.5, decisions: 20 },
    // deliberately not in display order: the view sorts
    agents: [TQ, PERF, GEN, SEC],
    deleted_agents: DELETED,
    cost_by_agent: [
      { agent_id: "sec", agent_name: "Security Reviewer", runs: 7, total_cost_usd: 0.07 },
      { agent_id: "gen", agent_name: "General Reviewer", runs: 4, total_cost_usd: 0.008 },
      { agent_id: "perf", agent_name: "Performance Reviewer", runs: 2, total_cost_usd: 0.01 },
      { agent_id: null, agent_name: null, runs: 1, total_cost_usd: 0.01 },
    ],
    cost_by_model: [
      { model: "deepseek/deepseek-v4-flash", runs: 9, total_cost_usd: 0.063 },
      { model: "openai/gpt-4.1-mini", runs: 2, total_cost_usd: null },
      { model: null, runs: 3, total_cost_usd: 0.035 },
    ],
    ...over,
  };
}

// ---------- helpers ----------

const NAMES = ["Security Reviewer", "General Reviewer", "Performance Reviewer", "Test Quality Reviewer", "Deleted agent"];

function respondWith(data: AgentPerformance | ((path: string) => Promise<unknown>)) {
  getMock.mockImplementation((path: string) => {
    if (typeof data === "function") return data(path);
    if (String(path).startsWith("/agent-performance")) return Promise.resolve(data);
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

function dashboardGets(): URLSearchParams[] {
  return getMock.mock.calls
    .map((c) => String(c[0]))
    .filter((p) => p.startsWith("/agent-performance"))
    .map((p) => new URLSearchParams(p.includes("?") ? p.slice(p.indexOf("?") + 1) : ""));
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }} timeZone="UTC" now={NOW}>
        <ToastProvider>
          <AgentPerformanceView />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Data rows of the agent table, in display order, by the agent name each carries. */
function tableOrder(): string[] {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .map((r) => NAMES.find((n) => (r.textContent ?? "").includes(n)))
    .filter((n): n is string => n !== undefined)
    .filter((n, i, all) => all.indexOf(n) === i);
}

function tableRowOf(name: string): HTMLElement {
  const table = screen.getByRole("table");
  const row = within(table)
    .getAllByRole("row")
    .find((r) => (r.textContent ?? "").includes(name));
  if (!row) throw new Error(`no table row for ${name}`);
  return row;
}

/** Smallest ancestor of the element with `text` whose content also includes every `needle`. */
function blockOf(text: string, needles: string[]): HTMLElement {
  let el: HTMLElement | null = screen.getByText(text);
  while (el && !needles.every((n) => (el!.textContent ?? "").includes(n))) el = el.parentElement;
  if (!el) throw new Error(`no block around "${text}" containing ${needles.join(", ")}`);
  return el;
}

const CARD_TITLES = [
  "Total runs (30 days)",
  "Total cost (30 days)",
  "Avg accept rate (30 days)",
  "Most-active agent (30 days)",
];

/** A summary card: the block around its title that holds `needles`, and no other card or the table. */
function cardOf(title: string, needles: string[]): HTMLElement {
  const card = blockOf(title, needles);
  expect(card.querySelector("table")).toBeNull();
  for (const other of CARD_TITLES.filter((t) => t !== title)) {
    expect(card.textContent ?? "").not.toContain(other);
  }
  return card;
}

/** Page text with the period labels removed, for "no number" checks. */
function digitsOutsidePeriodLabels(): string {
  return (document.body.textContent ?? "").replace(/30 days|1 day|Custom range|From \(UTC\)|To \(UTC\)/g, "");
}

afterEach(cleanup);
beforeEach(() => {
  getMock.mockReset();
  nav.router.replace.mockReset();
  nav.router.push.mockReset();
  nav.router.replace.mockImplementation((url: string) => nav.set(url));
  nav.sp = new URLSearchParams();
  respondWith(perf());
});

// ---------- tests ----------

describe("AgentPerformanceView", () => {
  it("AC-25 opens on 30 days and offers 1 day, 30 days and Custom range", async () => {
    renderView();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1 day" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Custom range" })).toHaveAttribute("aria-pressed", "false");
    await screen.findByText("Total runs (30 days)");
    const gets = dashboardGets();
    expect(gets).toHaveLength(1);
    expect(gets[0]!.get("period")).toBe("30d");
  });

  it("AC-47 the picked period is kept in the address and survives a reload", async () => {
    renderView();
    await screen.findByText("Total runs (30 days)");
    fireEvent.click(screen.getByRole("button", { name: "1 day" }));

    expect(nav.router.replace).toHaveBeenCalled();
    const url = String(nav.router.replace.mock.calls.at(-1)![0]);
    expect(url.startsWith("/agent-performance?")).toBe(true);
    expect(new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("period")).toBe("1d");
    await waitFor(() => expect(screen.getByRole("button", { name: "1 day" })).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(dashboardGets().at(-1)!.get("period")).toBe("1d"));

    // reload: a fresh render from the same address
    cleanup();
    getMock.mockClear();
    renderView();
    expect(screen.getByRole("button", { name: "1 day" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(dashboardGets()).toHaveLength(1));
    expect(dashboardGets()[0]!.get("period")).toBe("1d");
  });

  it("AC-26 Custom range requests nothing until both UTC dates are set and valid", async () => {
    renderView();
    await screen.findByText("Total runs (30 days)");
    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    const customGets = () => dashboardGets().filter((q) => q.get("period") === "custom");

    const from = await screen.findByLabelText("From (UTC)");
    const to = screen.getByLabelText("To (UTC)");
    expect(from).toHaveAttribute("type", "date");
    expect(to).toHaveAttribute("type", "date");
    expect(customGets()).toHaveLength(0);

    fireEvent.change(from, { target: { value: "2026-10-01" } });
    await waitFor(() => expect(screen.getByLabelText("From (UTC)")).toHaveValue("2026-10-01"));
    expect(customGets()).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("To (UTC)"), { target: { value: "2026-10-07" } });
    await waitFor(() => expect(customGets()).toHaveLength(1));
    const q = customGets()[0]!;
    expect({ period: q.get("period"), from: q.get("from"), to: q.get("to") }).toEqual({
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-07",
    });
  });

  it("AC-27 four cards name the period and show their values", async () => {
    renderView();
    await screen.findByText("Total runs (30 days)");

    const runs = cardOf("Total runs (30 days)", ["14"]);
    expect(within(runs).getByText("14")).toBeInTheDocument();
    expect(runs.textContent).toMatch(/11 done/);
    expect(runs.textContent).toMatch(/incl\. 2 failed/);
    expect(runs.textContent).toMatch(/incl\. 1 running/);
    expect(runs.textContent).not.toMatch(/cancelled/);

    const cost = cardOf("Total cost (30 days)", ["$0.098"]);
    expect(within(cost).getByText("1 unpriced run")).toBeInTheDocument();

    const rate = cardOf("Avg accept rate (30 days)", ["75%"]);
    expect(within(rate).getByText("12 decisions")).toBeInTheDocument();
    expect(within(rate).getByText("Pooled across agents: all accepted ÷ all decisions")).toBeInTheDocument();
    expect(within(rate).queryByText("small sample")).toBeNull();

    const active = cardOf("Most-active agent (30 days)", ["Security Reviewer"]);
    expect(active.textContent).toContain("7");
    expect(active.textContent).toContain("50%");
    expect(within(active).getByText("20 decisions")).toBeInTheDocument();

    // the headline badge appears when the pooled decisions are below 10
    cleanup();
    respondWith(
      perf({ totals: { ...perf().totals, accepted: 3, dismissed: 1, decisions: 4, accept_rate: 0.75, small_sample: true } }),
    );
    renderView();
    await screen.findByText("Avg accept rate (30 days)");
    const smallRate = cardOf("Avg accept rate (30 days)", ["4 decisions"]);
    expect(within(smallRate).getByText("small sample")).toBeInTheDocument();
  });

  it("AC-46 the page states what Runs and the completed-run averages cover", async () => {
    renderView();
    await screen.findByText("Total runs (30 days)");
    expect(
      screen.getByText(
        "Runs counts every run in the period (running, done, failed, cancelled). Avg cost, Avg duration and the unpriced count cover completed runs only.",
      ),
    ).toBeInTheDocument();
  });

  it("AC-28 every cost figure is labelled an estimate and billing is not connected", async () => {
    renderView();
    await screen.findByText("Total runs (30 days)");
    const estimate = "DevDigest estimate (token × price book)";
    const cost = cardOf("Total cost (30 days)", ["$0.098", estimate]);
    expect(within(cost).getByText("Reconciled billing: not connected")).toBeInTheDocument();
    // the table's cost column and the breakdown carry the label too
    expect(within(screen.getByRole("table")).getAllByText(estimate).length).toBeGreaterThanOrEqual(1);
    const breakdown = blockOf("Cost breakdown", ["By agent", "By model (run model)", estimate]);
    expect(breakdown.querySelector("table")).toBeNull();
    // no reconciled amount anywhere: the only "reconciled" text is the not-connected line
    expect(screen.getAllByText(/reconciled/i)).toHaveLength(1);
  });

  it("AC-29 the table has the seven columns and a small-sample badge below 10 decisions only", async () => {
    respondWith(
      perf({
        agents: [
          agentRow("nine", "Nine Decisions", { runs: 3, accepted: 6, dismissed: 3, decisions: 9, accept_rate: 6 / 9, small_sample: true, last_run_at: hoursAgo(1) }),
          agentRow("many", "Many Decisions", { runs: 5, accepted: 10, dismissed: 5, decisions: 15, accept_rate: 10 / 15, small_sample: false, last_run_at: hoursAgo(2) }),
        ],
        deleted_agents: null,
      }),
    );
    renderView();
    const table = await screen.findByRole("table");
    for (const col of [/^Agent/, /^Runs/, /^Avg cost/, /^Avg duration/, /^Accept rate/, /^Last run/, /^View/]) {
      expect(within(table).getByRole("columnheader", { name: col })).toBeInTheDocument();
    }
    const nine = within(table).getAllByRole("row").find((r) => r.textContent?.includes("Nine Decisions"))!;
    const many = within(table).getAllByRole("row").find((r) => r.textContent?.includes("Many Decisions"))!;
    expect(within(nine).getByText("9 decisions")).toBeInTheDocument();
    expect(within(nine).getByText("small sample")).toBeInTheDocument();
    expect(within(many).getByText("15 decisions")).toBeInTheDocument();
    expect(within(many).queryByText("small sample")).toBeNull();
  });

  it("AC-30 default order: ≥10 decisions, then 1–9, then none, Deleted agent last", async () => {
    renderView();
    await screen.findByRole("table");
    expect(tableOrder()).toEqual([
      "Security Reviewer", // 20 decisions at 50%
      "General Reviewer", // 3 decisions at 100%
      "Performance Reviewer", // 0 decisions, 2 runs
      "Test Quality Reviewer", // 0 decisions, 0 runs
      "Deleted agent",
    ]);

    // ties inside a group break by runs, then by name A→Z
    cleanup();
    respondWith(
      perf({
        agents: [
          agentRow("z", "Zulu", { runs: 3, accepted: 6, dismissed: 6, decisions: 12, accept_rate: 0.5, small_sample: false }),
          agentRow("b", "Bravo", { runs: 3, accepted: 6, dismissed: 6, decisions: 12, accept_rate: 0.5, small_sample: false }),
          agentRow("a", "Alpha", { runs: 1, accepted: 6, dismissed: 6, decisions: 12, accept_rate: 0.5, small_sample: false }),
        ],
        deleted_agents: null,
      }),
    );
    renderView();
    const table = await screen.findByRole("table");
    const order = within(table)
      .getAllByRole("row")
      .map((r) => ["Alpha", "Bravo", "Zulu"].find((n) => r.textContent?.includes(n)))
      .filter(Boolean);
    expect(order).toEqual(["Bravo", "Zulu", "Alpha"]);
  });

  it("AC-31 sorting by any column reorders without a request, empties last, Deleted agent last", async () => {
    renderView();
    const table = await screen.findByRole("table");
    const before = getMock.mock.calls.length;
    const click = (name: RegExp) => fireEvent.click(within(table).getByRole("button", { name }));
    const S = "Security Reviewer";
    const G = "General Reviewer";
    const P = "Performance Reviewer";
    const T = "Test Quality Reviewer";
    const D = "Deleted agent";

    // [ascending, descending] among live agents; empty values stay last either way
    const cases: { col: RegExp; asc: string[]; desc: string[] }[] = [
      { col: /^Agent/, asc: [G, P, S, T], desc: [T, S, P, G] },
      { col: /^Runs/, asc: [T, P, G, S], desc: [S, G, P, T] },
      { col: /^Avg cost/, asc: [G, P, S, T], desc: [S, P, G, T] },
      { col: /^Avg duration/, asc: [P, S, G, T], desc: [G, S, P, T] },
      { col: /^Last run/, asc: [G, P, S, T], desc: [S, P, G, T] },
    ];
    for (const c of cases) {
      click(c.col);
      const first = tableOrder();
      click(c.col);
      const second = tableOrder();
      expect(first.at(-1)).toBe(D);
      expect(second.at(-1)).toBe(D);
      expect([first.slice(0, -1), second.slice(0, -1)]).toContainEqual(c.asc);
      expect([first.slice(0, -1), second.slice(0, -1)]).toContainEqual(c.desc);
    }

    // accept rate keeps the small-sample grouping in both directions
    click(/^Accept rate/);
    const r1 = tableOrder();
    click(/^Accept rate/);
    const r2 = tableOrder();
    for (const order of [r1, r2]) {
      expect(order.slice(0, 2)).toEqual([S, G]);
      expect(order.at(-1)).toBe(D);
    }

    expect(getMock.mock.calls.length).toBe(before);
  });

  it("AC-32 an agent with no runs shows 'No runs in this period' and dashes", async () => {
    renderView();
    await screen.findByRole("table");
    const row = tableRowOf("Test Quality Reviewer");
    expect(within(row).getByText("No runs in this period")).toBeInTheDocument();
    // avg cost, avg duration, accept rate and last run
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(row.textContent).not.toMatch(/\$0\.00|(^|[^\d.])0%/);
  });

  it("AC-33 null metrics render as — and never as 0, $0.00 or 0%", async () => {
    respondWith(
      perf({
        totals: {
          runs: 1,
          runs_by_status: { running: 0, done: 0, failed: 1, cancelled: 0 },
          total_cost_usd: null,
          unpriced_runs: 0,
          accepted: 0,
          dismissed: 0,
          pending: 0,
          decisions: 0,
          accept_rate: null,
          small_sample: true,
        },
        most_active: { agent_id: "nul", agent_name: "Null Agent", runs: 1, accept_rate: null, decisions: 0 },
        agents: [
          agentRow("nul", "Null Agent", {
            runs: 1,
            runs_by_status: { running: 0, done: 0, failed: 1, cancelled: 0 },
            last_run_at: hoursAgo(3),
          }),
        ],
        deleted_agents: null,
        cost_by_agent: [{ agent_id: "nul", agent_name: "Null Agent", runs: 1, total_cost_usd: null }],
        cost_by_model: [{ model: "model-x", runs: 1, total_cost_usd: null }],
      }),
    );
    renderView();
    await screen.findByRole("table");
    expect(within(cardOf("Total cost (30 days)", ["—"])).getAllByText("—").length).toBeGreaterThanOrEqual(1);
    expect(within(cardOf("Avg accept rate (30 days)", ["—"])).getAllByText("—").length).toBeGreaterThanOrEqual(1);
    const row = tableRowOf("Null Agent");
    // avg cost, avg duration, accept rate
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\$0\.00/);
    expect(text).not.toMatch(/(^|[^\d.])0%/);
  });

  it("AC-34 while loading, placeholders replace cards, rows and breakdown, with no number", async () => {
    getMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderView();
    await waitFor(() => expect(dashboardGets()).toHaveLength(1));
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("Total runs (30 days)")).toBeNull();
    expect(screen.queryByText("Security Reviewer")).toBeNull();
    expect(digitsOutsidePeriodLabels()).not.toMatch(/\d/);
  });

  it("AC-35 a failed request shows an error with Retry and no number; Retry issues one GET", async () => {
    getMock.mockImplementation(() => Promise.reject(new ApiError("boom", 500, "internal_error")));
    renderView();
    expect(await screen.findByText("Could not load agent performance.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Total runs (30 days)")).toBeNull();
    expect(digitsOutsidePeriodLabels()).not.toMatch(/\d/);

    const before = dashboardGets().length;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(dashboardGets().length).toBe(before + 1));
  });

  it("AC-36 no run in the period shows the page empty state and a usable selector", async () => {
    respondWith(
      perf({
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
        agents: [agentRow("a1", "Idle One"), agentRow("a2", "Idle Two")],
        deleted_agents: null,
        cost_by_agent: [],
        cost_by_model: [],
      }),
    );
    renderView();
    expect(await screen.findByText("No agent runs in this period")).toBeInTheDocument();
    expect(screen.queryByText("Total runs (30 days)")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Cost breakdown")).toBeNull();
    expect(digitsOutsidePeriodLabels()).not.toMatch(/\d/);

    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    await waitFor(() => expect(dashboardGets().at(-1)!.get("period")).toBe("1d"));
  });

  it("AC-37 the cost breakdown lists every bucket by agent and by run model with its cost", async () => {
    renderView();
    await screen.findByRole("table");
    const breakdown = blockOf("Cost breakdown", ["By agent", "By model (run model)", "Unknown model", "Deleted agent"]);
    expect(breakdown.querySelector("table")).toBeNull();
    /** The line of a bucket: the smallest block around its name that also shows a cost. */
    const line = (name: string) => {
      let el: HTMLElement | null = within(breakdown).getByText(name);
      while (el && !/\$|—/.test(el.textContent ?? "")) el = el.parentElement;
      return el!.textContent ?? "";
    };
    expect(line("Security Reviewer")).toContain("$0.07");
    expect(line("General Reviewer")).toContain("$0.008");
    expect(line("Performance Reviewer")).toContain("$0.01");
    expect(line("Deleted agent")).toContain("$0.01");
    expect(line("deepseek/deepseek-v4-flash")).toContain("$0.063");
    expect(line("openai/gpt-4.1-mini")).toContain("—");
    expect(line("Unknown model")).toContain("$0.035");
    // an agent with no runs has no bucket
    expect(within(breakdown).queryByText("Test Quality Reviewer")).toBeNull();
  });

  it("AC-38 expanding a row shows its split by model from loaded data, with no request", async () => {
    renderView();
    await screen.findByRole("table");
    const before = getMock.mock.calls.length;
    const table = screen.getByRole("table");
    expect(within(table).queryByText("deepseek/deepseek-v4-flash")).toBeNull();

    const expand = within(tableRowOf("Security Reviewer")).getByRole("button", { name: /Models/ });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);
    expect(expand).toHaveAttribute("aria-expanded", "true");

    /** A model line: the smallest block around the model name that also shows a rate. */
    const modelLine = (model: string) => {
      let el: HTMLElement | null = within(table).getByText(model);
      while (el && !(el.textContent ?? "").includes("%")) el = el.parentElement;
      return el?.textContent ?? "";
    };
    expect(modelLine("deepseek/deepseek-v4-flash")).toContain("15 decisions");
    expect(modelLine("deepseek/deepseek-v4-flash")).toContain("60%");
    expect(modelLine("openai/gpt-4.1-mini")).toContain("5 decisions");
    expect(modelLine("openai/gpt-4.1-mini")).toContain("20%");
    expect(getMock.mock.calls.length).toBe(before);
  });

  it("AC-39 View opens the agent's Stats tab with the same custom dates", async () => {
    nav.sp = new URLSearchParams("period=custom&from=2026-10-01&to=2026-10-07");
    respondWith(perf({ window: { period: "custom", start: "2026-10-01T00:00:00.000Z", end: "2026-10-08T00:00:00.000Z" } }));
    renderView();
    await screen.findByRole("table");
    expect(within(tableRowOf("Deleted agent")).queryByText("View")).toBeNull();

    const view = within(tableRowOf("Security Reviewer")).getByText("View");
    fireEvent.click(view);
    const target = nav.router.push.mock.calls.at(-1)?.[0] ?? view.closest("a")?.getAttribute("href");
    expect(typeof target).toBe("string");
    const url = String(target);
    expect(url.startsWith("/agents/sec?")).toBe(true);
    const q = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect({ tab: q.get("tab"), period: q.get("period"), from: q.get("from"), to: q.get("to") }).toEqual({
      tab: "stats",
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-07",
    });
  });
});

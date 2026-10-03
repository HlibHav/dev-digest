import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../messages/en/onboarding.json";

/**
 * Red-first for SPEC-2026-10-02-onboarding-tour (client half): AC-3, 4, 5, 7
 * (render), 6 (empty state), 8, 14, 15 (unit), 17/18/19/23 (status lines),
 * 21 (notice), 25 (banner), 26, 29, 30, 32, 34, 35 (render), 37, 38, 39.
 *
 * Every string asserted is copied from the AC text. The component, the hooks
 * module and the route folder don't exist yet, so this file fails on the
 * missing `./OnboardingTourView` module until lane 6 creates it.
 *
 * Roles the plan pins (step 12): a section header is a <button aria-expanded>
 * named by the section title; an "On this page" entry is an <a href="#tour-<kind>">;
 * Open is <a aria-label="Open {path} on GitHub" target="_blank">; Copy is
 * <button aria-label="Copy {command}">; Generating is role="status".
 */

type Item = {
  path?: string | null;
  title?: string | null;
  reason?: string | null;
  command?: string | null;
  note?: string | null;
  reason_source: "llm" | "deterministic";
};
type Section = {
  kind: string;
  title: string;
  body: string;
  diagram: string | null;
  links: { label: string; path: string }[];
  items: Item[] | null;
  notice: string | null;
};
type Tour = {
  generated_at: string;
  commit_sha: string;
  source: "llm" | "skeleton";
  skeleton_reason: "llm_failed" | "timed_out" | "index_unavailable" | "error" | null;
  index: { status: string; files_indexed: number; files_total: number };
  llm: {
    calls: number;
    provider?: string | null;
    model?: string | null;
    tokens_in?: number | null;
    tokens_out?: number | null;
    cost_usd?: number | null;
    duration_ms?: number | null;
  };
  last_failure?: { reason: string; at: string; llm: { calls: number } } | null;
  sections: Section[];
};
type View = {
  cloned: boolean;
  state: "none" | "generating" | "ready";
  repo_full_name: string;
  index_commit_sha: string | null;
  tour: Tour | null;
};

const state = vi.hoisted(() => ({
  view: null as unknown,
  generate: vi.fn(),
  mermaidParse: vi.fn(),
  mermaidRender: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/repos/r1/onboarding",
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/hooks/onboarding", () => ({
  useOnboarding: () => ({
    data: state.view,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGenerateOnboarding: () => ({ mutate: state.generate, isPending: false }),
}));
// jsdom cannot lay mermaid out: parse answers true or false, render returns an svg.
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: (...args: unknown[]) => state.mermaidParse(...args),
    render: (...args: unknown[]) => state.mermaidRender(...args),
  },
}));

import { OnboardingTourView } from "./OnboardingTourView";

const TITLES = [
  "Architecture overview",
  "Critical paths",
  "How to run locally",
  "Guided reading path",
  "First tasks",
];
const KINDS = ["architecture", "critical_paths", "run_locally", "reading_path", "first_tasks"];

function section(kind: string, over: Partial<Section> = {}): Section {
  const i = KINDS.indexOf(kind);
  return {
    kind,
    title: TITLES[i]!,
    body: "",
    diagram: null,
    links: [],
    items: null,
    notice: null,
    ...over,
  };
}

function sections(over: Record<string, Partial<Section>> = {}): Section[] {
  const base: Record<string, Partial<Section>> = {
    architecture: { body: "Hono is a small web framework." },
    critical_paths: {
      items: [{ path: "src/hono.ts", reason: "Core app class", reason_source: "llm" }],
    },
    run_locally: { items: [{ command: "pnpm install", reason_source: "deterministic" }] },
    reading_path: {
      items: [{ path: "src/context.ts", reason: "imported by 9 files", reason_source: "deterministic" }],
    },
    first_tasks: {
      items: [
        { title: "Add a route test", path: "src/request.ts", reason: "Small and self-contained", reason_source: "llm" },
      ],
    },
  };
  return KINDS.map((k) => section(k, { ...base[k], ...over[k] }));
}

function tour(over: Partial<Tour> = {}): Tour {
  return {
    generated_at: "2026-10-03T10:00:00.000Z",
    commit_sha: "abc123",
    source: "llm",
    skeleton_reason: null,
    index: { status: "full", files_indexed: 812, files_total: 812 },
    llm: {
      calls: 1,
      provider: "openrouter",
      model: "openai/gpt-4.1-mini",
      tokens_in: 1200,
      tokens_out: 300,
      cost_usd: 0.0021,
      duration_ms: 9000,
    },
    last_failure: null,
    sections: sections(),
    ...over,
  };
}

function setView(over: Partial<View> = {}) {
  state.view = {
    cloned: true,
    state: "ready",
    repo_full_name: "honojs/hono",
    index_commit_sha: "abc123",
    tour: tour(),
    ...over,
  } satisfies View;
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <OnboardingTourView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Whole-page text with whitespace collapsed, for sublines split across spans. */
function pageText() {
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

let writeText: ReturnType<typeof vi.fn>;
let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Only Date is faked: userEvent-free tests and waitFor keep real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00.000Z"));
  state.generate = vi.fn();
  state.mermaidParse = vi.fn().mockResolvedValue(true);
  state.mermaidRender = vi.fn().mockResolvedValue({ svg: '<svg aria-label="diagram"></svg>' });
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
  // Any repo lookup the page makes for its own "repo not found" guard finds r1.
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: "r1",
              full_name: "honojs/hono",
              owner: "honojs",
              name: "hono",
              default_branch: "main",
              last_polled_at: null,
              clone_path: "/tmp/hono",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );
  setView();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function expandedHeaders() {
  return screen.getAllByRole("button", { expanded: true });
}
function anchorEntries() {
  return screen.getAllByRole("link").filter((a) => (a.getAttribute("href") ?? "").startsWith("#tour-"));
}

describe("OnboardingTourView", () => {
  it("five headings and five anchors in order", () => {
    renderView();
    const headers = expandedHeaders();
    expect(headers).toHaveLength(5);
    TITLES.forEach((title, i) => expect(headers[i]!.textContent).toContain(title));

    const anchors = anchorEntries();
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual(KINDS.map((k) => `#tour-${k}`));
    TITLES.forEach((title, i) => expect(anchors[i]!.textContent).toContain(title));
    expect(pageText()).toContain("On this page");
  });

  it("anchor click scrolls First tasks into view", () => {
    renderView();
    const entry = anchorEntries().find((a) => a.textContent?.includes("First tasks"))!;
    fireEvent.click(entry);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // the call happened on the First tasks section element
    expect((scrollIntoView.mock.contexts[0] as HTMLElement).id).toBe("tour-first_tasks");
  });

  it("header collapses and expands Critical paths", () => {
    renderView();
    expect(screen.getByText("src/hono.ts")).toBeInTheDocument();
    const header = screen.getByRole("button", { name: /Critical paths/ });
    expect(header).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(header);
    expect(screen.getByRole("button", { name: /Critical paths/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/hono.ts")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Critical paths/ }));
    expect(screen.getByRole("button", { name: /Critical paths/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/hono.ts")).toBeInTheDocument();
  });

  it("empty state shows Generate onboarding tour", () => {
    setView({ state: "none", tour: null, index_commit_sha: null });
    renderView();
    expect(screen.getAllByText("Generate onboarding tour").length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", { name: "Generate onboarding tour" }));
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(state.generate.mock.calls[0]![0]).toBe("r1");
  });

  it("not cloned notice, no Generate", () => {
    setView({ cloned: false, state: "none", tour: null, index_commit_sha: null });
    renderView();
    expect(screen.getByText(/This repository isn.t cloned yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
  });

  it("generating → status and disabled Regenerate", () => {
    setView({ state: "generating" });
    renderView();
    expect(screen.getByRole("status")).toHaveTextContent(/Generating/);
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });

  it("generating with no tour yet disables Generate", () => {
    setView({ state: "generating", tour: null, index_commit_sha: null });
    renderView();
    expect(screen.getByRole("status")).toHaveTextContent(/Generating/);
    const generateButtons = screen.queryAllByRole("button", { name: /generate/i });
    generateButtons.forEach((b) => expect(b).toBeDisabled());
  });

  describe("subline", () => {
    it("subline 1 LLM call · $0.0021 · openrouter/…; — for null; 0 LLM calls", () => {
      renderView();
      expect(pageText()).toContain("1 LLM call · $0.0021 · openrouter/openai/gpt-4.1-mini");
      cleanup();

      setView({ tour: tour({ llm: { calls: 1, provider: "openrouter", model: "openai/gpt-4.1-mini", cost_usd: null } }) });
      renderView();
      expect(pageText()).toContain("1 LLM call · — · openrouter/openai/gpt-4.1-mini");
      cleanup();

      setView({
        tour: tour({
          source: "skeleton",
          skeleton_reason: "index_unavailable",
          llm: { calls: 0, provider: null, model: null, cost_usd: null },
        }),
      });
      renderView();
      expect(pageText()).toContain("0 LLM calls");
    });

    it("index of 812 files, generated 2h ago; partial 5,000 of 12,450", () => {
      renderView();
      expect(pageText()).toContain("Generated from index of 812 files");
      expect(pageText()).toContain("generated 2h ago");
      cleanup();

      setView({ tour: tour({ index: { status: "partial", files_indexed: 5000, files_total: 12450 } }) });
      renderView();
      expect(pageText()).toContain("Indexed 5,000 of 12,450 files · partial index");
      expect(pageText()).not.toContain("Generated from index of");
    });
  });

  describe("status lines", () => {
    const skeleton = (reason: Tour["skeleton_reason"]) =>
      tour({ source: "skeleton", skeleton_reason: reason, llm: { calls: reason === "index_unavailable" || reason === "error" ? 0 : 1 } });

    it("llm_failed status line", () => {
      setView({ tour: skeleton("llm_failed") });
      renderView();
      expect(pageText()).toContain("AI summary failed — showing facts from code only");
    });

    it("timed_out status line", () => {
      setView({ tour: skeleton("timed_out") });
      renderView();
      expect(pageText()).toContain("AI summary timed out after 90 s — showing facts from code only");
    });

    it("index_unavailable status line", () => {
      setView({ tour: skeleton("index_unavailable") });
      renderView();
      expect(pageText()).toContain(
        "The code index isn't ready — showing what can be read without it. Resync the repository to build the index.",
      );
    });

    it("error status line", () => {
      setView({ tour: skeleton("error") });
      renderView();
      expect(pageText()).toContain("Some facts couldn't be read — showing what was collected from code");
    });

    it("no status line on an LLM tour", () => {
      renderView();
      expect(pageText()).not.toContain("showing facts from code only");
      expect(pageText()).not.toContain("showing what was collected from code");
    });
  });

  it("section notice rendered", () => {
    const notice = "Reading order is unavailable for this repository's languages";
    setView({
      tour: tour({
        index: { status: "unsupported_languages", files_indexed: 0, files_total: 0 },
        sections: sections({
          critical_paths: { items: [], notice },
          reading_path: { items: [], notice },
        }),
      }),
    });
    renderView();
    expect(screen.getAllByText(/Reading order is unavailable for this repository.s languages/)).toHaveLength(2);
  });

  it("Last regeneration failed banner", () => {
    setView({
      tour: tour({ last_failure: { reason: "llm_failed", at: "2026-10-03T09:30:00.000Z", llm: { calls: 1 } } }),
    });
    renderView();
    expect(pageText()).toMatch(/Last regeneration failed \(llm_failed\) at \S+/);
    // the earlier LLM tour is still what is shown
    expect(screen.getByText("Hono is a small web framework.")).toBeInTheDocument();
  });

  it("stale banner when commits differ, none when equal", () => {
    setView({ index_commit_sha: "bbb", tour: tour({ commit_sha: "aaa" }) });
    renderView();
    expect(pageText()).toContain("This tour was built from an older version of the code");
    // header Regenerate plus the banner's own Regenerate action
    expect(screen.getAllByRole("button", { name: "Regenerate" })).toHaveLength(2);
    cleanup();

    setView({ index_commit_sha: "aaa", tour: tour({ commit_sha: "aaa" }) });
    renderView();
    expect(pageText()).not.toContain("This tour was built from an older version of the code");
    expect(screen.getAllByRole("button", { name: "Regenerate" })).toHaveLength(1);
  });

  describe("How to run locally", () => {
    it("note rendered apart; copy puts cp .env.example .env only, Copied", async () => {
      setView({
        tour: tour({
          sections: sections({
            run_locally: {
              items: [
                {
                  command: "cp .env.example .env",
                  note: "add OPENAI + STRIPE keys",
                  reason_source: "deterministic",
                },
              ],
            },
          }),
        }),
      });
      renderView();
      const command = screen.getByText("cp .env.example .env");
      const note = screen.getByText("add OPENAI + STRIPE keys");
      expect(command).not.toContainElement(note);
      expect(command.textContent).toBe("cp .env.example .env");

      fireEvent.click(screen.getByRole("button", { name: "Copy cp .env.example .env" }));
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith("cp .env.example .env");
      expect(await screen.findByText("Copied")).toBeInTheDocument();
    });

    it("empty command list → notice", () => {
      setView({ tour: tour({ sections: sections({ run_locally: { items: [], notice: null } }) }) });
      renderView();
      expect(screen.getByText(/No run commands found in this repository.s manifests/)).toBeInTheDocument();
    });
  });

  it("reading path states its ordering", () => {
    renderView();
    expect(screen.getByText("Ordered by how many files depend on it")).toBeInTheDocument();
  });

  it("Open → github blob at abc123, new tab", () => {
    renderView();
    const open = screen.getByRole("link", { name: "Open src/hono.ts on GitHub" });
    expect(open).toHaveAttribute("href", "https://github.com/honojs/hono/blob/abc123/src/hono.ts");
    expect(open).toHaveAttribute("target", "_blank");
  });

  describe("First tasks", () => {
    it("renders stored first-task items, no checklist of its own", () => {
      renderView();
      expect(screen.getByText("Add a route test")).toBeInTheDocument();
      expect(screen.getByText("src/request.ts")).toBeInTheDocument();
      expect(screen.getByText(/Small and self-contained/)).toBeInTheDocument();

      cleanup();
      setView({ tour: tour({ sections: sections({ first_tasks: { items: [] } }) }) });
      renderView();
      expect(screen.queryByText(/Run the project with the commands above/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Run the test suite/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Read file 1 of the reading path/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Make a small change and see it run/)).not.toBeInTheDocument();
    });

    it("renders a stored checklist item as a title-only row with no Open", () => {
      setView({
        tour: tour({
          sections: sections({
            first_tasks: {
              items: [
                { title: "Run the test suite", path: null, reason: null, reason_source: "deterministic" },
              ],
            },
          }),
        }),
      });
      renderView();
      expect(screen.getByText("Run the test suite")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Open .* on GitHub/ })).toHaveAttribute(
        "href",
        "https://github.com/honojs/hono/blob/abc123/src/hono.ts",
      );
      // only the one critical-paths row has an Open link; the checklist row adds none
      expect(screen.getAllByRole("link", { name: /Open .* on GitHub/ })).toHaveLength(1);
    });
  });

  describe("overview", () => {
    it("overview sanitised, path as code", () => {
      setView({
        tour: tour({
          sections: sections({
            architecture: {
              body:
                '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[x](javascript:alert(1))\n\nEntry is `src/server.ts`.',
            },
          }),
        }),
      });
      const { container } = renderView();
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("[onerror]")).toBeNull();
      const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
      expect(hrefs.some((h) => h.toLowerCase().startsWith("javascript:"))).toBe(false);
      expect(screen.getByText("src/server.ts").tagName).toBe("CODE");
    });
  });

  describe("diagram", () => {
    const FIVE = 'flowchart TD\n  A["a"]-->B["b"]-->C["c"]-->D["d"]-->E["e"]';
    const THIRTEEN = `flowchart TD\n  ${Array.from({ length: 13 }, (_, i) => `N${i}["n${i}"]`).join("-->")}`;

    function withDiagram(diagram: string) {
      setView({
        tour: tour({
          sections: sections({ architecture: { body: "Prose stays.", diagram } }),
        }),
      });
    }
    async function flush() {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }

    it("5-node diagram shown", async () => {
      withDiagram(FIVE);
      renderView();
      expect(await screen.findByLabelText("diagram")).toBeInTheDocument();
      expect(screen.getByText("Prose stays.")).toBeInTheDocument();
    });

    it("syntax error dropped, prose kept", async () => {
      state.mermaidParse = vi.fn().mockResolvedValue(false);
      withDiagram("flowchart TD\n  A[");
      renderView();
      await flush();
      expect(state.mermaidParse).toHaveBeenCalled();
      expect(screen.queryByLabelText("diagram")).not.toBeInTheDocument();
      expect(screen.getByText("Prose stays.")).toBeInTheDocument();
    });

    it("13 nodes dropped, prose kept", async () => {
      withDiagram(THIRTEEN);
      renderView();
      await flush();
      expect(screen.queryByLabelText("diagram")).not.toBeInTheDocument();
      expect(screen.getByText("Prose stays.")).toBeInTheDocument();
    });
  });

  it("Share link copies page URL, Link copied", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/repos/r1/onboarding`);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });
});

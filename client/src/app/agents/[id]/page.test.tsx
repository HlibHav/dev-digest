import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/agents.json";

const h = vi.hoisted(() => ({ tab: null as string | null }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ag1" }),
  useSearchParams: () => new URLSearchParams(h.tab ? `tab=${h.tab}` : ""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: [] }),
  useAgent: () => ({
    data: { id: "ag1", name: "Sec", enabled: true, strategy: "single-pass" },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateAgent: () => ({ mutate: vi.fn() }),
}));
// The page's job is to pass the right `tab`; the editor itself is tested on its own.
vi.mock("./_components/AgentEditor", () => ({
  AgentEditor: ({ tab }: { tab: string }) => <div data-testid="editor-tab">{tab}</div>,
}));

import AgentEditorPage from "./page";

afterEach(cleanup);

function renderPage(tab: string | null) {
  h.tab = tab;
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <AgentEditorPage />
    </NextIntlClientProvider>,
  );
}

describe("AgentEditorPage ?tab=", () => {
  it("opens the Context tab for ?tab=context", () => {
    renderPage("context");
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("context");
  });
  it("?tab=evals renders the Evals tab", () => {
    renderPage("evals");
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("evals");
  });
  it("falls back to config for an unknown tab", () => {
    renderPage("nope");
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("config");
  });
  // SPEC-2026-10-15-agent-performance AC-41 (red-first): "stats" joins VALID_TABS.
  it("AC-41 ?tab=stats renders the Stats tab", () => {
    renderPage("stats");
    expect(screen.getByTestId("editor-tab")).toHaveTextContent(/^stats$/);
  });
  it("AC-41 ?tab=stats keeps the Stats tab when a period rides along", () => {
    renderPage("stats&period=1d");
    expect(screen.getByTestId("editor-tab")).toHaveTextContent(/^stats$/);
  });
});

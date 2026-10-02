import React from "react";
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/context.json";
import type { ContextDocList, SpecFile } from "@devdigest/shared";

const state = vi.hoisted(() => ({
  list: null as unknown,
  contents: {} as Record<string, string>,
  reindex: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/hooks/core", () => ({
  useContextFiles: () => ({ data: state.list, isLoading: false, isError: false, refetch: vi.fn() }),
  useReindexContext: () => ({ mutate: state.reindex, isPending: false }),
}));
vi.mock("@/lib/hooks/project-context", () => ({
  useContextDoc: (_repo: string, path: string | null) => ({
    data: path ? { path, content: state.contents[path] ?? "", tokens: 1 } : undefined,
    isLoading: false,
    isError: false,
  }),
}));

import { ProjectContextView } from "./ProjectContextView";

function file(path: string, tokens: number): SpecFile {
  return { path, category: "docs", tokens, used_by: { agents: 3, skills: 1 } };
}

function setList(files: SpecFile[], over: Partial<ContextDocList> = {}) {
  state.list = { cloned: true, scanned_at: "2026-10-02T10:00:00Z", files, ...over };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state.contents = {};
  state.reindex = vi.fn();
  setList([
    file("docs/api.md", 100),
    file("docs/guide.md", 200),
    file("specs/public-api.md", 300),
  ]);
});
afterEach(cleanup);

describe("ProjectContextView", () => {
  it("AC-6: shows a folder tree with the file count and total tokens", () => {
    renderView();
    expect(screen.getAllByTestId("doc-folder")).toHaveLength(2);
    expect(screen.getAllByTestId("doc-file")).toHaveLength(3);
    expect(screen.getByText("3 files")).toBeInTheDocument();
    expect(screen.getByText(/≈ 600 tokens total/)).toBeInTheDocument();
  });

  it("AC-5a: shows the time of the last scan", () => {
    renderView();
    expect(screen.getByText(/scanned 10:00/)).toBeInTheDocument();
  });

  it("AC-7: selecting a doc renders its Markdown read-only, with who uses it", () => {
    state.contents["specs/public-api.md"] = "## Goals\n\nBe public.";
    renderView();
    fireEvent.click(screen.getByText("public-api.md"));
    expect(screen.getByRole("heading", { name: "Goals" })).toBeInTheDocument();
    expect(screen.getByText("Used by 3 agents · 1 skills")).toBeInTheDocument();
  });

  it("AC-8: raw HTML and javascript: links are not rendered as live markup", () => {
    state.contents["specs/public-api.md"] =
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[x](javascript:alert(1))';
    const { container } = renderView();
    fireEvent.click(screen.getByText("public-api.md"));
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.toLowerCase().startsWith("javascript:"))).toBe(false);
  });

  it("AC-10: offers no edit, new, folder or upload control; Refresh re-indexes", () => {
    const { container } = renderView();
    for (const name of [/edit/i, /new/i, /folder/i, /upload/i, /delete/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(container.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(state.reindex).toHaveBeenCalledWith("r1");
  });

  it("shows the rewritten empty state and the not-cloned notice", () => {
    setList([]);
    renderView();
    expect(screen.getByText(/Attach docs to agents and skills from their Context tabs/)).toBeInTheDocument();
    cleanup();
    setList([], { cloned: false, scanned_at: null });
    renderView();
    expect(within(document.body).getByText(messages.notCloned.title)).toBeInTheDocument();
  });
});

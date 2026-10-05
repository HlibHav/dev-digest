import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { SpecsReadRow } from "./SpecsReadRow";

afterEach(cleanup);

function trace(over: Partial<RunTrace>): RunTrace {
  return {
    config: { agent: "A", model: "m", source: "local" },
    stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, findings: 0, grounding: "0/0" },
    prompt_assembly: { system: "s", user: "u" },
    tool_calls: [],
    raw_output: "",
    memory_pulled: [],
    specs_read: [],
    log: [],
    ...over,
  } as RunTrace;
}

function renderRow(tr: RunTrace) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <SpecsReadRow trace={tr} />
    </NextIntlClientProvider>,
  );
}

const DOCS = [
  { path: "specs/a.md", status: "injected", origin: "agent", tokens: 120, text: "Alpha body" },
  { path: "specs/b.md", status: "not_found", origin: "agent" },
  { path: "specs/c.md", status: "unreadable", origin: "skill", skill_name: "sk" },
  { path: "specs/d.md", status: "modified_by_pr", origin: "agent", tokens: 40, text: "Delta body" },
] as RunTrace["specs_docs"];

describe("SpecsReadRow", () => {
  it("AC-37: every doc is listed with a status label in text", () => {
    renderRow(trace({ specs_docs: DOCS }));
    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.getByText("not found")).toBeInTheDocument();
    expect(screen.getByText("unreadable")).toBeInTheDocument();
    expect(screen.getByText("modified by PR")).toBeInTheDocument();
  });

  it("AC-38: an injected doc opens a panel with its text and tokens; a not-found doc is not a button", () => {
    renderRow(trace({ specs_docs: DOCS }));
    expect(screen.queryByText("Alpha body")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /specs\/a\.md/ }));
    expect(screen.getByText("Alpha body")).toBeInTheDocument();
    expect(screen.getByText("120 tokens")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /specs\/b\.md/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /specs\/c\.md/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /specs\/d\.md/ }));
    expect(screen.getByText("Delta body")).toBeInTheDocument();
  });

  it("AC-38: expand lifts the height cap on the sent text, collapse restores it, a new doc opens collapsed", () => {
    renderRow(trace({ specs_docs: DOCS }));
    fireEvent.click(screen.getByRole("button", { name: /specs\/a\.md/ }));
    const pre = () => screen.getByText(/^(Alpha|Delta) body$/);
    expect(pre().style.maxHeight).toBe("160px");
    fireEvent.click(screen.getByRole("button", { name: "expand" }));
    expect(pre().style.maxHeight).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "collapse" }));
    expect(pre().style.maxHeight).toBe("160px");
    fireEvent.click(screen.getByRole("button", { name: "expand" }));
    fireEvent.click(screen.getByRole("button", { name: /specs\/d\.md/ }));
    expect(pre()).toHaveTextContent("Delta body");
    expect(pre().style.maxHeight).toBe("160px");
    expect(screen.getByRole("button", { name: "expand" })).toBeInTheDocument();
  });

  it("AC-39: a trace without specs_docs falls back to specs_read paths rendered as —", () => {
    renderRow(trace({ specs_read: ["specs/old.md"] }));
    expect(screen.getByText("specs/old.md")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /specs\/old\.md/ })).toBeNull();
  });

  it("shows none when there is nothing", () => {
    renderRow(trace({}));
    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("copy shows the copied mark only after the write resolves, never when it rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { container } = renderRow(trace({ specs_docs: DOCS }));
    fireEvent.click(screen.getByRole("button", { name: /specs\/a\.md/ }));
    const btn = screen.getByRole("button", { name: "Copy" });
    const before = btn.innerHTML;
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(writeText).toHaveBeenCalledWith("Alpha body");
    expect(btn.innerHTML).toBe(before);

    writeText.mockResolvedValue(undefined);
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn.innerHTML).not.toBe(before);
    expect(container).toBeTruthy();
  });

  it("clears the copied timer on unmount", async () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { unmount } = renderRow(trace({ specs_docs: DOCS }));
    fireEvent.click(screen.getByRole("button", { name: /specs\/a\.md/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    clear.mockClear();
    unmount();
    expect(clear).toHaveBeenCalled();
    vi.useRealTimers();
    clear.mockRestore();
  });
});

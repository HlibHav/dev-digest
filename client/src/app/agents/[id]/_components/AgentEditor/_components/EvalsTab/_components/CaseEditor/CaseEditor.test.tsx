import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import shell from "../../../../../../../../../../messages/en/shell.json";
import prReview from "../../../../../../../../../../messages/en/prReview.json";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      get: (...a: unknown[]) => get(...a),
      post: (...a: unknown[]) => post(...a),
      put: (...a: unknown[]) => put(...a),
    },
  };
});

import { CaseEditor } from "./CaseEditor";

const DIFF = [
  "--- a/src/config.ts",
  "+++ b/src/config.ts",
  "@@ -10,6 +10,7 @@",
  " a",
  '+  stripeKey: "sk_live_51H8xq2Ka"',
  " b",
].join("\n");
const VALID = '[{"type":"must_find","file":"src/config.ts","start_line":11,"end_line":11}]';

function renderEditor(onClose = vi.fn(), qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, shell, prReview }}>
        <CaseEditor agentId="a1" onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onClose;
}

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const saveButton = () => screen.getByRole("button", { name: "Save" });

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  put.mockReset();
});
afterEach(cleanup);

describe("CaseEditor", () => {
  it("AC-38 shows the first error inline and enables Save only when valid with name and diff", () => {
    renderEditor();
    type("Name", "leak");
    type("Diff", DIFF);
    expect(saveButton()).toBeEnabled(); // default "[]" is valid: expect clean

    type("Expected output", "[");
    expect(screen.getByRole("alert")).toHaveTextContent(/JSON/i);
    expect(saveButton()).toBeDisabled();

    type("Expected output", '[{"type":"must_find","start_line":1,"end_line":1}]');
    expect(screen.getByRole("alert")).toHaveTextContent(/file/);
    expect(saveButton()).toBeDisabled();

    type("Expected output", VALID);
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    type("Name", "");
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("Name is required")).toBeInTheDocument();
  });

  it("AC-39 the skeleton button appends one must_find with file and line keys", () => {
    renderEditor();
    type("Expected output", "[]");
    fireEvent.click(screen.getByRole("button", { name: "Finding skeleton" }));
    const list = JSON.parse((screen.getByLabelText("Expected output") as HTMLTextAreaElement).value);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: "must_find", file: "" });
    expect(Object.keys(list[0])).toEqual(expect.arrayContaining(["file", "start_line", "end_line"]));
  });

  it("AC-41 warns next to an expectation no hunk reaches, and Save stays enabled", () => {
    renderEditor();
    type("Name", "leak");
    type("Diff", DIFF);
    type("Expected output", '[{"type":"must_find","file":"src/config.ts","start_line":40,"end_line":40}]');
    const warning = screen.getByText(/src\/config\.ts:40-40/);
    expect(warning).toHaveTextContent("This expectation can never be matched");
    expect(saveButton()).toBeEnabled();
    type("Expected output", VALID);
    expect(screen.queryByText(/can never be matched/)).not.toBeInTheDocument();
  });

  it("AC-40 typing a diff renders the preview", () => {
    renderEditor();
    type(
      "Diff",
      ["--- a/src/config.ts", "+++ b/src/config.ts", "@@ -10,6 +10,7 @@", " first", " second", "+  added(true)"].join("\n"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    // The added line renders as an addition (+ sign) at its new-side line number (10, 11, then 12).
    const row = screen.getByText("added(true)").parentElement as HTMLElement;
    expect(within(row).getByText("12")).toBeInTheDocument();
    expect(within(row).getByText("+")).toBeInTheDocument();
    expect(screen.getByText("second").parentElement).not.toHaveTextContent("+");
  });

  it("Preview masks credentials until Reveal; the stored diff stays as typed", () => {
    renderEditor();
    type("Diff", DIFF);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.queryByText(/sk_live_51H8xq2Ka/)).not.toBeInTheDocument();
    expect(screen.getByText("•••• credential hidden")).toBeInTheDocument();
    expect(screen.getByText(/stripeKey/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText(/sk_live_51H8xq2Ka/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Diff" }));
    expect((screen.getByLabelText("Diff") as HTMLTextAreaElement).value).toContain("sk_live_51H8xq2Ka");
  });

  it("AC-35 Run on save saves, starts the run and shows the result in the last-run panel", async () => {
    post.mockImplementation(async (path: string) => {
      if (path === "/agents/a1/eval-cases") return { id: "c1" };
      if (path === "/eval-cases/c1/run") return { case_run_id: "cr1", status: "running" };
      throw new Error(`unexpected POST ${path}`);
    });
    get.mockResolvedValue({
      id: "cr1",
      status: "passed",
      matched_must_find: 1,
      must_find_total: 1,
      duration_ms: 2400,
      cost_usd: 0.03,
    });
    const onClose = renderEditor();
    type("Name", "leak");
    type("Diff", DIFF);
    type("Expected output", VALID);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(saveButton());

    expect(await screen.findByText("Last run passed")).toBeInTheDocument();
    expect(screen.getByText("matched 1 of 1 · 2.4s · $0.03")).toBeInTheDocument();
    expect(post.mock.calls.map((c) => c[0])).toEqual(["/agents/a1/eval-cases", "/eval-cases/c1/run"]);
    expect(get).toHaveBeenCalledWith("/eval-case-runs/cr1");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("saves and closes when Run on save is off", async () => {
    post.mockResolvedValue({ id: "c1" });
    const onClose = renderEditor();
    type("Name", "leak");
    type("Diff", DIFF);
    fireEvent.click(saveButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("CR-8 refreshes the case list once when the Run on save run finishes", async () => {
    post.mockImplementation(async (path: string) =>
      path === "/agents/a1/eval-cases" ? { id: "c1" } : { case_run_id: "cr1", status: "running" },
    );
    get.mockResolvedValue({ id: "cr1", status: "passed", matched_must_find: 1, must_find_total: 1, duration_ms: 1000, cost_usd: 0.01 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const spy = vi.spyOn(qc, "invalidateQueries");
    renderEditor(vi.fn(), qc);
    type("Name", "leak");
    type("Diff", DIFF);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(saveButton());
    await screen.findByText("Last run passed");
    const casesCalls = () => spy.mock.calls.filter((c) => JSON.stringify(c[0]?.queryKey) === '["eval-cases","a1"]').length;
    await waitFor(() => expect(casesCalls()).toBeGreaterThanOrEqual(2)); // one after save, one after the run ends
  });
});

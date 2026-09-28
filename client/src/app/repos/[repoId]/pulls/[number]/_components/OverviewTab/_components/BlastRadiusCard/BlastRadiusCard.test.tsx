import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      timeZone="UTC"
      messages={{ blast: messages }}
      onError={(e) => {
        throw e;
      }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

/** Asserts the label and the number both render, tolerating either order
    and any markup between them (the label appears nowhere else in the DOM
    with this exact number attached). */
function expectCount(container: HTMLElement, n: number, label: string) {
  const text = container.textContent ?? "";
  const forward = new RegExp(`${n}\\D{0,12}${label}`);
  const backward = new RegExp(`${label}\\D{0,12}${n}`);
  expect(forward.test(text) || backward.test(text)).toBe(true);
}

// Two groups: "foo" has 2 callers, "bar" has 3 -> 5 distinct callers total.
// 2 distinct endpoints, 1 distinct cron. 3 changed symbols total (1 with no
// downstream group), so symbols=3, callers=5, endpoints=2, crons=1 — four
// numbers that don't collide with anything else in the fixture.
const BLAST: BlastRadius = {
  changed_symbols: [
    { name: "foo", file: "a.ts", kind: "function" },
    { name: "bar", file: "a.ts", kind: "function" },
    { name: "unused", file: "a.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "foo",
      callers: [
        { name: "foo", file: "b.ts", line: 10 },
        { name: "foo", file: "c.ts", line: 20 },
      ],
      endpoints_affected: ["GET /x"],
      crons_affected: [],
    },
    {
      symbol: "bar",
      callers: [
        { name: "bar", file: "d.ts", line: 1 },
        { name: "bar", file: "d.ts", line: 2 },
        { name: "bar", file: "e.ts", line: 3 },
      ],
      endpoints_affected: ["POST /y"],
      crons_affected: ["nightly-job"],
    },
  ],
  summary: "3 changed symbol(s) · 5 caller(s) · 2 endpoint(s) · 1 cron/job(s)",
};

describe("BlastRadiusCard — summary", () => {
  it("summary row shows the four counts", () => {
    const { container } = renderWithIntl(
      <BlastRadiusCard blast={BLAST} isLoading={false} isError={false} link={null} />,
    );
    expectCount(container, 3, "symbols");
    expectCount(container, 5, "callers");
    expectCount(container, 2, "endpoints");
    expectCount(container, 1, "cron/jobs");
  });
});

describe("BlastRadiusCard — no downstream", () => {
  it("no callers shows the noDownstream text", () => {
    const noDownstream: BlastRadius = {
      changed_symbols: [
        { name: "foo", file: "a.ts", kind: "function" },
        { name: "bar", file: "a.ts", kind: "function" },
      ],
      downstream: [],
      summary: "2 changed symbol(s) · 0 caller(s) · 0 endpoint(s) · 0 cron/job(s)",
    };
    renderWithIntl(<BlastRadiusCard blast={noDownstream} isLoading={false} isError={false} link={null} />);

    expect(screen.getByText("2 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    // AC7: no tree and no graph when there are no callers.
    expect(screen.queryByText("b.ts:10")).not.toBeInTheDocument();
    expect(document.querySelector("svg")).not.toBeInTheDocument();
  });
});

describe("BlastRadiusCard — degraded", () => {
  it("degraded result shows the notice above the map", () => {
    const degraded: BlastRadius = {
      ...BLAST,
      degraded: true,
      reason: "no_data",
    };
    const { container } = renderWithIntl(
      <BlastRadiusCard blast={degraded} isLoading={false} isError={false} link={null} />,
    );

    expect(screen.getByText("Incomplete index")).toBeInTheDocument();
    const noticeText =
      "No code index for this repo yet, so callers come from a text search or are missing.";
    expect(screen.getByText(noticeText)).toBeInTheDocument();

    const text = container.textContent ?? "";
    // "above the map": the notice text precedes the first rendered caller.
    expect(text.indexOf(noticeText)).toBeLessThan(text.indexOf("b.ts:10"));
    expect(text.indexOf("b.ts:10")).toBeGreaterThan(-1);
  });
});

describe("BlastRadiusCard — view toggle", () => {
  it("Tree/Graph toggle swaps the view", () => {
    renderWithIntl(<BlastRadiusCard blast={BLAST} isLoading={false} isError={false} link={null} />);

    // Starts on the tree view: a caller is visible, no svg graph.
    expect(screen.getByText("b.ts:10")).toBeInTheDocument();
    expect(document.querySelector("svg")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));

    expect(screen.queryByText("b.ts:10")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Blast radius graph")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "tree" }));

    expect(screen.getByText("b.ts:10")).toBeInTheDocument();
    expect(screen.queryByLabelText("Blast radius graph")).not.toBeInTheDocument();
  });
});

describe("BlastRadiusCard — loading and error states", () => {
  it("loading and error states", () => {
    const { unmount: unmountLoading } = renderWithIntl(
      <BlastRadiusCard blast={undefined} isLoading={true} isError={false} link={null} />,
    );
    expect(screen.getByText("Loading blast radius…")).toBeInTheDocument();
    expect(screen.queryByText("b.ts:10")).not.toBeInTheDocument();
    unmountLoading();
    cleanup();

    const onRetry = vi.fn();
    renderWithIntl(
      <BlastRadiusCard blast={undefined} isLoading={false} isError={true} onRetry={onRetry} link={null} />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load the blast radius")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

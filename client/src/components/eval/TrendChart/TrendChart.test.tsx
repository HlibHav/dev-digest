import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalTrendRunPoint } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import { TrendChart } from "./TrendChart";

afterEach(cleanup);

const point = (n: number, over: Partial<EvalTrendRunPoint> = {}): EvalTrendRunPoint => ({
  suite_run_id: `s${n}`,
  run_number: n,
  agent_version: 1,
  started_at: "2026-10-09T10:00:00.000Z",
  recall: 0.8,
  precision: 0.5,
  citation_accuracy: 1,
  cost_usd: 0.03,
  ...over,
});

describe("TrendChart", () => {
  it("text alternative lists each point's label and values, a null as —", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <TrendChart points={[point(2, { precision: null, cost_usd: null }), point(1)]} />
      </NextIntlClientProvider>,
    );
    const list = screen.getByRole("list", { name: "Trend points" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    // oldest first
    expect(items[0]).toHaveTextContent("run #1 · agent v1");
    expect(items[0]).toHaveTextContent("Recall 80%");
    expect(items[0]).toHaveTextContent("Precision 50%");
    expect(items[0]).toHaveTextContent("$0.03");
    expect(items[1]).toHaveTextContent("Precision —");
    expect(items[1]).toHaveTextContent("Cost —");
    expect(items[1]).not.toHaveTextContent(/Precision 0%|Cost \$0/);
  });
});

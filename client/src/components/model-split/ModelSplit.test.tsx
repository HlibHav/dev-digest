import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { ModelSplit } from "./ModelSplit";

const LABELS = {
  unknownModel: "Unknown model",
  runs: (n: number) => `${n} runs`,
  decisions: (n: number) => `${n} decisions`,
};

afterEach(cleanup);

describe("ModelSplit", () => {
  it("renders one line per model with Unknown model label for null", () => {
    render(
      <ModelSplit
        labels={LABELS}
        rows={[
          { model: "deepseek/deepseek-v4-flash", runs: 5, total_cost_usd: 0.05, accepted: 9, dismissed: 6, decisions: 15, accept_rate: 0.6 },
          { model: null, runs: 2, total_cost_usd: null, accepted: 0, dismissed: 0, decisions: 0, accept_rate: null },
        ]}
      />,
    );
    const lines = screen.getAllByRole("listitem");
    expect(lines).toHaveLength(2);
    expect(within(lines[0]!).getByText("deepseek/deepseek-v4-flash")).toBeInTheDocument();
    expect(lines[0]!.textContent).toContain("5 runs");
    expect(lines[0]!.textContent).toContain("$0.05");
    expect(lines[0]!.textContent).toContain("60%");
    expect(lines[0]!.textContent).toContain("15 decisions");
    expect(within(lines[1]!).getByText("Unknown model")).toBeInTheDocument();
    expect(lines[1]!.textContent).not.toMatch(/\$0\.00|(^|[^\d.])0%/);
    expect(within(lines[1]!).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});

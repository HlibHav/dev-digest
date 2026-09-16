/**
 * RunCostBadge + formatCost — run cost as shown on the PR list, the PR detail
 * timeline / review runs, and the run trace. Missing data must read "—", never
 * "$0.00" (a real zero is data and stays "$0.00").
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/common.json";
import { formatCost } from "./format";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("formatCost", () => {
  it.each([
    [0.014, 3, "$0.014"],
    [0.0013, 3, "$0.001"],
    [0.0013, 4, "$0.0013"],
    [0.06, 4, "$0.06"],
    [0.01, 4, "$0.01"],
    [0.1, 3, "$0.10"],
    [1.2345, 3, "$1.23"],
    [0.0004, 3, "<$0.001"],
    [0.00004, 4, "<$0.0001"],
    [0, 3, "$0.00"],
  ] as const)("formatCost(%s, %s) → %s", (usd, decimals, expected) => {
    expect(formatCost(usd, decimals)).toBe(expected);
  });

  it.each([null, undefined, Number.NaN])("no data (%s) → —", (usd) => {
    expect(formatCost(usd, 3)).toBe("—");
    expect(formatCost(usd, 4)).toBe("—");
  });
});

function renderBadge(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunCostBadge", () => {
  it("compact shows the cost only", () => {
    renderBadge(<RunCostBadge variant="compact" costUsd={0.014} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("compact shows — when the cost is unknown", () => {
    renderBadge(<RunCostBadge variant="compact" costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("detailed shows total tokens and the precise cost", () => {
    renderBadge(<RunCostBadge variant="detailed" costUsd={0.0013} tokensIn={8457} tokensOut={662} />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("detailed keeps the tokens and shows — for an unpriced run", () => {
    renderBadge(<RunCostBadge variant="detailed" costUsd={undefined} tokensIn={12000} tokensOut={11} />);
    expect(screen.getByText("12,011 tok · —")).toBeInTheDocument();
  });

  it("detailed drops the tokens part when token counts are missing", () => {
    renderBadge(<RunCostBadge variant="detailed" costUsd={0.0013} tokensIn={null} tokensOut={null} />);
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });
});

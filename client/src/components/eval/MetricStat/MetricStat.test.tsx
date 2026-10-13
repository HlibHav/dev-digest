import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/eval.json";
import { MetricStat } from "./MetricStat";

afterEach(cleanup);

const renderStat = (props: React.ComponentProps<typeof MetricStat>) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <MetricStat {...props} />
    </NextIntlClientProvider>,
  );

describe("MetricStat", () => {
  it("AC-23 null value renders —", () => {
    renderStat({ label: "Recall", value: null, delta: null });
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });

  it("shows the value with its delta, and 'never run' when there is no run", () => {
    renderStat({ label: "Precision", value: 0.823, delta: -0.02 });
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("−2 pts")).toBeInTheDocument();
    cleanup();
    renderStat({ label: "Precision", value: null, delta: null, neverRun: true });
    expect(screen.getByText("never run")).toBeInTheDocument();
  });
});

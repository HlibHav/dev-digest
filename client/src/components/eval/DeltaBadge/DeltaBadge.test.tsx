import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/eval.json";
import { DeltaBadge } from "./DeltaBadge";

afterEach(cleanup);

const renderBadge = (delta: number | null, unit: "pts" | "usd" = "pts") =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <DeltaBadge delta={delta} unit={unit} />
    </NextIntlClientProvider>,
  );

describe("DeltaBadge", () => {
  it("AC-50 −0.02 renders '−' and a down-arrow text alternative", () => {
    renderBadge(-0.02);
    expect(screen.getByText("−2 pts")).toBeInTheDocument();
    expect(screen.getByText("down")).toBeInTheDocument();
  });

  it("shows +, an up alternative, and a dash for null", () => {
    renderBadge(0.05);
    expect(screen.getByText("+5 pts")).toBeInTheDocument();
    expect(screen.getByText("up")).toBeInTheDocument();
    cleanup();
    renderBadge(null);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("up")).not.toBeInTheDocument();
    expect(screen.queryByText("down")).not.toBeInTheDocument();
  });
});

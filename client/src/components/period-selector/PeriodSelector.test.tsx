import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PeriodSelector } from "./PeriodSelector";

const LABELS = {
  oneDay: "1 day",
  thirtyDays: "30 days",
  custom: "Custom range",
  from: "From (UTC)",
  to: "To (UTC)",
  invalidRange: "Bad range",
};

afterEach(cleanup);

describe("PeriodSelector", () => {
  it("three buttons with aria-pressed on the selected one", () => {
    const onChange = vi.fn();
    render(<PeriodSelector value={{ period: "30d" }} onChange={onChange} labels={LABELS} />);
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1 day" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Custom range" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByLabelText("From (UTC)")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "1 day" }));
    expect(onChange).toHaveBeenLastCalledWith({ period: "1d" });
    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    expect(onChange).toHaveBeenLastCalledWith({ period: "custom", from: null, to: null });
  });

  it("Custom shows two labelled date inputs", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PeriodSelector value={{ period: "custom", from: "2026-10-01", to: null }} onChange={onChange} labels={LABELS} />,
    );
    const from = screen.getByLabelText("From (UTC)");
    const to = screen.getByLabelText("To (UTC)");
    expect(from).toHaveAttribute("type", "date");
    expect(from).toHaveValue("2026-10-01");
    expect(to).toHaveAttribute("type", "date");
    expect(screen.queryByText("Bad range")).toBeNull();

    fireEvent.change(to, { target: { value: "2026-10-07" } });
    expect(onChange).toHaveBeenLastCalledWith({ period: "custom", from: "2026-10-01", to: "2026-10-07" });

    rerender(
      <PeriodSelector
        value={{ period: "custom", from: "2026-10-09", to: "2026-10-07" }}
        onChange={onChange}
        labels={LABELS}
        invalid
      />,
    );
    expect(screen.getByText("Bad range")).toBeInTheDocument();
  });
});

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/eval.json";
import { RegressionBanner } from "./RegressionBanner";

afterEach(cleanup);

function renderBanner(alert: Parameters<typeof RegressionBanner>[0]["alert"]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <RegressionBanner alert={alert} />
    </NextIntlClientProvider>,
  );
}

describe("RegressionBanner", () => {
  it("AC-56 names precision, 2 pts and the run label; role=alert", () => {
    renderBanner({ run_number: 7, agent_version: 3, drops: [{ metric: "precision", points: 2 }] });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Precision");
    expect(alert).toHaveTextContent("2 pts");
    expect(alert).toHaveTextContent("run #7 · agent v3");
  });

  it("renders nothing for a null alert", () => {
    renderBanner(null);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

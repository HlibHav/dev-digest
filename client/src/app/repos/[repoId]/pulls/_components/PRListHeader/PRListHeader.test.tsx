/**
 * PRListHeader — column headers of the PR list. The Cost header carries a
 * native tooltip explaining that the value sums every completed run.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReview from "../../../../../../../messages/en/prReview.json";

import { PRListHeader } from "./PRListHeader";

afterEach(cleanup);

function renderHeader() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <PRListHeader />
    </NextIntlClientProvider>,
  );
}

describe("PRListHeader", () => {
  it("gives the Cost header a native title tooltip", () => {
    renderHeader();
    expect(screen.getByText("Cost")).toHaveAttribute(
      "title",
      "Total cost of all completed runs of this PR",
    );
  });

  it("leaves the other headers without a tooltip", () => {
    renderHeader();
    expect(screen.getByText("Author")).not.toHaveAttribute("title");
  });
});

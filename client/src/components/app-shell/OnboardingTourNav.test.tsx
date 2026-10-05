import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Sidebar } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

afterEach(cleanup);

/**
 * AC-1 and AC-2 of SPEC-2026-10-02-onboarding-tour.
 * Same pattern as ProjectContextNav.test.tsx: the vendored Sidebar renders the
 * active item with fontWeight 600.
 */
describe("Onboarding Tour sidebar item", () => {
  it("links to the repo's tour page in WORKSPACE and is active there", () => {
    render(<Sidebar ctx={{ activeKey: activeKeyFor("/repos/r1/onboarding"), repoId: "r1" }} />);
    const link = screen.getByRole("link", { name: /onboarding tour/i });
    expect(link).toHaveAttribute("href", "/repos/r1/onboarding");
    // the item sits in the WORKSPACE group
    expect(link.parentElement?.firstElementChild?.textContent).toBe("WORKSPACE");
    const row = link.firstElementChild as HTMLElement;
    expect(row.style.fontWeight).toBe("600");
  });

  it("add-repository screen marks nothing as Onboarding Tour", () => {
    // `/onboarding` is the add-repository screen, not a repo's tour page.
    expect(activeKeyFor("/onboarding")).not.toBe("onboarding-tour");
    render(<Sidebar ctx={{ activeKey: activeKeyFor("/onboarding"), repoId: "r1" }} />);
    const link = screen.getByRole("link", { name: /onboarding tour/i });
    const row = link.firstElementChild as HTMLElement;
    expect(row.style.fontWeight).not.toBe("600");
  });
});

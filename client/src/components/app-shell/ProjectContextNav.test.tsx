import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Sidebar } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

afterEach(cleanup);

describe("Project Context sidebar item", () => {
  it("links to the repo's context page and is the active item on /context", () => {
    render(<Sidebar ctx={{ activeKey: activeKeyFor("/repos/r1/context"), repoId: "r1" }} />);
    const link = screen.getByRole("link", { name: /project context/i });
    expect(link).toHaveAttribute("href", "/repos/r1/context");
    // the item sits in the WORKSPACE group, not SKILLS LAB
    expect(link.parentElement?.firstElementChild?.textContent).toBe("WORKSPACE");
    // the active marker is the 2.5px accent bar NavItem renders inside the row
    const row = link.firstElementChild as HTMLElement;
    expect(row.querySelector("span")).not.toBeNull();
    expect(row.style.fontWeight).toBe("600");
  });
});

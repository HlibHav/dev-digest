import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Sidebar } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

afterEach(cleanup);

describe("Eval Dashboard sidebar item", () => {
  it("sits under SKILLS LAB, links to /eval and is active on /eval/abc", () => {
    expect(activeKeyFor("/eval/abc")).toBe("eval");
    render(<Sidebar ctx={{ activeKey: activeKeyFor("/eval/abc"), repoId: "r1" }} />);
    const link = screen.getByRole("link", { name: /eval dashboard/i });
    expect(link).toHaveAttribute("href", "/eval");
    expect(link.parentElement?.firstElementChild?.textContent).toBe("SKILLS LAB");
    const row = link.firstElementChild as HTMLElement;
    expect(row.style.fontWeight).toBe("600");
  });
});

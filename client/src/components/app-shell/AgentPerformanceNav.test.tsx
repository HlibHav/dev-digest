import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Sidebar } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

/* Red-first for SPEC-2026-10-15-agent-performance AC-24: a GLOBAL sidebar group with
   one item, "Agent Performance", linking to /agent-performance and active there.
   Turned green by plan step 5 (the GLOBAL group in src/vendor/ui/nav.ts). */

afterEach(cleanup);

describe("Agent Performance sidebar item", () => {
  it("AC-24 GLOBAL → Agent Performance links to /agent-performance and is active there", () => {
    expect(activeKeyFor("/agent-performance")).toBe("agent-performance");
    render(<Sidebar ctx={{ activeKey: activeKeyFor("/agent-performance"), repoId: "r1" }} />);
    const link = screen.getByRole("link", { name: /agent performance/i });
    expect(link).toHaveAttribute("href", "/agent-performance");
    // the group heading is the first child of the item's group, as for SKILLS LAB
    const group = link.parentElement;
    expect(group?.firstElementChild?.textContent).toBe("GLOBAL");
    // GLOBAL holds exactly one item
    expect(group?.querySelectorAll("a")).toHaveLength(1);
    const row = link.firstElementChild as HTMLElement;
    expect(row.style.fontWeight).toBe("600");
  });

  it("AC-24 Agent Performance is not active on another page", () => {
    render(<Sidebar ctx={{ activeKey: activeKeyFor("/agents"), repoId: "r1" }} />);
    const link = screen.getByRole("link", { name: /agent performance/i });
    const row = link.firstElementChild as HTMLElement;
    expect(row.style.fontWeight).not.toBe("600");
  });
});

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { ContextDocList, type ContextDocListLabels } from "./ContextDocList";
import type { ContextRow } from "./helpers";

afterEach(cleanup);

const labels: ContextDocListLabels = {
  preview: "Preview",
  notInRepo: "not in this repo",
  inheritedFrom: (skill) => `inherited from ${skill}`,
  dragHandle: (path) => `Reorder ${path}`,
  select: (path) => `Attach ${path}`,
  tokens: (n) => `≈ ${n.toLocaleString("en-US")} tokens`,
  empty: "No documents",
};

const row = (path: string, over: Partial<ContextRow> = {}): ContextRow => ({
  path,
  category: "docs",
  tokens: 10,
  present: true,
  checked: false,
  inheritedFrom: null,
  ...over,
});

function setup(rows: ContextRow[], filter = "") {
  const props = { onToggle: vi.fn(), onReorder: vi.fn(), onPreview: vi.fn() };
  render(<ContextDocList rows={rows} filter={filter} labels={labels} {...props} />);
  return props;
}

// jsdom has no layout; give each sortable row a distinct box so dnd-kit's
// keyboard coordinates can find the row below.
function stubLayout() {
  const orig = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    const idx = Array.from(this.parentElement?.children ?? []).indexOf(this);
    const top = Math.max(idx, 0) * 50;
    return { x: 0, y: top, top, bottom: top + 40, left: 0, right: 300, width: 300, height: 40, toJSON() {} };
  };
  return () => {
    Element.prototype.getBoundingClientRect = orig;
  };
}

describe("ContextDocList", () => {
  it("keyboard reorder moves a row", async () => {
    const restore = stubLayout();
    const { onReorder } = setup([
      row("a.md", { checked: true }),
      row("b.md", { checked: true }),
      row("c.md"),
    ]);
    const handle = screen.getByRole("button", { name: "Reorder a.md" });
    handle.focus();
    // Space on the handle lifts the row; the rest of the gesture is heard on the document.
    fireEvent.keyDown(handle, { code: "Space", key: " " });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    fireEvent.keyDown(document, { code: "ArrowDown", key: "ArrowDown" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    fireEvent.keyDown(document, { code: "Space", key: " " });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    restore();
    expect(onReorder).toHaveBeenCalledWith("a.md", "b.md");
  });

  it("toggling a row's checkbox reports its path", () => {
    const { onToggle } = setup([row("a.md")]);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("a.md");
  });

  it("an inherited row names its skill and its checkbox does nothing", () => {
    const { onToggle } = setup([row("a.md", { checked: true, inheritedFrom: "rubric" })]);
    expect(screen.getByText("inherited from rubric")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Reorder a.md" })).toBeNull();
  });

  it("every row checkbox is named after its doc path", () => {
    setup([row("specs/a.md"), row("docs/b.md", { checked: true })]);
    expect(screen.getByRole("checkbox", { name: /specs\/a.md/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /docs\/b.md/ })).toBeInTheDocument();
  });

  it("an inherited row's checkbox is disabled and still named", () => {
    setup([row("a.md", { checked: true, inheritedFrom: "rubric" })]);
    expect(screen.getByRole("checkbox", { name: /a\.md/ })).toBeDisabled();
  });

  it("a per-doc token count reads as an approximate, grouped number", () => {
    setup([row("a.md", { tokens: 1226 })]);
    expect(screen.getByText("≈ 1,226 tokens")).toBeInTheDocument();
  });

  it("a missing row says it is not in the repo, shows 0 tokens and has no preview", () => {
    setup([row("gone.md", { checked: true, present: false, tokens: 0, category: null })]);
    expect(screen.getByText("not in this repo")).toBeInTheDocument();
    expect(screen.getByText("≈ 0 tokens")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
  });

  it("a long path carries a title so the ellipsis is recoverable", () => {
    const long = "docs/" + "very-long-segment/".repeat(8) + "file.md";
    setup([row(long)]);
    expect(screen.getByTitle(long)).toBeInTheDocument();
  });

  it("the filter hides rows that do not match", () => {
    setup([row("specs/api.md"), row("docs/deploy.md")], "deploy");
    expect(screen.queryByText("specs/api.md")).toBeNull();
    expect(screen.getByText("docs/deploy.md")).toBeInTheDocument();
  });

  it("preview reports the row's path", () => {
    const { onPreview } = setup([row("a.md")]);
    fireEvent.click(within(document.body).getByRole("button", { name: "Preview" }));
    expect(onPreview).toHaveBeenCalledWith("a.md");
  });
});

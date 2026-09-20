import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "test-smells",
  description: "Flag assertion-free tests and over-mocking.",
  type: "convention",
  source: "manual",
  body: "# Test smells",
  enabled: true,
  version: 2,
  evidence_files: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the name, description, type and version", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);

    expect(screen.getByText("test-smells")).toBeInTheDocument();
    expect(screen.getByText("Flag assertion-free tests and over-mocking.")).toBeInTheDocument();
    expect(screen.getByText("convention")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("marks an imported skill that is still disabled as needing vetting", () => {
    renderWithIntl(
      <SkillCard skill={{ ...SKILL, source: "imported_url", enabled: false }} />,
    );
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("does not badge a skill this workspace wrote, enabled or not", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, enabled: false }} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("does not badge an imported skill once it has been vetted", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, source: "imported_url", enabled: true }} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("reports the toggle through onToggle", async () => {
    const onToggle = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onToggle={onToggle} />);

    // The vendored Toggle renders role="switch", not a button (client/INSIGHTS.md).
    screen.getByRole("switch").click();
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

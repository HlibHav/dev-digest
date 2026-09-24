import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import type { Skill } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../../../messages/en/skills.json";
import { SkillRow } from "./SkillRow";

afterEach(cleanup);

const SKILL = {
  id: "sk1",
  name: "breaking-change",
  description: "Flag any change that breaks a deployed caller.",
  type: "rubric",
  enabled: true,
  source: "manual",
} as unknown as Skill;

function renderRow(attached: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <DndContext>
        <SortableContext items={attached ? [SKILL.id] : []}>
          <SkillRow skill={SKILL} attached={attached} onToggle={vi.fn()} />
        </SortableContext>
      </DndContext>
    </NextIntlClientProvider>,
  );
}

describe("SkillRow drag handle", () => {
  it("an attached skill gets a working drag handle", () => {
    renderRow(true);
    expect(screen.getByRole("button", { name: "Reorder breaking-change" })).toBeInTheDocument();
  });

  it("an unattached skill shows the handle, but it cannot drag", () => {
    const { container } = renderRow(false);
    expect(screen.queryByRole("button", { name: /reorder/i })).toBeNull();
    expect(container.querySelector('[data-drag-handle="inactive"]')).not.toBeNull();
  });
});

/* SkillRow — one skill in the agent's Skills tab: drag handle, checkbox, name,
   type badge. The shape follows the design: no description and no position
   number, because the row's whole job is to say what is attached and in what
   order the prompt will carry it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Checkbox, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { isSkillUntrusted } from "@devdigest/shared/contracts/knowledge";
import { SkillTypeBadge } from "../../../../../../../../../components/skill-type-badge";
import { s } from "./styles";

export function SkillRow({
  skill,
  attached,
  onToggle,
}: {
  skill: Skill;
  attached: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  // Only an attached skill has a position in the prompt, so only it is sortable.
  const sortable = useSortable({ id: skill.id, disabled: !attached });

  // A skill reaches the prompt only when it is attached AND enabled in the
  // library, so an attached-but-unvetted skill contributes nothing. Say so on
  // the row instead of letting it look active.
  const inert = attached && !skill.enabled;

  return (
    <div
      ref={sortable.setNodeRef}
      style={s.row(attached, sortable.isDragging, {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      })}
    >
      {attached ? (
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={t("skills.dragHandle", { name: skill.name })}
          style={s.handle}
        >
          <Icon.Menu size={14} />
        </button>
      ) : (
        // Shown so every row reads the same, but only an attached skill has a
        // position in the prompt, so this one cannot be dragged.
        <span data-drag-handle="inactive" aria-hidden style={s.handleInactive}>
          <Icon.Menu size={14} />
        </span>
      )}

      <Checkbox checked={attached} onChange={onToggle} />

      <span className="mono" style={s.name(inert)} title={skill.description}>
        {skill.name}
      </span>

      {inert && (
        <Badge color="var(--warn)" icon="AlertTriangle">
          {isSkillUntrusted(skill.source)
            ? tSkills("listItem.needsVetting")
            : tSkills("preview.disabled")}
        </Badge>
      )}

      <SkillTypeBadge type={skill.type} />
    </div>
  );
}

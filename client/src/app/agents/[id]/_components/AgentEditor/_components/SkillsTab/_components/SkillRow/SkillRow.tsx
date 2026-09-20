/* SkillRow — one skill in the agent's Skills tab. Attached rows carry a drag
   handle and are sortable; available rows are plain. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { isSkillUntrusted } from "@devdigest/shared/contracts/knowledge";
import { SkillTypeBadge } from "../../../../../../../../../components/skill-type-badge";
import { s } from "./styles";

export function SkillRow({
  skill,
  attached,
  position,
  onToggle,
}: {
  skill: Skill;
  attached: boolean;
  /** 1-based prompt order; shown only for attached rows. */
  position?: number;
  onToggle: () => void;
}) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
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
        <span style={s.handlePlaceholder} />
      )}

      {position != null && <span style={s.position}>{position}</span>}

      <div style={s.text}>
        <span style={s.name(inert)}>{skill.name}</span>
        <span style={s.description}>{skill.description}</span>
      </div>

      <SkillTypeBadge type={skill.type} />

      {inert && (
        <Badge color="var(--warn)" icon="AlertTriangle">
          {isSkillUntrusted(skill.source)
            ? tSkills("listItem.needsVetting")
            : tSkills("preview.disabled")}
        </Badge>
      )}

      <Toggle on={attached} onChange={onToggle} size={14} />
    </div>
  );
}

/* SkillCard — name, type, description and the vetting toggle. Clicking the card
   opens the skill in the preview pane beside the grid. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
// Deep import on purpose: the vendored barrel re-exports with ESM `.js`
// specifiers that the Next bundler cannot resolve, so a RUNTIME value has to
// come from the contract file directly. Type-only imports are unaffected.
import { isSkillUntrusted } from "@devdigest/shared/contracts/knowledge";
import { SkillTypeBadge } from "../../../../../../components/skill-type-badge";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
  onDelete,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("skills");
  // An imported body is third-party text: until someone reads it and enables
  // the skill, it contributes nothing to any prompt.
  const needsVetting = isSkillUntrusted(skill.source) && !skill.enabled;

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title={t("card.delete")}
            aria-label={t("card.delete")}
            style={s.deleteBtn}
          >
            <Icon.Trash size={14} />
          </button>
        )}
      </div>

      <div style={s.description}>{skill.description || t("card.noDescription")}</div>

      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <span style={s.version}>{t("preview.version", { version: skill.version })}</span>
        {needsVetting && (
          <Badge color="var(--warn)" icon="AlertTriangle">
            {t("listItem.needsVetting")}
          </Badge>
        )}
      </div>
    </div>
  );
}

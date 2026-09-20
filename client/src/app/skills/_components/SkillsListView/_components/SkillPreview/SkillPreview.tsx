/* SkillPreview — the right pane: the body as rendered markdown, the vetting
   toggle, the version, and the way into the editor. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Markdown, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
// Deep import on purpose: the vendored barrel re-exports with ESM `.js`
// specifiers that the Next bundler cannot resolve, so a RUNTIME value has to
// come from the contract file directly. Type-only imports are unaffected.
import { isSkillUntrusted } from "@devdigest/shared/contracts/knowledge";
import { TYPE_COLOR } from "../../constants";
import { s } from "./styles";

export function SkillPreview({
  skill,
  onEdit,
  onToggle,
}: {
  skill: Skill;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const untrusted = isSkillUntrusted(skill.source);

  return (
    <div style={s.pane}>
      <div style={s.header}>
        <span style={s.name}>{skill.name}</span>
        <span style={s.version}>{t("preview.version", { version: skill.version })}</span>
      </div>

      <div style={s.badges}>
        <Badge color={TYPE_COLOR[skill.type]} dot>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge color="var(--text-secondary)">{t(`listItem.source.${skill.source}`)}</Badge>
        {untrusted && (
          <Badge color="var(--warn)" icon="AlertTriangle">
            {t("preview.untrustedBadge")}
          </Badge>
        )}
      </div>

      {skill.description && <p style={s.description}>{skill.description}</p>}

      {untrusted && <div style={s.notice}>{t("preview.untrustedNotice")}</div>}

      <div style={s.controls}>
        <div style={s.toggleRow}>
          <Toggle on={skill.enabled} onChange={onToggle} size={16} />
          <span style={s.toggleLabel}>
            {skill.enabled ? t("preview.enabled") : t("preview.disabled")}
          </span>
        </div>
        <Button kind="ghost" size="sm" icon="Edit" onClick={onEdit}>
          {t("preview.edit")}
        </Button>
      </div>

      <div style={s.bodyLabel}>{t("preview.bodyLabel")}</div>
      <div style={s.body}>
        <Markdown>{skill.body}</Markdown>
      </div>
      <p style={s.hint}>{t("preview.bodyHint")}</p>
    </div>
  );
}

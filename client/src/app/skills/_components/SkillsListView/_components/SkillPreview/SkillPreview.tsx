/* SkillPreview — the right pane: the body as rendered markdown, the vetting
   toggle, the version, and the way into the editor. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Markdown, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
// Deep import on purpose: the vendored barrel re-exports with ESM `.js`
// specifiers that the Next bundler cannot resolve, so a RUNTIME value has to
// come from the contract file directly. Type-only imports are unaffected.
import { isSkillUntrusted } from "@devdigest/shared/contracts/knowledge";
import { SkillTypeBadge } from "../../../../../../components/skill-type-badge";
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
  const router = useRouter();
  const untrusted = isSkillUntrusted(skill.source);

  return (
    <div style={s.pane}>
      <div style={s.header}>
        <span style={s.name}>{skill.name}</span>
        <span style={s.version}>{t("preview.version", { version: skill.version })}</span>
      </div>

      <div style={s.badges}>
        <SkillTypeBadge type={skill.type} />
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
        {/* The card click belongs to this panel — a fast look while triaging.
            Opening the full page is its own, explicit action. */}
        <Button
          kind="secondary"
          size="sm"
          icon="ExternalLink"
          onClick={() => router.push(`/skills/${skill.id}`)}
        >
          {t("preview.open")}
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

/* SkillEditorModal — create a skill, or edit an existing one. The same form for
   both: a skill is a name, a description, a type and a markdown body. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, Textarea, TextInput } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { SKILL_TYPES } from "../../constants";
import { s } from "./styles";

export function SkillEditorModal({
  skill,
  onClose,
  onSaved,
}: {
  /** Omitted when creating. */
  skill?: Skill;
  onClose: () => void;
  onSaved?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const update = useUpdateSkill();

  const [name, setName] = React.useState(skill?.name ?? "");
  const [description, setDescription] = React.useState(skill?.description ?? "");
  const [type, setType] = React.useState<SkillType>(skill?.type ?? "custom");
  const [body, setBody] = React.useState(skill?.body ?? "");

  const pending = create.isPending || update.isPending;
  const valid = name.trim().length > 0 && body.trim().length > 0;

  function save() {
    if (!valid || pending) return;
    const done = (saved: Skill) => {
      onSaved?.(saved);
      onClose();
    };
    if (skill) {
      update.mutate({ id: skill.id, patch: { name, description, type, body } }, { onSuccess: done });
    } else {
      create.mutate({ name, description, type, body }, { onSuccess: done });
    }
  }

  return (
    <Modal
      width={720}
      title={skill ? t("create.editTitle") : t("create.title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" size="sm" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" size="sm" onClick={save} disabled={!valid || pending}>
            {pending ? t("create.saving") : t("create.save")}
          </Button>
        </div>
      }
    >
      <FormField label={t("create.fields.name")} required>
        <TextInput value={name} onChange={setName} placeholder={t("create.fields.namePlaceholder")} mono />
      </FormField>

      {/* The description is the skill's interface — what decides whether the
          skill applies — so the hint asks for an instruction, not a topic. */}
      <FormField label={t("create.fields.description")} hint={t("create.fields.descriptionHint")}>
        <TextInput
          value={description}
          onChange={setDescription}
          placeholder={t("create.fields.descriptionPlaceholder")}
        />
      </FormField>

      <FormField label={t("create.fields.type")}>
        <SelectInput
          value={type}
          onChange={(v) => setType(v as SkillType)}
          options={SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }))}
        />
      </FormField>

      <FormField
        label={t("create.fields.body")}
        required
        hint={skill ? t("preview.bodyHint") : t("create.fields.bodyHint")}
      >
        <Textarea
          value={body}
          onChange={setBody}
          rows={14}
          mono
          placeholder={t("create.fields.bodyPlaceholder")}
        />
      </FormField>
    </Modal>
  );
}

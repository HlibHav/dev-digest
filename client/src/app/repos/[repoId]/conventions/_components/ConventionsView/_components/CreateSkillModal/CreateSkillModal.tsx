/* CreateSkillModal — turn the accepted conventions into one skill.

   The body is pre-filled from the accepted candidates and stays EDITABLE: the
   extractor's wording is a draft, and the person who approved the rules is the
   one who knows how they should read to a reviewer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, Textarea, TextInput } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import {
  useConventionSkillPreview,
  useCreateConventionSkill,
} from "@/lib/hooks/conventions";
import { s } from "./styles";

export function CreateSkillModal({
  repoId,
  acceptedCount,
  agents,
  onClose,
  onCreated,
}: {
  repoId: string;
  acceptedCount: number;
  agents: Agent[];
  onClose: () => void;
  onCreated?: (skill: Skill) => void;
}) {
  const t = useTranslations("conventions");
  const preview = useConventionSkillPreview(repoId, true);
  const create = useCreateConventionSkill();

  const [name, setName] = React.useState("repo-conventions");
  const [description, setDescription] = React.useState("");
  const [body, setBody] = React.useState("");
  const [agentId, setAgentId] = React.useState("");
  const [touchedBody, setTouchedBody] = React.useState(false);

  // Fill the editor once the generated body arrives, but never clobber text the
  // user has already started changing.
  React.useEffect(() => {
    if (!touchedBody && preview.data?.body) setBody(preview.data.body);
  }, [preview.data?.body, touchedBody]);

  const valid = name.trim().length > 0 && body.trim().length > 0;

  function save() {
    if (!valid || create.isPending) return;
    create.mutate(
      {
        repoId,
        name: name.trim(),
        description: description.trim(),
        body,
        ...(agentId ? { agent_id: agentId } : {}),
      },
      {
        onSuccess: (skill) => {
          onCreated?.(skill);
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      width={760}
      title={t("createModal.title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" size="sm" onClick={onClose}>
            {t("createModal.cancel")}
          </Button>
          <Button kind="primary" size="sm" onClick={save} disabled={!valid || create.isPending}>
            {create.isPending ? t("createModal.creating") : t("createModal.create")}
          </Button>
        </div>
      }
    >
      <p style={s.intro}>{t("createModal.intro", { count: acceptedCount })}</p>

      <div style={s.fields}>
        <FormField label={t("createModal.name")} required>
          <TextInput value={name} onChange={setName} />
        </FormField>
        <FormField label={t("createModal.description")} hint={t("createModal.descriptionHint")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label={t("createModal.body")} hint={t("createModal.bodyHint")} required>
          <Textarea
            value={preview.isLoading && !touchedBody ? t("createModal.loadingBody") : body}
            onChange={(v) => {
              setTouchedBody(true);
              setBody(v);
            }}
            rows={16}
            mono
          />
        </FormField>
        <FormField label={t("createModal.agent")} hint={t("createModal.agentHint")}>
          <SelectInput
            value={agentId}
            onChange={setAgentId}
            options={[
              { value: "", label: t("createModal.agentNone") },
              ...agents.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </FormField>
      </div>

      {create.isError && (
        <p style={s.error}>
          {create.error instanceof Error ? create.error.message : t("createModal.failed")}
        </p>
      )}
    </Modal>
  );
}

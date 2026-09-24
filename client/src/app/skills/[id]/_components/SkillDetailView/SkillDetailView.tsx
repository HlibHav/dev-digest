/* /skills/:id — one skill in full: its config, how its body renders, and the
   history of that body.

   The list page keeps its side-panel preview (a fast look while triaging); this
   page is where a skill is actually worked on. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  ErrorState,
  FormField,
  Icon,
  Markdown,
  SelectInput,
  Skeleton,
  Tabs,
  Textarea,
  TextInput,
} from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { SkillTypeBadge } from "@/components/skill-type-badge";
import { useSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { SKILL_TYPES } from "../../../_components/SkillsListView/constants";
import { VersionsTab } from "./_components/VersionsTab";
import { s } from "./styles";

const TABS = ["config", "preview", "versioning"] as const;
type TabKey = (typeof TABS)[number];

export function SkillDetailView() {
  const t = useTranslations("skills");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const id = params?.id ?? "";

  const { data: skill, isLoading, isError, refetch } = useSkill(id);
  const update = useUpdateSkill();

  // Tab lives in the URL, like the agent editor — a link to a tab is shareable.
  const raw = search?.get("tab");
  const tab: TabKey = (TABS as readonly string[]).includes(raw ?? "") ? (raw as TabKey) : "config";
  const setTab = (next: string) => router.replace(`/skills/${id}?tab=${next}`);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");
  const [loadedId, setLoadedId] = React.useState<string | null>(null);

  // Load the form once per skill, and again after a save or restore replaces
  // the body — but never while the user is mid-edit on the same version.
  const stamp = skill ? `${skill.id}:${skill.version}` : null;
  React.useEffect(() => {
    if (!skill || stamp === loadedId) return;
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setLoadedId(stamp);
  }, [skill, stamp, loadedId]);

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? "…" },
  ];

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <ErrorState body={t("page.loadError")} onRetry={() => void refetch()} />
        </div>
      </AppShell>
    );
  }
  if (isLoading || !skill) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <Skeleton height={220} />
        </div>
      </AppShell>
    );
  }

  const dirty =
    name !== skill.name ||
    description !== skill.description ||
    type !== skill.type ||
    body !== skill.body;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
          <h1 style={s.name}>{skill.name}</h1>
          <SkillTypeBadge type={skill.type} />
          <Badge color="var(--text-secondary)">
            {t("preview.version", { version: skill.version })}
          </Badge>
          {skill.agent_count != null && (
            <Badge color="var(--text-secondary)" icon="Cpu">
              {t("card.agentCount", { count: skill.agent_count })}
            </Badge>
          )}
          <span style={s.spacer} />
          <Button kind="ghost" size="sm" icon="ArrowRight" onClick={() => router.push("/skills")}>
            {t("detailPage.backToLibrary")}
          </Button>
        </div>
        <p style={s.description}>{skill.description || t("card.noDescription")}</p>

        <div style={s.tabsBar}>
          <Tabs
            tabs={TABS.map((k) => ({ key: k, label: t(`detailPage.tabs.${k}`) }))}
            value={tab}
            onChange={setTab}
          />
        </div>

        {tab === "config" && (
          <div style={s.fields}>
            <FormField label={t("create.fields.name")} required>
              <TextInput value={name} onChange={setName} />
            </FormField>
            <FormField label={t("create.fields.description")}>
              <TextInput value={description} onChange={setDescription} />
            </FormField>
            <FormField label={t("create.fields.type")}>
              <SelectInput
                value={type}
                onChange={(v) => setType(v as SkillType)}
                options={SKILL_TYPES.map((k) => ({ value: k, label: t(`listItem.type.${k}`) }))}
              />
            </FormField>
            <FormField label={t("create.fields.body")} hint={t("detailPage.bodyHint")} required>
              <Textarea value={body} onChange={setBody} rows={18} mono />
            </FormField>
            <div style={s.actions}>
              <Button
                kind="primary"
                size="sm"
                disabled={!dirty || !name.trim() || !body.trim() || update.isPending}
                onClick={() =>
                  update.mutate({ id: skill.id, patch: { name, description, type, body } })
                }
              >
                {update.isPending ? t("detailPage.saving") : t("detailPage.save")}
              </Button>
            </div>
          </div>
        )}

        {tab === "preview" && (
          <div style={s.preview}>
            <Markdown>{skill.body}</Markdown>
          </div>
        )}

        {tab === "versioning" && <VersionsTab skill={skill} />}
      </div>
    </AppShell>
  );
}

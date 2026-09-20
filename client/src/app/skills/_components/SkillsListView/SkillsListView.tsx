/* /skills — the skill library. A grid of skill cards on the left, a preview of
   the selected skill on the right, and one Add button that either opens the
   editor or the import drawer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill, useDeleteSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "./_components/SkillCard";
import { SkillPreview } from "./_components/SkillPreview";
import { SkillEditorModal } from "./_components/SkillEditorModal";
import { ImportSkillDrawer } from "./_components/ImportSkillDrawer";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Skill | "new" | null>(null);
  const [importing, setImporting] = React.useState(false);

  const list = filterSkills(skills ?? [], search);
  const selected = (skills ?? []).find((sk) => sk.id === selectedId) ?? null;

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {editing && (
        <SkillEditorModal
          {...(editing !== "new" ? { skill: editing } : {})}
          onClose={() => setEditing(null)}
          onSaved={(saved) => setSelectedId(saved.id)}
        />
      )}
      {importing && (
        <ImportSkillDrawer
          onClose={() => setImporting(false)}
          onImported={(saved) => setSelectedId(saved.id)}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.count", { count: skills?.length ?? 0 })}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={260}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: () => setEditing("new") },
              { label: t("page.menu.import"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setEditing("new")}
          />
        )}

        {list.length > 0 && (
          <div style={s.split}>
            <div style={s.grid}>
              {list.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  active={skill.id === selectedId}
                  onClick={() => setSelectedId(skill.id)}
                  onToggle={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
                  onDelete={() => {
                    if (window.confirm(t("page.deleteConfirm", { name: skill.name }))) {
                      if (skill.id === selectedId) setSelectedId(null);
                      del.mutate(skill.id);
                    }
                  }}
                />
              ))}
            </div>

            <aside style={s.aside}>
              {selected ? (
                <SkillPreview
                  skill={selected}
                  onEdit={() => setEditing(selected)}
                  onToggle={(enabled) => update.mutate({ id: selected.id, patch: { enabled } })}
                />
              ) : (
                <div style={s.asidePlaceholder}>
                  <div style={s.asidePlaceholderTitle}>{t("page.selectPrompt.title")}</div>
                  <div style={s.asidePlaceholderBody}>{t("page.selectPrompt.body")}</div>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}

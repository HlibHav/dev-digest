/* ContextTab — attach repo docs to this skill. Any agent carrying the skill
   inherits them. Shows the token total, a display-only budget warning, and a
   "Serializes as" preview of the attached paths grouped by doc type. The preview
   is not the prompt text; the run keeps the skill's order. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextFiles } from "@/lib/hooks/core";
import { useSkillContext, useSetSkillContext } from "@/lib/hooks/project-context";
import {
  CONTEXT_TOKEN_BUDGET,
  ContextDocList,
  DocPreviewModal,
  buildAgentRows,
  exceedsTokenBudget,
  moveDoc,
  toggleDoc,
  type ContextDocListLabels,
} from "@/components/context-doc-list";
import { groupSerializedPaths } from "./helpers";
import { s } from "./styles";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;
  const filesQuery = useContextFiles(repoId);
  const ctxQuery = useSkillContext(skill.id, repoId);
  const setCtx = useSetSkillContext();
  const [filter, setFilter] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const serializesAsId = React.useId();

  const labels: ContextDocListLabels = {
    preview: t("context.preview"),
    notInRepo: t("context.notInRepo"),
    // A skill has no inherited rows; present only to satisfy the shared shape.
    inheritedFrom: () => "",
    dragHandle: (path) => t("context.dragHandle", { path }),
    select: (path) => t("context.select", { path }),
    tokens: (count) => t("context.tokens", { tokens: count }),
    empty: t("context.noDocs"),
  };

  const ctx = ctxQuery.data;
  const ownPaths = React.useMemo(() => {
    const pending = setCtx.isPending ? setCtx.variables?.paths : undefined;
    return pending ?? [...(ctx?.attached ?? [])].sort((a, b) => a.order - b.order).map((a) => a.path);
  }, [ctx, setCtx.isPending, setCtx.variables]);

  if (!repoId) {
    return (
      <div style={s.panel}>
        <EmptyState title={t("context.noRepoTitle")} body={t("context.noRepoBody")} />
      </div>
    );
  }
  if (filesQuery.isLoading || ctxQuery.isLoading) {
    return (
      <div style={s.panel}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (filesQuery.isError || ctxQuery.isError || !filesQuery.data || !ctx) {
    return (
      <ErrorState
        body={t("context.loadError")}
        onRetry={() => {
          void filesQuery.refetch();
          void ctxQuery.refetch();
        }}
      />
    );
  }
  if (!filesQuery.data.cloned) {
    return (
      <div style={s.panel}>
        <EmptyState title={t("context.notClonedTitle")} body={t("context.notClonedBody")} />
      </div>
    );
  }

  const rows = buildAgentRows(filesQuery.data.files, { attached: ctx.attached, inherited: [] });
  const tokens = ctx.attached.reduce((sum, a) => sum + (a.present ? a.tokens : 0), 0);
  const groups = groupSerializedPaths(ctx.attached, filesQuery.data.files);
  const commit = (paths: string[]) => setCtx.mutate({ skillId: skill.id, paths });

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <Badge color="var(--accent)">{t("context.attachedCount", { count: ownPaths.length })}</Badge>
        <span className="mono" style={s.tokens}>
          {t("context.tokens", { tokens })}
        </span>
        {exceedsTokenBudget(tokens) && (
          <span style={s.overBudget}>
            {t("context.overBudget", { budget: CONTEXT_TOKEN_BUDGET })}
          </span>
        )}
        <span style={s.spacer} />
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("context.filterPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>

      <p style={s.hint}>{t("context.hint")}</p>

      <ContextDocList
        rows={rows}
        filter={filter}
        labels={labels}
        onToggle={(path) => commit(toggleDoc(ownPaths, path))}
        onReorder={(from, to) => commit(moveDoc(ownPaths, ownPaths.indexOf(from), ownPaths.indexOf(to)))}
        onPreview={setPreviewPath}
      />

      {groups.length > 0 && (
        <>
          <div id={serializesAsId} style={s.label}>
            {t("context.serializesAs")}
          </div>
          <section aria-labelledby={serializesAsId} className="mono" style={s.serialized}>
            {groups.map(({ group, paths }) => (
              <React.Fragment key={group}>
                <h3 style={s.groupHeading}>{t(`context.serializeGroups.${group}`)}</h3>
                <ul style={s.groupList}>
                  {paths.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              </React.Fragment>
            ))}
          </section>
        </>
      )}

      {previewPath && (
        <DocPreviewModal
          repoId={repoId}
          path={previewPath}
          errorLabel={t("context.previewError")}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}

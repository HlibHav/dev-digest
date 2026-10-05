/* ContextTab — attach repo docs to this agent and set the order they appear in
   the `## Project context` block. Like the Skills tab, the order IS the payload:
   every change sends the full ordered own paths. Docs a skill carries show as
   inherited and can only be detached on the skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextFiles } from "@/lib/hooks/core";
import { useAgentContext, useSetAgentContext } from "@/lib/hooks/project-context";
import {
  CONTEXT_TOKEN_BUDGET,
  ContextDocList,
  DocPreviewModal,
  buildAgentRows,
  contextTotals,
  exceedsTokenBudget,
  isPerFileStrategy,
  moveDoc,
  toggleDoc,
  type ContextDocListLabels,
} from "@/components/context-doc-list";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;
  const filesQuery = useContextFiles(repoId);
  const ctxQuery = useAgentContext(agent.id, repoId);
  const setCtx = useSetAgentContext();
  const [filter, setFilter] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const labels: ContextDocListLabels = {
    preview: t("context.preview"),
    notInRepo: t("context.notInRepo"),
    inheritedFrom: (skill) => t("context.inheritedFrom", { skill }),
    dragHandle: (path) => t("context.dragHandle", { path }),
    select: (path) => t("context.select", { path }),
    tokens: (count) => t("context.tokens", { tokens: count }),
    empty: t("context.noDocs"),
  };

  const ctx = ctxQuery.data;
  // Server order is the truth; while a write is in flight its variables stand in.
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

  const rows = buildAgentRows(filesQuery.data.files, ctx);
  const totals = contextTotals(ctx);
  const commit = (paths: string[]) => setCtx.mutate({ agentId: agent.id, paths });

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("context.title")}</h2>
        <Badge color="var(--accent)">
          {t("context.attachedCount", { attached: ownPaths.length, total: filesQuery.data.files.length })}
        </Badge>
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

      <p style={s.hint}>{t("context.orderHint")}</p>

      <ContextDocList
        rows={rows}
        filter={filter}
        labels={labels}
        onToggle={(path) => commit(toggleDoc(ownPaths, path))}
        onReorder={(from, to) => commit(moveDoc(ownPaths, ownPaths.indexOf(from), ownPaths.indexOf(to)))}
        onPreview={setPreviewPath}
      />

      <div style={s.header}>
        <span className="mono">{t("context.tokens", { tokens: totals.total })}</span>
        {totals.inherited > 0 && (
          <span className="mono" style={{ color: "var(--text-muted)" }}>
            {t("context.inheritedTokens", { tokens: totals.inherited })}
          </span>
        )}
        <span style={s.spacer} />
        <span style={s.hint}>{t("context.untrustedNote")}</span>
      </div>
      {exceedsTokenBudget(totals.total) && (
        <p style={s.overBudget}>{t("context.overBudget", { budget: CONTEXT_TOKEN_BUDGET })}</p>
      )}
      {isPerFileStrategy(agent.strategy) && <p style={s.hint}>{t("context.perFileNote")}</p>}

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

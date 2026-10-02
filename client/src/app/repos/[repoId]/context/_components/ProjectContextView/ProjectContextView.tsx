/* /repos/:repoId/context — read-only browser of the repo's Markdown docs.
   What gets attached to an agent or skill is chosen on their Context tabs. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useContextFiles, useReindexContext } from "@/lib/hooks/core";
import { DocPreview } from "./_components/DocPreview";
import { DocTree } from "./_components/DocTree";
import { buildDocTree, formatScanTime, totalTokens } from "./helpers";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params?.repoId ?? "";
  const { data, isLoading, isError, refetch } = useContextFiles(repoId);
  const reindex = useReindexContext();
  const [selected, setSelected] = React.useState<string | null>(null);

  const crumb = [{ label: t("title") }];
  const files = data?.files ?? [];
  const tree = React.useMemo(() => buildDocTree(files), [files]);
  const current = files.find((f) => f.path === selected) ?? null;

  let body: React.ReactNode;
  if (!repoId) {
    body = <EmptyState icon="Folder" title={t("noRepo.title")} body={t("noRepo.body")} />;
  } else if (isLoading) {
    body = (
      <div style={s.center}>
        <Skeleton />
      </div>
    );
  } else if (isError) {
    body = <ErrorState title={t("loadError")} onRetry={() => refetch()} />;
  } else if (data && !data.cloned) {
    body = <EmptyState icon="Folder" title={t("notCloned.title")} body={t("notCloned.body")} />;
  } else if (files.length === 0) {
    body = <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body")} />;
  } else {
    body = (
      <div style={s.layout}>
        <aside style={s.side}>
          <div style={s.sideHead}>
            <div style={s.eyebrow}>{t("treeLabel")}</div>
            <Button
              size="sm"
              kind="ghost"
              icon="RefreshCw"
              loading={reindex.isPending}
              onClick={() => reindex.mutate(repoId)}
            >
              {reindex.isPending ? t("refreshing") : t("refresh")}
            </Button>
          </div>
          <div style={s.tree}>
            <DocTree nodes={tree} selected={selected} onSelect={setSelected} />
          </div>
          <div style={s.footer}>
            <div>
              <span>{t("filesCount", { count: files.length })}</span>
              {" · "}
              <span>{t("tokensTotal", { count: totalTokens(files) })}</span>
            </div>
            {data?.scanned_at && (
              <div>{t("scannedAt", { time: formatScanTime(data.scanned_at) })}</div>
            )}
          </div>
        </aside>
        {current ? (
          <DocPreview repoId={repoId} file={current} />
        ) : (
          <div style={{ ...s.main, ...s.center }}>
            <span style={s.usedBy}>{t("selectPrompt")}</span>
          </div>
        )}
      </div>
    );
  }

  return <AppShell crumb={crumb}>{body}</AppShell>;
}

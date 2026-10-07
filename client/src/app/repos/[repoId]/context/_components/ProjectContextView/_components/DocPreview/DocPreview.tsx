/* Read-only Markdown preview of one doc. The vendored Markdown renders no raw
   HTML and drops javascript: URLs (react-markdown defaults). The Edit tab is
   "coming soon": disabled, it does nothing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { useContextDoc } from "@/lib/hooks/project-context";
import { s } from "../../styles";

export function DocPreview({ repoId, file }: { repoId: string; file: SpecFile }) {
  const t = useTranslations("context");
  const { data, isLoading, isError } = useContextDoc(repoId, file.path);

  return (
    <div style={s.main}>
      <div style={s.mainHead}>
        <span className="mono" style={s.path}>
          {file.path}
        </span>
        <div role="tablist" aria-label={t("tabs.label")} style={s.tabs}>
          <button type="button" role="tab" aria-selected="true" style={{ ...s.tab, ...s.tabActive }}>
            {t("tabs.preview")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="false"
            disabled
            aria-label={t("tabs.editComingSoon")}
            title={t("tabs.editComingSoon")}
            style={{ ...s.tab, ...s.tabDisabled }}
          >
            {t("tabs.edit")}
          </button>
        </div>
        <span style={s.spacer} />
        <span style={s.usedBy}>
          {t("usedBy", { agents: file.used_by.agents, skills: file.used_by.skills })}
        </span>
      </div>
      <div style={s.preview}>
        {isLoading ? (
          <Skeleton />
        ) : isError ? (
          <ErrorState title={t("docLoadError")} />
        ) : (
          <Markdown>{data?.content}</Markdown>
        )}
      </div>
    </div>
  );
}

/* Read-only Markdown preview of one doc. The vendored Markdown renders no raw
   HTML and drops javascript: URLs (react-markdown defaults). */
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

"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingItem } from "@devdigest/shared";
import { githubBlobUrl } from "../../helpers";
import { s } from "./styles";

export function FileRows({
  items,
  repoFullName,
  commitSha,
}: {
  items: OnboardingItem[];
  repoFullName: string;
  commitSha: string;
}) {
  const t = useTranslations("onboarding");
  return (
    <div style={s.list}>
      {items.map((item, i) => (
        <div key={`${item.path ?? item.title ?? ""}-${i}`} style={s.row}>
          <Icon.FileText size={14} aria-hidden />
          <div style={s.text}>
            {item.title && <span style={s.title}>{item.title}</span>}
            {item.path && (
              <span className="mono" style={s.path} title={item.path}>
                {item.path}
              </span>
            )}
            {item.reason && <span style={s.reason}>{`— ${item.reason}`}</span>}
          </div>
          {item.path && (
            <a
              href={githubBlobUrl(repoFullName, commitSha, item.path)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("openAria", { path: item.path })}
              style={s.open}
            >
              {t("open")}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

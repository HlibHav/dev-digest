"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingItem } from "@devdigest/shared";
import { s } from "./styles";

export function ReadingList({ items }: { items: OnboardingItem[] }) {
  const t = useTranslations("onboarding");
  return (
    <div>
      <div style={s.hint}>{t("readingOrder")}</div>
      <ol style={s.list}>
        {items.map((item, i) => (
          <li key={`${item.path ?? ""}-${i}`} style={s.item}>
            <span style={s.badge}>{i + 1}</span>
            <div style={s.body}>
              {item.path && (
                <span className="mono" style={s.path} title={item.path}>
                  {item.path}
                </span>
              )}
              {item.reason && <div style={s.reason}>{item.reason}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

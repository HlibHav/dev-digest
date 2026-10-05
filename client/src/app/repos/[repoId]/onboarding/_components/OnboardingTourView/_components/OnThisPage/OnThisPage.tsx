"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingTourSection } from "@devdigest/shared";
import { s } from "./styles";

export function OnThisPage({
  sections,
  active,
  onSelect,
}: {
  sections: OnboardingTourSection[];
  active: string | null;
  onSelect: (kind: string) => void;
}) {
  const t = useTranslations("onboarding");
  return (
    <nav aria-label={t("onThisPage")} style={s.nav}>
      <div style={s.eyebrow}>{t("onThisPage")}</div>
      {sections.map((sec) => (
        <a
          key={sec.kind}
          href={`#tour-${sec.kind}`}
          style={{ ...s.link, ...(active === sec.kind ? s.linkActive : null) }}
          onClick={(e) => {
            e.preventDefault();
            onSelect(sec.kind);
            document
              .getElementById(`tour-${sec.kind}`)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          {sec.title}
        </a>
      ))}
    </nav>
  );
}

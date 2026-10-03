"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingTourSection } from "@devdigest/shared";
import { FALLBACK_ICON, SECTION_ICONS } from "../../constants";
import { CommandRows } from "../CommandRows";
import { FileRows } from "../FileRows";
import { OverviewBody } from "../OverviewBody";
import { ReadingList } from "../ReadingList";
import { s } from "./styles";

function SectionBody({
  section,
  repoFullName,
  commitSha,
}: {
  section: OnboardingTourSection;
  repoFullName: string;
  commitSha: string;
}) {
  const items = section.items ?? [];
  switch (section.kind) {
    case "architecture":
      return <OverviewBody body={section.body} diagram={section.diagram} />;
    case "critical_paths":
    case "first_tasks":
      return <FileRows items={items} repoFullName={repoFullName} commitSha={commitSha} />;
    case "run_locally":
      return <CommandRows items={items} />;
    case "reading_path":
      return <ReadingList items={items} />;
    default:
      return null;
  }
}

export function TourSection({
  section,
  repoFullName,
  commitSha,
}: {
  section: OnboardingTourSection;
  repoFullName: string;
  commitSha: string;
}) {
  const t = useTranslations("onboarding");
  const [open, setOpen] = React.useState(true);
  const I = Icon[SECTION_ICONS[section.kind] ?? FALLBACK_ICON];
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  return (
    <section id={`tour-${section.kind}`} style={s.card}>
      <button type="button" aria-expanded={open} style={s.header} onClick={() => setOpen((o) => !o)}>
        <span style={s.iconBox} aria-hidden>
          <I size={16} />
        </span>
        <span style={s.title}>{section.title}</span>
        <Chevron size={16} aria-hidden />
      </button>
      {open &&
        (section.notice ? (
          <div style={s.notice}>{section.notice}</div>
        ) : (
          <SectionBody section={section} repoFullName={repoFullName} commitSha={commitSha} />
        ))}
    </section>
  );
}

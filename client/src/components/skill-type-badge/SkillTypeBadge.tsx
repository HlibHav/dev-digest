/* SkillTypeBadge — a skill's type as a coloured dot badge.

   Promoted to src/components on its second route (rule 2): the /skills library
   renders it on cards, in the preview and in the import drawer, and the agent
   editor's Skills tab renders it on every row. Before this it lived in the
   /skills route's private constants and the agent route reached across for it,
   which rule 7 forbids. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { TYPE_COLOR } from "./constants";

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  return (
    <Badge color={TYPE_COLOR[type]} dot>
      {t(`listItem.type.${type}`)}
    </Badge>
  );
}

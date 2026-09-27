"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { usePrIntent, useRederiveIntent } from "../../../../../../../lib/hooks/reviews";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
  /** The PR's current head — the intent card flags an intent derived for an older one. */
  headSha?: string | null;
}

export function OverviewTab({ prId, prBody, headSha }: OverviewTabProps) {
  const { data: intent, isLoading } = usePrIntent(prId);
  const rederive = useRederiveIntent(prId);
  return (
    <>
      <IntentCard
        intent={intent}
        isLoading={isLoading}
        currentHeadSha={headSha}
        onRederive={prId ? () => rederive.mutate() : undefined}
        rederiving={rederive.isPending}
      />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}

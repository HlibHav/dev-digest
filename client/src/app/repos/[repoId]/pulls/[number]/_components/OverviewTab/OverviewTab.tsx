"use client";

import React, { useMemo, type ComponentProps } from "react";
import { SectionLabel } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { PrBriefCard } from "./_components/PrBriefCard";
import type { OpenTarget } from "./_components/PrBriefCard/helpers";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { pickLinkSha } from "./_components/BlastRadiusCard/helpers";
import { usePrIntent, useRederiveIntent } from "../../../../../../../lib/hooks/reviews";
import { useBlastRadius, useRepoIntelStatus, useResyncRepoIntel } from "../../../../../../../lib/hooks";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
  /** The PR's current head — the intent card flags an intent derived for an older one. */
  headSha?: string | null;
  repoId: string;
  repoFullName: string | null;
  /** The PR detail request: the brief is read only once it has settled, and re-read when it refreshes. */
  detail: { status: "pending" | "success" | "error"; updatedAt: number };
  /** The PR's files; a brief row whose file is not among them cannot open Files changed. */
  files: PrFile[];
  latestReview: ComponentProps<typeof PrBriefCard>["latestReview"];
  onOpenFile: (target: OpenTarget) => void;
}

export function OverviewTab({
  prId,
  prBody,
  headSha,
  repoId,
  repoFullName,
  detail,
  files,
  latestReview,
  onOpenFile,
}: OverviewTabProps) {
  const { data: intent, isLoading } = usePrIntent(prId);
  const rederive = useRederiveIntent(prId);

  const blastQuery = useBlastRadius(prId);
  const indexState = useRepoIntelStatus(repoId);
  const resyncMutation = useResyncRepoIntel(repoId);

  const linkSha = pickLinkSha(indexState.data?.lastIndexedSha, headSha);
  const link = repoFullName && linkSha ? { repoFullName, sha: linkSha } : null;

  const prPaths = useMemo(() => new Set(files.map((f) => f.path)), [files]);

  return (
    <div style={s.grid}>
      <div style={s.fullRow}>
        <PrBriefCard
          prId={prId}
          gate={{ settled: detail.status !== "pending", refreshedAt: detail.updatedAt }}
          prPaths={prPaths}
          latestReview={latestReview}
          onOpenFile={onOpenFile}
        />
      </div>
      <IntentCard
        intent={intent}
        isLoading={isLoading}
        currentHeadSha={headSha}
        onRederive={prId ? () => rederive.mutate() : undefined}
        rederiving={rederive.isPending}
      />
      <BlastRadiusCard
        blast={blastQuery.data}
        isLoading={blastQuery.isLoading}
        isError={blastQuery.isError}
        onRetry={() => blastQuery.refetch()}
        link={link}
        resync={{
          onResync: () => resyncMutation.mutate(),
          pending: resyncMutation.isPending,
          queued: resyncMutation.isSuccess,
        }}
      />
      {prBody && (
        <section style={s.fullRow}>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </div>
  );
}

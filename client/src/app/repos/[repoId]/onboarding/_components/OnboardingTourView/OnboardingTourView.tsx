/* /repos/:repoId/onboarding — five-part guided tour of a repository. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useGenerateOnboarding, useOnboarding } from "@/lib/hooks/onboarding";
import { useRepoNotFound } from "@/lib/repo-context";
import { OnThisPage } from "./_components/OnThisPage";
import { StatusBanner } from "./_components/StatusBanner";
import { TourHeader } from "./_components/TourHeader";
import { TourSection } from "./_components/TourSection";
import { isStale } from "./helpers";
import { s } from "./styles";

export function OnboardingTourView() {
  const t = useTranslations("onboarding");
  const params = useParams<{ repoId: string }>();
  const repoId = params?.repoId ?? "";
  const { data, isLoading, isError, refetch } = useOnboarding(repoId);
  const generate = useGenerateOnboarding();
  const repoNotFound = useRepoNotFound(repoId);
  const [active, setActive] = React.useState<string | null>(null);

  const crumb = [
    ...(data?.repo_full_name ? [{ label: data.repo_full_name, mono: true }] : []),
    { label: t("title") },
  ];
  const generating = data?.state === "generating" || generate.isPending;
  const onGenerate = () => generate.mutate(repoId);
  const tour = data?.tour ?? null;

  let body: React.ReactNode;
  if (repoNotFound) {
    body = <RepoNotFound />;
  } else if (isLoading || (!data && !isError)) {
    body = (
      <div style={s.center}>
        <Skeleton />
      </div>
    );
  } else if (isError || !data) {
    body = <ErrorState title={t("loadError.title")} onRetry={() => refetch()} />;
  } else if (!data.cloned) {
    body = <EmptyState icon="Folder" title={t("notCloned.title")} body={t("notCloned.body")} />;
  } else if (!tour) {
    body = (
      <>
        {generating && (
          <div role="status" style={s.status}>
            {t("generate.generating")}
          </div>
        )}
        <EmptyState
          icon="Boxes"
          title={t("generate.title")}
          body={t("generate.body")}
          cta={t("generate.cta")}
          onCta={onGenerate}
          ctaLoading={generating}
        />
      </>
    );
  } else {
    const kinds = tour.sections.map((sec) => sec.kind);
    body = (
      <div style={s.layout}>
        <OnThisPage
          sections={tour.sections}
          active={active ?? kinds[0] ?? null}
          onSelect={setActive}
        />
        <div style={s.main}>
          <TourHeader
            repoId={repoId}
            repoFullName={data.repo_full_name}
            tour={tour}
            generating={generating}
            onRegenerate={onGenerate}
          />
          {generating && (
            <div role="status" style={s.status}>
              {t("generate.generating")}
            </div>
          )}
          <StatusBanner
            tour={tour}
            stale={isStale(tour, data.index_commit_sha)}
            generating={generating}
            onRegenerate={onGenerate}
          />
          <div style={s.sections}>
            {tour.sections.map((sec) => (
              <TourSection
                key={sec.kind}
                section={sec}
                repoFullName={data.repo_full_name}
                commitSha={tour.commit_sha}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return <AppShell crumb={crumb}>{body}</AppShell>;
}

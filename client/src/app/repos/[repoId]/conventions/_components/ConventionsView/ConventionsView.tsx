/* /repos/:repoId/conventions — the Conventions Extractor.

   Scan the repo, triage what comes back, and turn what survives into a skill.
   Every card carries evidence that was checked against the file it names, so a
   click on the path lands on the real line in GitHub. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useRepos } from "@/lib/hooks/core";
import { useAgents } from "@/lib/hooks/agents";
import {
  useConventions,
  useExtractConventions,
  usePatchConvention,
} from "@/lib/hooks/conventions";
import { CandidateCard } from "./_components/CandidateCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ScanButtons } from "./_components/ScanButtons";
import { acceptedCandidates, pendingCandidates, rejectedCount } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params?.repoId ?? "";

  const { data: repos } = useRepos();
  const { data: agents } = useAgents();
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const patch = usePatchConvention();

  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<Skill | null>(null);

  const repo = (repos ?? []).find((r) => r.id === repoId);
  const candidates = data?.candidates ?? [];
  const pending = pendingCandidates(candidates);
  const accepted = acceptedCandidates(candidates);
  const rejected = rejectedCount(candidates);
  const scan = data?.scan ?? null;
  const scanning = scan?.status === "queued" || scan?.status === "running";
  const hasScanned = scan !== null;

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  const edit = (id: string, patchBody: { rule: string; category: string }) =>
    patch.mutate({ repoId, id, patch: patchBody });

  function renderCard(c: (typeof candidates)[number]) {
    return (
      <CandidateCard
        key={c.id}
        candidate={c}
        repoFullName={repo?.full_name ?? ""}
        defaultBranch={repo?.default_branch ?? "main"}
        pending={patch.isPending}
        onAccept={() => patch.mutate({ repoId, id: c.id, patch: { status: "accepted" } })}
        onReject={() => patch.mutate({ repoId, id: c.id, patch: { status: "rejected" } })}
        onEdit={(p) => edit(c.id, p)}
      />
    );
  }

  return (
    <AppShell crumb={crumb}>
      {creating && (
        <CreateSkillModal
          repoId={repoId}
          acceptedCount={accepted.length}
          agents={agents ?? []}
          onClose={() => setCreating(false)}
          onCreated={setCreated}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              {repo?.full_name ?? t("page.repoFallback")}
            </h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.actions}>
            <ScanButtons
              hasScanned={hasScanned}
              busy={scanning || extract.isPending}
              onScan={() => extract.mutate(repoId)}
            />
          </div>
        </div>

        {scanning && (
          <div style={s.statusRow}>
            <span style={s.scanning}>
              <Icon.RefreshCw size={13} style={s.spin} />
              {t("page.scanning")}
            </span>
          </div>
        )}

        {scan?.status === "failed" && (
          <div style={s.scanError}>
            {t("page.extractionFailed")}
            {scan.error ? ` — ${scan.error}` : ""}
          </div>
        )}

        {created && (
          <div style={s.statusRow}>
            {t("page.skillCreated", { name: created.name, version: created.version })}
          </div>
        )}

        {isLoading ? (
          <div style={s.grid}>
            <Skeleton height={160} />
            <Skeleton height={160} />
            <Skeleton height={160} />
          </div>
        ) : isError ? (
          <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon="FileText"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => extract.mutate(repoId)}
          />
        ) : (
          <>
            <div style={s.statusRow}>
              <span>{t("page.candidateCount", { count: candidates.length })}</span>
              <span style={s.counts}>
                <span>{t("page.acceptedCount", { count: accepted.length })}</span>
                <span>{t("page.rejectedCount", { count: rejected })}</span>
              </span>
              <span style={{ flex: 1 }} />
              {/* Only meaningful once something has been accepted. */}
              {accepted.length > 0 && (
                <Button kind="primary" size="sm" icon="Sparkles" onClick={() => setCreating(true)}>
                  {t("page.createSkill")}
                </Button>
              )}
            </div>

            {pending.length > 0 && (
              <>
                <div style={s.sectionTitle}>{t("page.pendingSection")}</div>
                <div style={s.grid}>{pending.map(renderCard)}</div>
              </>
            )}

            {accepted.length > 0 && (
              <>
                <div style={s.sectionTitle}>{t("page.acceptedSection")}</div>
                <div style={s.grid}>{accepted.map(renderCard)}</div>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

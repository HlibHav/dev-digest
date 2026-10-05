"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import type { BlastRadius } from "@devdigest/shared";
import { BlastGraph } from "./_components/BlastGraph";
import { BlastTree } from "./_components/BlastTree";
import { IndexNotice } from "./_components/IndexNotice";
import { blastStats } from "./helpers";
import { s } from "./styles";

type BlastView = "tree" | "graph";

interface BlastRadiusCardLink {
  repoFullName: string;
  sha: string;
}

interface BlastRadiusCardResync {
  onResync: () => void;
  pending: boolean;
  queued: boolean;
}

interface BlastRadiusCardProps {
  blast: BlastRadius | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  link: BlastRadiusCardLink | null;
  resync?: BlastRadiusCardResync;
}

/** "Blast radius" card (AC1): the changed symbols, their callers and the
    endpoints/crons those callers sit behind, read from the repo-intel index.
    Presentational only — OverviewTab wires `useBlastRadius`. */
export function BlastRadiusCard({ blast, isLoading, isError, onRetry, link, resync }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const [view, setView] = React.useState<BlastView>("tree");

  if (isLoading) {
    return (
      <section>
        <SectionLabel icon="Zap">{t("title")}</SectionLabel>
        <div style={s.card}>
          <span style={s.hint}>{t("loading")}</span>
          <Skeleton height={80} />
        </div>
      </section>
    );
  }

  if (isError || !blast) {
    return (
      <section>
        <SectionLabel icon="Zap">{t("title")}</SectionLabel>
        <ErrorState title={t("errorTitle")} onRetry={onRetry} />
      </section>
    );
  }

  const stats = blastStats(blast);
  const hasDownstream = blast.downstream.length > 0;

  return (
    <section>
      <SectionLabel icon="Zap">{t("title")}</SectionLabel>
      <div style={s.card}>
        <div style={s.headerRow}>
          <div style={s.statRow}>
            <span>{stats.symbols}</span>
            <span>{t("stat.symbols")}</span>
            <span style={s.statSep}>·</span>
            <span>{stats.callers}</span>
            <span>{t("stat.callers")}</span>
            <span style={s.statSep}>·</span>
            <span>{stats.endpoints}</span>
            <span>{t("stat.endpoints")}</span>
            <span style={s.statSep}>·</span>
            <span>{stats.crons}</span>
            <span>{t("stat.crons")}</span>
          </div>
          {hasDownstream && (
            <div style={s.toggleRow}>
              <Chip active={view === "tree"} onClick={() => setView("tree")}>
                {t("view.tree")}
              </Chip>
              <Chip active={view === "graph"} onClick={() => setView("graph")}>
                {t("view.graph")}
              </Chip>
            </div>
          )}
        </div>

        {blast.degraded && blast.reason && <IndexNotice reason={blast.reason} resync={resync} />}

        {hasDownstream ? (
          view === "tree" ? (
            <BlastTree downstream={blast.downstream} changed_symbols={blast.changed_symbols} link={link} />
          ) : (
            <BlastGraph blast={blast} />
          )
        ) : (
          <span style={s.hint}>{t("noDownstream", { count: stats.symbols })}</span>
        )}
      </div>
    </section>
  );
}

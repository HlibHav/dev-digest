"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, MonoLink } from "@devdigest/ui";
import type { ChangedSymbol, DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "../../styles";

interface BlastTreeLink {
  repoFullName: string;
  sha: string;
}

interface BlastTreeProps {
  downstream: DownstreamImpact[];
  changed_symbols: ChangedSymbol[];
  link: BlastTreeLink | null;
}

/** Per-symbol collapsible tree: callers as `file:line` (linked to GitHub when
    `link` is set), followed by that symbol's endpoint and cron chips. Every
    header starts expanded (AC21). After the groups that have callers, every
    remaining `changed_symbols` entry (server order, deduped by name) renders
    as a muted, non-expandable "no callers" row (rev 5.3). */
export function BlastTree({ downstream, changed_symbols, link }: BlastTreeProps) {
  const t = useTranslations("blast");
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(new Set());

  const toggle = (symbol: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  const groupedNames = new Set(downstream.map((group) => group.symbol));
  const seenCallerless = new Set<string>();
  const callerless = changed_symbols.filter((symbol) => {
    if (groupedNames.has(symbol.name) || seenCallerless.has(symbol.name)) return false;
    seenCallerless.add(symbol.name);
    return true;
  });

  return (
    <div style={s.tree}>
      {downstream.map((group) => {
        const expanded = !collapsed.has(group.symbol);
        return (
          <div key={group.symbol} style={s.symbolGroup}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => toggle(group.symbol)}
              style={s.symbolHeader}
            >
              <span style={s.symbolName}>{group.symbol}()</span>
              <span style={s.symbolCount}>{t("callerCount", { count: group.callers.length })}</span>
            </button>
            {expanded && (
              <div style={s.symbolBody}>
                <ul style={s.callerList}>
                  {group.callers.map((caller) => {
                    const label = `${caller.file}:${caller.line}`;
                    const href = link
                      ? githubBlobUrl(link.repoFullName, link.sha, caller.file, caller.line)
                      : null;
                    return (
                      <li key={label} style={s.callerRow}>
                        <span style={s.callerArrow}>↳</span>
                        {href ? (
                          <MonoLink href={href}>{label}</MonoLink>
                        ) : (
                          <span className="mono" style={s.callerPlain}>
                            {label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {group.endpoints_affected.length > 0 && (
                  <div style={s.chipRow}>
                    <span style={s.chipRowLabel}>{t("stat.endpoints")}</span>
                    {group.endpoints_affected.map((endpoint) => (
                      <Chip key={endpoint} icon="Globe" color="var(--accent)">
                        {endpoint}
                      </Chip>
                    ))}
                  </div>
                )}
                {group.crons_affected.length > 0 && (
                  <div style={s.chipRow}>
                    <span style={s.chipRowLabel}>{t("stat.crons")}</span>
                    {group.crons_affected.map((cron) => (
                      <Chip key={cron} icon="Clock" color="var(--warn)">
                        {cron}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {callerless.map((symbol) => (
        <div key={symbol.name} style={s.symbolGroup}>
          <div style={s.symbolHeaderMuted}>
            <span style={s.symbolName}>{symbol.name}()</span>
            <span style={s.symbolCount}>{t("noCallers")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

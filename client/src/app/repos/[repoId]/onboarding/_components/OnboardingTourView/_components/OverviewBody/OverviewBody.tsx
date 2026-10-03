"use client";

import React from "react";
import { Markdown } from "@devdigest/ui";
import type { OnboardingItem } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { diagramAllowed } from "../../helpers";
import { s } from "./styles";

export function OverviewBody({
  body,
  diagram,
  items = [],
}: {
  body: string;
  diagram?: string | null;
  items?: OnboardingItem[];
}) {
  const stack = items.filter((it) => it.title && !it.path);
  const folders = items.filter((it) => it.path);
  return (
    <div style={s.root}>
      <Markdown>{body}</Markdown>
      {diagram && diagramAllowed(diagram) && <MermaidDiagram chart={diagram} />}
      {stack.length > 0 && (
        <div style={s.chips}>
          {stack.map((it, i) => (
            <span key={`${it.title}-${i}`} style={s.chip}>
              {it.title}
            </span>
          ))}
        </div>
      )}
      {folders.length > 0 && (
        <div style={s.rows}>
          {folders.map((it, i) => (
            <div key={`${it.path}-${i}`} style={s.row}>
              <span className="mono" style={s.path} title={it.path ?? undefined}>
                {it.path}
              </span>
              {it.reason && <span style={s.count}>{it.reason}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

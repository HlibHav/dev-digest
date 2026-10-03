"use client";

import React from "react";
import { Markdown } from "@devdigest/ui";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { diagramAllowed } from "../../helpers";

export function OverviewBody({ body, diagram }: { body: string; diagram?: string | null }) {
  return (
    <div style={{ fontSize: 14.5, color: "var(--text-secondary)" }}>
      <Markdown>{body}</Markdown>
      {diagram && diagramAllowed(diagram) && <MermaidDiagram chart={diagram} />}
    </div>
  );
}

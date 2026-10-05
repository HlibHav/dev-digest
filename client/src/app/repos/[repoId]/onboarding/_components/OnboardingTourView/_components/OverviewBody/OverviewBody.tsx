"use client";

import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { OnboardingItem } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { diagramAllowed } from "../../helpers";
import { s } from "./styles";

// The overview is model output built from repo content (a README can steer it), so it is
// untrusted. Walk the markdown AST instead of regex-stripping the string: images become their
// alt text (no <img>, no request) and every link, inline, reference-style or GFM autolink,
// becomes plain text (no <a href>).
const mdComponents: Components = {
  p: ({ children }) => <p style={s.p}>{children}</p>,
  strong: ({ children }) => <strong style={s.strong}>{children}</strong>,
  code: ({ children }) => (
    <code className="mono" style={s.code}>
      {children}
    </code>
  ),
  a: ({ children }) => <span>{children}</span>,
  img: ({ alt }) => <span>{alt}</span>,
};

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
      {body && (
        <div className="dd-md" style={s.md}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {body}
          </ReactMarkdown>
        </div>
      )}
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

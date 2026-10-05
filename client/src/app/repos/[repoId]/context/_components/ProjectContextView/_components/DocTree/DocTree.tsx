/* Read-only folder tree of repo docs. Folders are labels, files are selectable. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { DocTreeNode } from "../../helpers";
import { s } from "./styles";

interface Props {
  nodes: DocTreeNode[];
  selected: string | null;
  onSelect: (path: string) => void;
  depth?: number;
}

export function DocTree({ nodes, selected, onSelect, depth = 0 }: Props) {
  return (
    <div role="tree">
      {nodes.map((n) =>
        n.kind === "folder" ? (
          <div key={`d:${n.name}`}>
            <div data-testid="doc-folder" style={{ ...s.folder, ...s.indent(depth) }}>
              <Icon.Folder size={14} />
              <span>{n.name}</span>
            </div>
            <DocTree nodes={n.children} selected={selected} onSelect={onSelect} depth={depth + 1} />
          </div>
        ) : (
          <div key={`f:${n.file.path}`} style={s.indent(depth)}>
            <button
              type="button"
              data-testid="doc-file"
              style={s.file(selected === n.file.path)}
              onClick={() => onSelect(n.file.path)}
            >
              <Icon.FileText size={14} />
              <span>{n.name}</span>
            </button>
          </div>
        ),
      )}
    </div>
  );
}

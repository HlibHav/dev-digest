/* ContextDocList — the repo's docs as one sortable, checkable list. Used by the
   agent and skill Context tabs. The caller owns the attached set; this renders
   rows and reports intent (toggle, reorder, preview). Order IS the payload, so
   only checked, own rows are sortable. */
"use client";

import React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Button, Checkbox, Icon } from "@devdigest/ui";
import { filterDocs, type ContextRow } from "./helpers";
import { s } from "./styles";

/** Caller-supplied copy, so the list stays namespace-free and shared. */
export interface ContextDocListLabels {
  preview: string;
  notInRepo: string;
  inheritedFrom: (skill: string) => string;
  dragHandle: (path: string) => string;
  /** Accessible name of a row's checkbox. */
  select: (path: string) => string;
  /** Per-doc token count, e.g. "≈ 1,226 tokens". */
  tokens: (count: number) => string;
  empty: string;
}

function DocRow({
  row,
  labels,
  onToggle,
  onPreview,
}: {
  row: ContextRow;
  labels: ContextDocListLabels;
  onToggle: (path: string) => void;
  onPreview: (path: string) => void;
}) {
  const inherited = row.inheritedFrom != null;
  const sortable = useSortable({ id: row.path, disabled: !row.checked || inherited });
  return (
    <div
      ref={sortable.setNodeRef}
      style={s.row(row.checked, sortable.isDragging, {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      })}
    >
      {row.checked && !inherited ? (
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={labels.dragHandle(row.path)}
          style={s.handle}
        >
          <Icon.Menu size={14} />
        </button>
      ) : (
        <span aria-hidden style={s.handleInactive}>
          <Icon.Menu size={14} />
        </span>
      )}

      {inherited ? (
        <input
          type="checkbox"
          checked
          disabled
          readOnly
          aria-label={labels.select(row.path)}
          style={s.inheritedCheckbox}
        />
      ) : (
        <Checkbox
          checked={row.checked}
          onChange={() => onToggle(row.path)}
          label={<span style={s.srOnly}>{labels.select(row.path)}</span>}
        />
      )}

      <span className="mono" style={s.path} title={row.path}>
        {row.path}
      </span>
      {inherited && <span style={s.note}>{labels.inheritedFrom(row.inheritedFrom!)}</span>}
      {!row.present && <span style={s.note}>{labels.notInRepo}</span>}

      <span style={s.spacer} />
      <span className="mono" style={s.tokens}>
        {labels.tokens(row.tokens)}
      </span>
      {row.category && <Badge color="var(--text-secondary)">{row.category}</Badge>}
      {row.present && (
        <Button kind="ghost" size="sm" icon="Eye" onClick={() => onPreview(row.path)}>
          {labels.preview}
        </Button>
      )}
    </div>
  );
}

export function ContextDocList({
  rows,
  filter,
  labels,
  onToggle,
  onReorder,
  onPreview,
}: {
  rows: ContextRow[];
  filter: string;
  labels: ContextDocListLabels;
  onToggle: (path: string) => void;
  /** Dragged path dropped over another path; the caller maps both to indexes. */
  onReorder: (activePath: string, overPath: string) => void;
  onPreview: (path: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const visible = filterDocs(rows, filter);
  const sortableIds = visible.filter((r) => r.checked && r.inheritedFrom == null).map((r) => r.path);

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  }

  if (visible.length === 0) return <p style={s.note}>{labels.empty}</p>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div style={s.list}>
          {visible.map((row) => (
            <DocRow key={row.path} row={row} labels={labels} onToggle={onToggle} onPreview={onPreview} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

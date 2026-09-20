/* SkillsTab — attach skills to this agent and set the order they appear in the
   assembled prompt. The order IS the payload: `skill_ids` is sent as a whole
   ordered set, so attach, detach and reorder are all the same call. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { SkillRow } from "./_components/SkillRow";
import { availableSkills, moveSkill, orderedAttached, toggleAttached } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const skillsQuery = useSkills();
  const linksQuery = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();
  const [search, setSearch] = React.useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const skills = skillsQuery.data ?? [];
  // Server order is the truth; while a write is in flight the mutation's own
  // variables stand in, so a drag doesn't visibly snap back and forth.
  const attached = React.useMemo(() => {
    const pending = setSkills.isPending ? setSkills.variables?.skillIds : undefined;
    return pending ?? (linksQuery.data ?? []).map((l) => l.skill_id);
  }, [linksQuery.data, setSkills.isPending, setSkills.variables]);

  const commit = (skillIds: string[]) => setSkills.mutate({ agentId: agent.id, skillIds });

  const attachedSkills = orderedAttached(skills, attached);
  const available = availableSkills(skills, attached, search);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = attached.indexOf(String(active.id));
    const to = attached.indexOf(String(over.id));
    commit(moveSkill(attached, from, to));
  }

  if (skillsQuery.isLoading || linksQuery.isLoading) {
    return (
      <div style={s.panel}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (skillsQuery.isError) {
    return <ErrorState body={t("skills.loadError")} onRetry={() => skillsQuery.refetch()} />;
  }

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>
          {t("skills.enabledCount", { linked: attached.length, total: skills.length })}
        </span>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>

      <p style={s.hint}>{t("skills.orderHint")}</p>

      {attachedSkills.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={attached} strategy={verticalListSortingStrategy}>
            <div style={s.list}>
              {attachedSkills.map((skill, i) => (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  attached
                  position={i + 1}
                  onToggle={() => commit(toggleAttached(attached, skill.id))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {attachedSkills.length === 0 && <p style={s.empty}>{t("skills.noneAttached")}</p>}

      <div style={s.availableLabel}>{t("skills.available")}</div>
      <div style={s.list}>
        {available.map((skill) => (
          <SkillRow
            key={skill.id}
            skill={skill}
            attached={false}
            onToggle={() => commit(toggleAttached(attached, skill.id))}
          />
        ))}
        {available.length === 0 && <p style={s.empty}>{t("skills.allAttached")}</p>}
      </div>
    </div>
  );
}

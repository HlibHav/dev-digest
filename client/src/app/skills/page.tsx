import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (the skill library). Thin route entry — the view, its editor,
   import drawer, styles, constants and helpers live under _components. */
export default function SkillsPage() {
  return <SkillsListView />;
}

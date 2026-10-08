import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 8 Claude sessions total.
 *   - 3 × trace     → 1 session each                      = 3
 *   - 1 × activation pair (positive + near-miss negative) = 2
 *   - 1 × activation neutral negative                     = 1
 *   - 1 × contrast (treatment + control)                  = 2
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 */
export const cases: WorkflowCase[] = [
  // The three trace cases follow THIS repo's CLAUDE.md. The course template's versions expected
  // server/docs/api-contracts.md, reviewer-core/docs/pipeline.md and reviewer-core/insights/
  // gotchas.md, none of which exist here, so they failed while the model did what CLAUDE.md says.

  // --- trace (1 session): subagent dispatch ------------------------------------------------------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is absent from the reviews routes.
    name: "API-route plan pulls the architecture-reviewer subagent",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). ОБОВʼЯЗКОВО запусти сабагента architecture-reviewer, щоб він оцінив мій план на " +
      "відповідність onion-шарам — не рецензуй сам.",
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- trace (1 session): CLAUDE.md "Before answering" → the package's INSIGHTS.md ---------------
  {
    kind: "trace",
    name: "a reviewer-core task starts from reviewer-core/INSIGHTS.md",
    prompt:
      "Я збираюся змінити, як reviewer-core збирає промпт. Перш ніж торкатися коду — звірся з " +
      "настановами цього репо (CLAUDE.md), що треба прочитати першим для задачі в пакеті, і прочитай це.",
    expectFilesRead: ["reviewer-core/INSIGHTS.md"],
    maxTurns: 6,
  },

  // --- trace (1 session): CLAUDE.md "Use when" → docs/skills-control-experiment.md ---------------
  {
    kind: "trace",
    name: "CLAUDE.md routes 'does a skill change a review' to the control experiment",
    prompt:
      "Чи реально скіл змінює результат ревʼю, чи модель і так би це знайшла? Знайди за настановами " +
      "цього репо, де це вже досліджено, і прочитай той документ.",
    expectFilesRead: ["docs/skills-control-experiment.md"],
    maxTurns: 6,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },

  // --- activation (1 session): neutral negative ------------------------------------------------
  // A general question with no repo task in it: no project skill should engage. dependency-checker
  // is the one with the broadest triggers ("залежності", "пакети"), so it is the one to watch.
  {
    kind: "activation",
    name: "neutral negative — a general npm question does not run the dependency audit",
    prompt: "Коротко: чим у npm відрізняються dependencies від devDependencies?",
    skill: "dependency-checker",
    shouldActivate: false,
    maxTurns: 3,
  },

  // --- contrast (2 sessions): with CLAUDE.md vs without -------------------------------------------
  // The prompt names no path. Only CLAUDE.md's "Use when" row (model choice → docs/agent-prompts/)
  // leads to the file, so the control (empty tmpdir, no on-disk config) has nothing to follow.
  {
    kind: "contrast",
    name: "CLAUDE.md routes a model-choice question to docs/agent-prompts",
    prompt:
      "Яку модель цей проєкт радить брати для агента-ревʼюера? Знайди, де в документації це " +
      "описано, і прочитай саме той файл.",
    expectFileRead: "docs/agent-prompts/choosing-a-model.md",
    maxTurns: 6,
  },
];

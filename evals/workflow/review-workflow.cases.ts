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
  // --- trace (1 session): CLAUDE.md "Read When" routing + subagent dispatch, together -----------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    name: "API-route task reads api-contracts AND pulls the architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). Спершу звірся з конвенціями API цього репо. Потім ОБОВʼЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він оцінив мій план на відповідність onion-шарам — не рецензуй сам.",
    expectFilesRead: ["server/docs/api-contracts.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- trace (1 session): two "Read When" rows at once -----------------------------------------
  {
    kind: "trace",
    // Tests the CLAUDE.md "Read When" routing, so the prompt must push toward CONSULTING the docs,
    // not exploring source. Earlier phrasing ("розберись, як усе влаштовано") sent the model straight
    // into schema.ts / pipeline.run.ts and it never opened the routed doc. One anchor doc (pipeline.md)
    // keeps this a deterministic routing check — asserting two docs in one session is inherently flaky.
    name: "pipeline task follows CLAUDE.md routing to pipeline.md",
    prompt:
      "Я збираюся змінити review pipeline. Перш ніж торкатися коду — звірся з настановами цього репо " +
      "(CLAUDE.md) щодо того, яку документацію треба прочитати для змін у pipeline, і прочитай саме ці документи.",
    expectFilesRead: ["reviewer-core/docs/pipeline.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): CLAUDE.md "Hit unexpected behavior" routing -> gotchas ----------------
  // Was a contrast case, but the control run (empty tmpdir) could still reach the real repo by
  // absolute path and read gotchas.md, making the negative flaky. As a single-session trace it
  // reliably checks the same routing rule: in the real repo, the discovery prompt reads gotchas.md.
  {
    kind: "trace",
    name: "CLAUDE.md routes a gotchas lookup to reviewer-core/insights",
    prompt:
      "У reviewer-core я стикнувся з несподіваною поведінкою — щось працює не так, як я очікував. " +
      "За настановами цього репо, де це вже могло бути задокументовано? Прочитай той файл.",
    expectFilesRead: ["reviewer-core/insights/gotchas.md"],
    maxTurns: 5,
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

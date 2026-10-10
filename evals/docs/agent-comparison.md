# architecture-reviewer: two versions compared in series

Four comparisons of `architecture-reviewer` versions, each backed by repeated runs of the same
four cases (`evals/agents/architecture-reviewer/`), so a change is judged against its spread and
not against one lucky run. The raw series for the first comparison are in `agent-comparison/`
(`eval:repeat` output; `pnpm eval:delta` reads them once copied to `results/repeat-<label>.json`).

## 1. Prompt rules for line citation — rejected (2026-10-09)

**Question.** In CI the agent cited `run.ts:16`, `:9` or `:139` for an import on line 18, and
filed the fastify violation twice. Do prompt rules fix that?

**Versions.** A: the agent at `6225979`. B: A plus a hunk-counting rule and a "one violation, one
finding" rule. C: A plus the counting rule alone. Task model `google/gemini-2.5-flash` (the CI
model then), n=4 per version; then B and C on `claude-haiku-4-5`, n=2.

| Case (gemini, n=4) | A base | B two rules | C counting only |
|---|---|---|---|
| checkout: both violations, cited | 3/4 | 4/4 | 4/4 |
| no duplicate finding for `reply` | 2/4 | 0/4 | 1/4 |
| reviewer-core fs read (cites `:18`) | 0/4 | 2/4 | 1/4 |
| benign rename, no findings | 2/4 | 3/4 | 4/4 |
| **passing runs** | **7/16** | **9/16** | **10/16** |
| turns, fs case (mean ± sd) | 2.3 ± 1.9 | 1.3 ± 0.5 | 2.0 ± 2.0 |

On haiku the counting rule cost the duplicate practice: B 7/8 runs, C 5/8, with "no duplicate
finding" at 1/2 and 0/2 (the haiku baseline was 8/8, `server/INSIGHTS.md`, 2026-10-09).

**Reading.** 7 → 9 → 10 of 16 sits inside the per-case spread: every case moves by one or two
runs in both directions, and the duplicate case gets worse with the rule meant to fix it. Both
rules were reverted.

## 2. Numbered hunk lines — shipped (2026-10-09, `13eb0c3`)

**Versions.** A: raw diff, the agent counts lines from the hunk header. B: the bundle numbers
every hunk line by its new-side line, plus one rule, "a number column is the new-side line, cite
it as is". n=4 per series, clean clone.

| Case | gemini, raw | gemini, numbered | haiku-4-5, numbered |
|---|---|---|---|
| fs read (cites `:18`) | 0/4 | 4/4 | 4/4 |
| checkout | 1/4 | 3/4 | 4/4 |
| no duplicate finding | 1/4 | 2/4 | 4/4 |
| benign rename | 4/4 | 2/4 | 4/4 |
| **passing runs** | **6/16** | **11/16** | **16/16** |

**Reading.** The fs case went 0/4 → 4/4 on both models, a jump well outside the spread of
comparison 1. The benign-rename drop is gemini stalling after one turn or truncating its final
message, 4/16 runs in both gemini series, not the change. Shipped in `review-bundle.sh`; record:
`2026-10-09-numbered-review-hunks.md` (decision records live outside the repo).

## 3. CI task model — haiku-5.5 over gemini (2026-10-09, `d3d2801`)

Same agent (`13eb0c3`), same judge, n=4 on the agent tier and n=2 on the workflow tier:

| Task model | Agent runs | Workflow records | Cost | Wall time |
|---|---|---|---|---|
| `google/gemini-2.5-flash` | 10/16 | 15/22 | $0.37 | 33 min |
| `anthropic/claude-haiku-5.5` | 15/16 | 23/23 | $0.19 | 19 min |

haiku-5.5's one miss was a `path:line` quote in the checkout case (3/4). Record:
`2026-10-09-eval-tool-tiers-on-haiku-5-5.md` (outside the repo).

## 4. Evidence quotes code, not the rule's doc — shipped (2026-10-10)

**Question.** On haiku-5.5 the checkout case passed "every finding quotes the offending line"
1/3 in the baseline. The misses were an extra placement finding (`modules/checkout/domain/` is
not in the ring table) whose evidence column paraphrased `reference.md` instead of quoting code,
which the agent's own "No proof, no finding" rule already forbids.

**Versions.** A: the agent at `fedc040`. B: A plus two sentences under "No proof, no finding":
the evidence column quotes the code or output, never the rule's doc, and a placement finding
quotes the misplaced file's first added line. `claude-haiku-5.5` task and judge, n=4 each, clean
clone, same cases (raw series: `agent-comparison/ar-evidence-{a,b}.json`).

| | A | B |
|---|---|---|
| checkout: every finding quotes the offending line | 1/4 | 4/4 |
| checkout case | 3/4 | 4/4 |
| checkout: severity practice | 3/4 | 2/4 |
| other three cases | 12/12 | 12/12 |

**Reading.** The target practice moved 1/4 → 4/4. The severity dip is the practice's wording,
not the change: every miss on both sides is an extra `minor` finding (placement, or a second
finding for the repository), which the agent's severity table makes `minor`, read by the judge
as "every finding must be major". B is the agent baseline now.

## Reproduce

```bash
cd evals
EVAL_REPEAT_MAX=4 pnpm eval:repeat agents/architecture-reviewer/ -n 4 --label base4      # before
# …change the agent…
EVAL_REPEAT_MAX=4 pnpm eval:repeat agents/architecture-reviewer/ -n 4 --label candidate4  # after
pnpm eval:delta base4 candidate4
```

Run it from a `git clone` outside `.claude/` (see `README.md`, CI baselines), on the CI models.

# SDD cascade: how much spec a change needs

Every change states what must be true before code is written, but not every change needs the
same amount of writing. This page sets the four tiers the `spec-creator` agent picks from, the
scorecard that picks one, and the rules for keeping a spec alive after it is written.

The tiers follow Kief Morris's "humans on the loop" idea
([martinfowler.com](https://martinfowler.com/articles/exploring-gen-ai/humans-and-agents.html)):
people improve the harness (specs, checks, workflow) rather than inspect every artifact, so the
harness has to scale with the risk of the change.

## The four tiers

| Tier | When | Cascade |
|---|---|---|
| **Direct / Plan-First** | A one-off spike or an obvious small change | Intent → [Plan] → Code → Verify |
| **Lightweight SDD** | Requirements are clear, but the change touches several components | Requirement → Short Spec → Acceptance Criteria → Plan → Code → Verify |
| **Full SDD** | Product ambiguity, several people or agents, an expensive rollback, or verification that is hard | Problem → Outcome → Metrics → Requirements → Spec → Contracts → Architecture → Plan → Tests → Code → Evidence |
| **Discovery-First** | It is not yet clear *what* to build | Problem → Outcome → Metrics → Options → Requirements → then Lightweight or Full SDD |

Discovery-First is the only tier that ends in a choice, not a plan. Its spec carries
`Status: discovery`, and once an option is picked the same file is re-tiered to Lightweight or
Full and grows the remaining sections. It is never copied into a new file.

Architecture in the Full cascade is not written in the spec. The spec states behaviour and
contracts. The architecture goes to the `implementation-planner` and, when it outlives the task, to an ADR.

## Scorecard

Answer each question yes or no:

1. Will this behaviour live longer than one sprint?
2. Can the requirements be read in more than one way?
3. Will several people or agents work on the change?
4. Is a mistake expensive to roll back?
5. Does correctness need more than one obvious test?
6. Will someone need to explain later where a specific decision came from?

| Yes answers | Tier |
|---|---|
| 0–1 | Direct / Plan-First |
| 2–3 | Lightweight SDD |
| 4–6 | Full SDD |

Discovery-First overrides the count: when the outcome itself is unknown, no count of yes
answers makes a spec meaningful. When two tiers look equally right, take the heavier one.

This is a heuristic, not an industry standard. The person asking can override the tier, and the
spec records who overrode it.

## Where specs live

| Spec touches | Folder |
|---|---|
| One package | `<pkg>/specs/<feature>.md` (`server`, `client`, `reviewer-core`, `mcp-server`) |
| Two or more packages | `specs/<feature>.md` at the repo root |

`e2e/specs/` holds flow JSON, not prose specs. Design inputs for a spec (screenshots, exported
frames) go next to it under `designs/<feature>/`.

## Versioning: three anchors

1. The spec lives in the repo, next to the code it governs, not in a document nobody updates.
2. One spec is one feature. When the feature evolves, the same file is updated. There is no
   `spec-v2`; the old state stays in git history.
3. The commit with the spec comes before the commit with the code, so `git log` shows the spec
   led.

Each spec ends with a `## Changelog` (date, what changed, why), so its history is readable
without `git blame`.

## When to change a spec, and when not to

| Situation | What changes |
|---|---|
| A bug where the code drifted from a correct spec | The code. The spec stays. |
| A bug where the spec described the wrong or incomplete behaviour | The spec first, then the code. One bug, one lesson in the spec (SpecOps). |
| The requirement changed, or there is new behaviour | The spec. That is what it is for. |
| The implementer hit a blocker and wants to deviate | The spec is updated and the plan re-reviewed before the code moves. A silent deviation lets code and spec drift apart. |
| A refactor with no change in behaviour | Nothing in the spec. It describes behaviour and limits, not implementation. |

The general rule: the spec describes *what* and the behaviour. When the *what* changes, update
it. When only the *how* changes, leave it.

Source for the change rules: SpecOps,
[InfoQ — Enterprise spec-driven development](https://www.infoq.com/articles/enterprise-spec-driven-development/).

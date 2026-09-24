# The `## Skills / rules` block

`assemblePrompt` has always rendered this section; until lab 2 nothing filled
it. This page is what it renders now and why it renders it that way.

## Shape

`PromptParts.skills` is `readonly PromptSkill[]`, where

```ts
interface PromptSkill { name: string; body: string; untrusted?: boolean }
```

`renderSkillsBlock` turns that into the block, or `null` when the list is empty —
in which case the section is omitted entirely and the prompt is byte-identical
to one assembled before skills existed.

| Skill | Rendered as |
|---|---|
| trusted | `### <name>` then the body |
| `untrusted` | `wrapUntrusted('skill-<i>', '# <name>\n\n' + body)` |

Order is the caller's; the server passes `agent_skills.order`.

## Why the type carries the flag

The alternative was `string[]` with the server pre-wrapping. This file says of
itself that it is "the ONE shared, trusted defense", and every other untrusted
slot — diff, PR description, repo map, callers, specs — is wrapped here rather
than by a caller. A `string[]` carries no signal about whether wrapping already
happened, so the next caller (the CI runner the docs keep promising) would have
nothing to remind it. Full rationale:
`../../decisions/2026-09-20-skill-trust-model.md`, outside the repo.

## Why the label is fixed

`wrapUntrusted(label, content)` neutralises `</untrusted>` in the **content** but
interpolates `label` raw into `source="${label}"`. Every other caller passes a
literal. A skill name is the first caller-controlled value that could reach it,
and for an imported skill that name comes out of an uploaded file. So the label
is a constant `skill-<i>` and the name is rendered inside the block, where it is
data like the rest.

`safeSkillName` also flattens whitespace, for trusted names too: a name
containing `\n## Diff to review` would otherwise forge a section header in the
user message.

## Tests

`test/prompt-skills.test.ts` pins all of it: the trusted/untrusted split, order,
omit-when-empty, `assembly.skills` matching the renderer, a quote in a name not
breaking the `source="…"` attribute, a newline in a name not forging a header,
and a `</untrusted>` inside an imported body being neutralised.

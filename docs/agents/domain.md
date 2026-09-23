# Domain docs

This repo uses a single-context layout:

- `CONTEXT.md`: domain vocabulary at the repo root.
- `docs/adr/`: architecture decision records.

## Before exploring

Read `CONTEXT.md` and any ADRs relevant to the work.

If either is absent, proceed silently. Do not suggest creating them
upfront. `/domain-modeling`, also used by `/grill-with-docs` and
`/improve-codebase-architecture`, creates them when terms or decisions
are resolved.

## Use the glossary's vocabulary

Use terms defined in `CONTEXT.md` in issue titles, proposals, hypotheses,
and test names. Avoid synonyms the glossary excludes.

For user-facing text, also follow the Danish terminology in `AGENTS.md`.

If a needed concept is missing, reconsider the term or note the gap
for `/domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an ADR, name the ADR and explain why the
decision should be reconsidered. Do not silently override it.

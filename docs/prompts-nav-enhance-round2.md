# Requirement Notes: HSPICE Navigation Enhancement (Round 2, 0.3.1+)

> This file captures the user's verbatim requirements and clarifications raised
> during this session, so a follow-up agent / new session / lower-cost model can
> pick up the work. Absolute date: requirements raised on 2026-07-11.

## Trigger

After installing 0.3.0, the user tested it against a large real-world HSPICE
process-library file (extension `.l`, hundreds of thousands of lines) and found
the new F12 / hover / outline features "not working well".

## Original requirements (summary)

1. **Definition location of expression variables** — F12 should jump from a
   variable name inside an expression (e.g. `dL` in a model-card expression
   `'L0-(dL+dmis)'`, or a `.param` variable) to its `.param` definition.
2. **Nested-reference semantics** — SPICE references files through `.include` /
   `.lib`, but there can be **multiple entry points**, each with a different
   chain and different parameter-value selection.
3. **Compare with hspice-intellisense** — confirm what the competing extension
   can handle and whether this extension has absorbed it.

## User clarifications (AskUserQuestion answers, 2026-07-11)

### Scope adopted this round (all selected)
- **P0**: Fix the `.lib` dual-syntax bug (definition vs file reference).
- **P1**: `.param` variable navigation (definition / reference / hover / references).
- **P1**: `.lib section` navigation (section-definition indexing + F12 from references).
- **P2**: Section scope / multi-entry selection.

### User's notes on "multi-entry selection" (key design input)

> Should the jump tool itself support GUI selection / switching when multiple
> upstream definitions exist for a variable (after F12)?
>
> Sometimes a top-level SPICE file has already configured the section via
> `.lib`, so when you navigate from it the section is already determined — if
> the syntax is correct there is no conflict.
>
> Other times a person is analyzing a generic library file, where there may be
> many upstream reference cases; when multiple upstream definitions are found,
> can the user temporarily pin one in the GUI?

Decomposed into two scenario rules:

- **Scenario A (chain determined)** — the current file is included by a
  top-level SPICE file via `.lib 'file' section` with a known section name →
  use that section's definition directly, no ambiguity.
- **Scenario B (manual analysis of a generic file)** — the user opens a generic
  PDK directly; there are many possible upstream cases and the chain cannot be
  uniquely determined → when multiple definitions exist, the user pins one in
  the GUI.

Section-scope depth: **simple version** — on multiple definitions let the user
choose in the GUI (matching scenario B). No full "evaluate the effective value
along the entry chain".

### Documentation requirements
- All user prompts must be persisted to a document (this file).
- The plan must be persisted and kept up to date (location: the agent's local
  plan directory — not part of this repo).

## Verified evidence

See the "Diagnosis" section of the plan file. Key facts (exact counts redacted
to avoid identifying the vendor/process; see the local, non-published
`docs/internal/PDK-VALIDATION-NOTES.md` for specifics):
- The PDK contains many hundreds of `.subckt`, over a thousand `.model`, several
  thousand `.param`, and a few hundred `.endl` sections.
- 0.3.0 parsing a prefix of the file yielded **zero** `.model`/`.subckt` and
  only a large number of **misread** `.lib` lines (treated as includes).
- 0.3.0 parsing the whole file misread every `.LIB section` definition as an
  include.
- Whole-file parse (hundreds of thousands of lines) takes well under a second.
- The two `.lib` syntaxes coexist in this file:
  - Definition form: `.LIB <section>` … `.ENDL <section>` (all misreads are this).
  - Reference form: `.lib '<file>.l' <section>` (first token is a quoted file path).
- The competing hspice-intellisense FileModel has only 5 categories
  (subcktDefs / modelDefs / xInstances / deviceInstances / includes) and does
  **not** support `.param` variables, expression variables, or section scoping.

# NNN — <short imperative title>

Status: TODO

<!--
  Status is one of: TODO | IN PROGRESS | DONE | BLOCKED (reason)
  It MUST stay on the line above, as the first content after the H1, so a
  session can find the next actionable task by scanning status lines alone.
  Update it as part of the work — never leave it stale.

  Fill in EVERY section below. A task file must be executable by a session that
  has no memory of the conversation that created it. If a fact matters, it lives
  here or in a linked ADR — never only in a chat transcript. Delete these HTML
  comments in a real task; keep the headings.
-->

## Context

Why this task exists, in plain language. What came before it and what problem it
solves. Link the relevant roadmap/backlog entry and any ADRs that govern it
(e.g. `../adr/00NN-...md`). If this task is part of a milestone, name it.

## Scope

**Touch exactly these files/areas:** …
**Do NOT touch:** … (call out anything nearby that must be left alone).

Keep the blast radius small. This is a fence, not a suggestion.

## Specification

Concrete, unambiguous requirements. Where behavior is involved, give **examples
of expected input → output**. Where the data model is involved, name the exact
collections, fields, and migration number. Prefer over-specification: an
ambiguity here becomes a wrong implementation later.

## Acceptance criteria

A checklist the executing session can verify **itself**:

- [ ] …behavioural requirement, stated so it is objectively checkable…
- [ ] Tests: which test(s) must exist and pass (e.g. new assertions in
      `scripts/smoke_test.sh`, or `tests/gang_boxes.ps1`), and the command to run.
- [ ] `scripts/smoke_test.sh` passes green (required for any migration/backend change).
- [ ] Docs updated per the docs-as-code checklist in `../../CLAUDE.md`.

## Guardrails

- Settled decisions this task must NOT relitigate (link the ADR/non-goal).
- Known pitfalls (e.g. PocketBase JSVM: hook handlers can't see file-scope
  helpers; a `json` field must be parsed from `getString()`, not `get()` — see
  ADR 0021).
- If you touched `pb_public/`, bump `VERSION` in `pb_public/sw.js`.
- Anything the task must **not** "improve" along the way.

## Definition of done

- [ ] Acceptance criteria all checked.
- [ ] Build/tests green; smoke test green if backend/migrations changed.
- [ ] Documentation updated (ADR / DEVELOPER_GUIDE / USER_GUIDE / README /
      current-state as applicable), and `AGENTS.md` mirrored if `CLAUDE.md` changed.
- [ ] `Status:` above set to `DONE`; milestone checkbox ticked in `ROADMAP.md`
      if this task closes one.
- [ ] Committed (author: maintainer only, **no `Co-Authored-By` trailer**) with
      a message describing what changed. Then stop and show the maintainer.

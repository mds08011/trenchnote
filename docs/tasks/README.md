# docs/tasks/ — the task queue

This directory holds **self-contained implementation prompts**, one per file,
each sized for a single focused coding session. It exists so that committed
near-term work can be handed to any session (including a less-capable model,
with no memory of the conversation that planned it) and executed correctly from
the file alone.

## Empty is the normal state

TrenchNote is **post-v1.0 and in parking-lot mode** (see `../../ROADMAP.md`).
Most of the time this directory contains only this `README.md` and
`_TEMPLATE.md`, and that is correct. **An empty queue is not a signal to invent
work.** When there are no actionable task files, a session runs the
**roadmap-maintenance workflow** in `../../CLAUDE.md`, not the execution
workflow.

Ideas that are *not yet committed work* live in `../../ROADMAP.md` (shaped
ideas + the free/paid line) and `../BACKLOG.md` (incident-driven product
backlog). A task file is created **only** when the maintainer has decided to
build something and approved breaking it down.

## How to use it

- **Execution:** pick the **lowest-numbered** file whose `Status:` is not `DONE`
  and not `BLOCKED`. Do exactly what it says; update its `Status:` when finished.
  Full rules are in the "Session workflows" section of `../../CLAUDE.md`.
- **Numbering:** three digits, in tens (`010`, `020`, `030`), so tasks can be
  inserted between existing ones without renumbering. The number encodes
  **order**: lower numbers are done first, and a task may state a dependency on
  a lower-numbered one.
- **One task = one session.** If a task cannot be completed and verified in one
  focused sitting, it is too big — split it.
- **Status line** is the first content line of every task file and is one of:
  `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED (reason)`. A session can find the
  next actionable task by scanning status lines alone.

## Creating a task

Copy `_TEMPLATE.md` to `NNN-short-kebab-title.md` and fill in **every** section.
The template is written so that a filled-in task needs no outside context: if a
fact matters, it belongs in the task file or in a linked ADR, never only in a
chat transcript.

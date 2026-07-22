# 010 — Draft the equipment-timecard handoff contract (PROPOSED)

Status: TODO

## Context

The maintainer decided (2026-07-21, see `../../ROADMAP.md` "Decided") to promote
the **equipment-timecard handoff** to TrenchNote's first real cross-product
contract. Producer: **TrenchNote** (this repo), exposing the append-only
`movements` and `readings` ledgers. Consumer: **`bindery-trenchnote`** (private
premium sidecar), which composes the weekly equipment timecard and applies
rates. This keeps `docs/BACKLOG.md` item 7 minimal — the core stays a ledger and
never computes billing (ADR 0011, ADR 0015; and the "export-only" guardrail in
ROADMAP).

The promotion process is defined in `../ecosystem-contracts.md` ("Promotion
path"). **This task is only step-one of that path: a written proposal for
review.** It does not freeze anything, ship code, or touch the sidecar.

Read first: `../ecosystem-contracts.md` (whole doc — it defines the conceptual
field vocabulary this contract must reuse), `../adr/0011-core-premium-extension-boundary.md`
(the boundary), `../adr/0012-timecard-data-capture.md` and
`../adr/0015-rental-dates-in-core.md` (what data exists), and
`../domain-model.md`.

## Scope

**Create:**
- `../adr/0022-equipment-timecard-handoff-contract.md` — a new ADR with
  `**Status:** proposed` (not accepted).
- `../contracts/timecard-handoff/` — a folder with **example JSON fixtures**
  (fictional but realistic data) illustrating the payload the contract defines.

**Do NOT touch:** any file in `pb_migrations/`, `pb_hooks/`, `pb_public/`,
`scripts/`, or `docs/API.md`. Do **not** modify the `bindery-trenchnote` repo.
Do **not** add or change any collection, field, or endpoint. This is paper only.

## Specification

The ADR must propose a **versioned, replay-safe** payload that lets the consumer
answer, for a billing period: *which owned equipment sat at which job, for which
span, with which meter readings* — derived entirely from data TrenchNote already
holds. Concretely:

1. **Reuse the conceptual vocabulary** in `../ecosystem-contracts.md` (lifecycle
   event and/or handoff manifest, external reference, evidence envelope,
   versioning rules). Do not invent a parallel vocabulary; map onto that one.
2. **Derive, don't add.** The payload is built from `movements` (where/when a
   thing was, from its append-only history) and `readings` (meter/odometer, with
   observation date per ADR 0016). "Current job" is the location's `job_code`
   (ADR 0012). Do not propose new stored fields to make the payload nicer — if
   something is missing, list it as an open issue (see 4).
3. **Provide fixtures.** At least: one asset that sat at two jobs in one week
   (the fractional-split case from BACKLOG item 2 / incident 2), and one with a
   month-end meter reading. Fixtures are fictional; use tag codes like `P-138`.
   Each fixture file must be valid JSON.
4. **Name the open issues explicitly** in the ADR, at minimum:
   - TrenchNote has **no project entity**; only `locations.job_code` carries job
     context (an open issue in `../ecosystem-contracts.md`). State how the
     contract references a project without one, and cross-link BACKLOG item 4.
   - TrenchNote has **no stable public IDs** for movements/readings/locations
     (only `assets.tag_code` is a stable human id). State what the contract uses
     for `subject_ref` today and what would have to change to do better.
   - The consumer needs rates, which are **premium-only** (ADR 0015). Confirm
     the contract carries **no** rate/cost data (dates and readings only).

The ADR follows the house format (Title; Status/Date; Context; Decision;
Alternatives rejected; Consequences), matching the existing ADRs.

## Acceptance criteria

- [ ] `../adr/0022-equipment-timecard-handoff-contract.md` exists, `Status: proposed`,
      in the house ADR format, and reuses `ecosystem-contracts.md` vocabulary.
- [ ] It carries no rate/cost data and proposes no new collections/fields/endpoints
      (any gap is listed as an open issue, not designed around by adding storage).
- [ ] `../contracts/timecard-handoff/` contains at least the two fixtures above,
      each valid JSON (verify: `node -e "require('fs').readdirSync('docs/contracts/timecard-handoff').forEach(f=>JSON.parse(require('fs').readFileSync('docs/contracts/timecard-handoff/'+f)))"` or equivalent).
- [ ] No files changed under `pb_migrations/`, `pb_hooks/`, `pb_public/`,
      `scripts/`, or `docs/API.md`; `bindery-trenchnote` untouched.
- [ ] Presented to the maintainer for review. **Because the ADR is PROPOSED, do
      NOT add it to the `docs/documentation-index.md` accepted-ADR table yet** —
      that happens only when it is accepted.

## Guardrails

- **This is a proposal for review, not a freeze.** Do not bump the API contract
  version (`docs/API.md`), do not mark the ADR accepted, do not publish anything
  as binding. Steps 2–6 of the promotion path (fixtures→ADR-in-each-repo→
  published versioned contract + tests) are later tasks, gated on maintainer
  acceptance of this proposal.
- Respect the `ecosystem-contracts.md` "Explicit exclusions": no shared DB/SQL,
  no central auth, no universal work-item model, no copying rates/pricing into
  public payloads. The contract must remain usable by any API client, and the
  core must stay fully functional with no consumer present (ADR 0011).
- Do not "fix" the missing project entity or public IDs by adding schema in this
  task — those are decisions for their own ADRs. Name them; don't solve them here.

## Definition of done

- [ ] Acceptance criteria all checked.
- [ ] No code/migration/test changes (this is a docs-only proposal), so no
      `sw.js` bump and no `smoke_test.sh` run are required.
- [ ] `Status:` above set to `DONE`.
- [ ] Committed (author: maintainer only, **no `Co-Authored-By` trailer**) with a
      message describing the proposal. Then stop and show the maintainer for the
      accept/revise decision that unblocks the follow-up promotion tasks.

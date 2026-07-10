# ADR 0014 — Certs & inspections: a derived compliance badge, visibility not workflow

**Status:** accepted · **Date:** 2026-07-10

## Context

A jobsite is full of things that are legal to use only *until a date*:
slings, harnesses, gas monitors, fire extinguishers, crane annuals,
ladders. Today that tracking lives on paper tags zip-tied to the gear and
in people's memories — and enforcement arrives as an OSHA citation after
the fact. TrenchNote already tapes a QR to the asset, so the scan that
answers "where is it" can also answer the question the paper tag was
trying to answer: **is this currently safe and legal to use?**

## Decision

Two collections (migrations `1783468813`–`1783468814`), one derived
badge, and a hard scope fence.

### The scope fence: visibility, not a safety program

This module **records inspections and shows status**. It does not
schedule work, assign inspectors, approve anything, escalate anything, or
constitute compliance with any regulation. If a feature request needs
workflow — assignments, approvals, escalations, sign-off chains — the
answer is **no** (now recorded in CLAUDE.md's non-goals). TrenchNote
shows a red badge; a human safety program acts on it. The moment the app
pretends to *be* the safety program, its records become a liability
instead of a defense.

### `inspection_requirements` — what an asset owes

`asset` (relation) · `name` ("Monthly visual") · `interval_days` (int —
**the only scheduling concept in the module**) · `reference` (free-text
citation: "OSHA 1910.157(e)(2)", "Manufacturer manual §4"). Catalog-like
data: managers create and edit it as the safety program changes
(update allowed, delete admin-only — same posture as items/locations).
Attached to the **asset**, not the item: inspection clocks are per-unit
facts, unlike `items.meter` which is a property of a kind of thing.

### `inspections` — the third append-only ledger

`asset` · `requirement` (nullable — ad-hoc inspections are real) ·
`result` (`pass` | `fail` | `removed_from_service`) · `inspected_by`
(free text) · `inspected_at` · `note` · `photo`. Update/delete are
`null`, exactly like movements and readings: these records are what
stands between the company and a citation, so corrections are new
records and the history is the defense.

The create rule enforces shape server-side, movements-style: an
inspection is ad-hoc (`requirement` empty) **or** its requirement
belongs to the same asset (`requirement.asset = asset`) — a pass on the
extinguisher's monthly visual can never satisfy the harness.

**`inspected_at` is client-set** (date-only at UTC midnight, the
reservations convention) — a deliberate departure from movements and
readings, which lean on the server-assigned `created`. Compliance math
cannot ride the server clock: an inspection done offline Friday must not
read as done Monday when it syncs, and paper records being back-entered
need their true dates. `created` is still recorded, so a back-entered
inspection is visible as such (inspected_at far from created) — the
ledger permits back-dating but never hides it.

### The derived badge — nothing stored, ADR 0002 applied to compliance

Per requirement: `next_due` = latest **passing** inspection's
`inspected_at` + `interval_days`. Per asset:

- **RED / DO NOT USE** — any requirement whose latest inspection is
  `fail`/`removed_from_service` with no later pass; **or** any
  requirement past due; **or** any requirement with **no passing
  inspection on record** (owed and unproven is not known-safe — harsh on
  day one, and correct: log the inspection you just did and it turns
  green); **or** a blocking ad-hoc fail/removed (its own lane, cleared
  by a later ad-hoc pass).
- **YELLOW / DUE SOON** — any requirement due within **14 days**. The
  window is a code constant (`TNInspect.DUE_SOON_DAYS`), **not a
  setting**: a settings screen is a support burden and an invitation for
  every site to disagree about what yellow means.
- **GREEN** — requirements exist, all current.
- **no badge** — no requirements and nothing blocking: the module costs
  most assets nothing, visually or in bytes.

There is no stored status column anywhere. A stored badge could disagree
with the ledger it summarizes — the same reasoning as derived bulk stock
and the derived latest reading (ADR 0002, ADR 0012).

### One shared file: `tn-inspect.js`

The badge logic lives in `pb_public/tn-inspect.js`, shared by asset.html
and index.html — the **second** exception to "every page is
self-contained" (tn-auth.js is the first), justified the same way: two
drifting copies of DO-NOT-USE logic is how the dashboard says green
while the scan page says red. Safety verdicts get one implementation.

### UI placement

On asset.html the **RED banner renders above the location plate** — "do
not use" outranks "where is it", the page's own signature element. The
dashboard gains an **Inspections panel** (RED first, then YELLOW by due
date — the Monday-morning safety walk), rendered only once the module is
in use. The full ledger exports as **CSV, client-side, free tier**.
Logging an inspection rides the existing offline queue (pre-generated
ids, multipart replay for the photo — the ADR 0008/0012 pattern
unchanged). A fail/removed without a photo triggers one loud confirm and
is then accepted: a missing camera must never stop someone pulling
unsafe gear from service.

## Alternatives considered

- **A stored badge/status column on assets** — rejected; see above.
  Offline syncs arriving out of order would bake in wrong verdicts.
- **A configurable due-soon window** — rejected. Resist settings; 14
  days is one code change if the division disagrees.
- **Treating never-inspected as neutral (gray/green)** — rejected. A
  requirement with no passing record cannot be shown to be current;
  "unproven" rendering as safe is exactly the failure mode paper tags
  have.
- **Scheduling/assignment workflow** (who inspects what next week,
  overdue escalation emails) — rejected as scope, per the fence. Email
  digests of upcoming/overdue items are noted in ROADMAP.md as a
  possible future hosted-tier concern, outside this repo (ADR 0011).
- **Attaching requirements to items instead of assets** — rejected: two
  identical harnesses bought a year apart owe inspections on different
  clocks, and one of them failing must not redden the other.
- **Server-side hook to compute/notify on due dates** — rejected for
  the free core: it would be the module's only piece of state-scanning
  server code, and "who gets told" is workflow. The dashboard panel and
  the CSV are the free tier's answer.

## Consequences

- The API contract gains two collections — **additive**, contract v1
  stands; shapes documented in API.md.
- `seed_demo.sh` seeds one RED (failed harness), one YELLOW
  (extinguisher due in 10 days), one GREEN (calibrated gas monitor) —
  possible honestly because `inspected_at` is client-set.
- The offline queue gains a third entry kind (`inspection`), replaying
  multipart like readings.
- `docs/inspection-seeds.md` offers requirement *templates* with a loud
  disclaimer: intervals and applicability vary by regulation,
  manufacturer, and company program — the seeds are examples, never
  advice.

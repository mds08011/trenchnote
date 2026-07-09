# ADR 0002 — One append-only ledger; locations and stock are derived

**Status:** accepted · **Date:** 2026-07-08 (bulk extension same day)
**Amended:** 2026-07-09 — the "nothing leaves the system" clause is
superseded by [ADR 0005](0005-consumption-movements-without-destination.md)
(consumption: bulk movements with no destination).

## Context

TrenchNote answers "where is it?" and "who moved it?" for two very different
kinds of things: unique assets (a serial-numbered scissor lift) and bulk
commodities (500 pipe supports). The naive design — a `location` column on
assets and a `stock` counter per location — drifts the moment two people race
an update or someone edits a number by hand, and it keeps no history. History
is the product: materials sit in staging yards for 12–18 months, and when
they go missing the vendor dispute is won or lost on "who moved it, when."

## Decision

- **The `movements` collection is the single source of truth.** It is
  append-only at the API-rule level: `updateRule` and `deleteRule` are
  admin-only even while every other rule is still Phase-1 permissive.
  Corrections are new movement records, never edits.
- **One ledger holds both worlds.** An asset move sets `asset`; a bulk move
  sets `item` + `quantity`. The either/or shape is enforced by the
  collection's server-side `createRule`, not by trusting clients.
- **`assets.current_location` is a cache.** Every move writes the ledger
  record first, then updates the cache; the order guarantees a failure leaves
  a true ledger with a stale cache rather than a lost move.
- **Bulk stock-on-hand is derived on read** by summing the ledger per
  location (in minus out). No stored stock column exists anywhere.
- **Nothing leaves the system.** `to_location` is required; consumed or
  installed material is moved to a location created for that purpose
  ("Installed — Northside"). The ledger stays complete forever.
- **Reservations are soft claims**, not locks. They warn ("spoken for"), they
  never block a move — on a real site, the person standing next to the
  machine wins anyway; the system's job is to make sure they know who they're
  taking it from.

## Consequences

- Full audit trail for free; the recently-moved feed and "days here" both
  fall out of the ledger with no extra bookkeeping.
- Derived stock can't drift, but it can go negative if reality and ledger
  disagree — that's a feature: material.html shows the ledger's count at the
  source location so drift becomes visible and gets corrected with a
  movement, not a hand-edit.
- Reads do a little more work (summing on load). At division scale — hundreds
  of movements per material — this is far below the threshold where it
  matters; pagination past PocketBase's 500-per-page cap is the known upgrade
  path.

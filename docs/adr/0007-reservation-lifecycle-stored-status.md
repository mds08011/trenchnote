# ADR 0007 — Reservation lifecycle: stored status, humans close claims

**Status:** accepted · **Date:** 2026-07-09

## Context

Reservations existed as passive banners: a claim appeared, and when its
dates passed it silently vanished. Completing the barter-logistics story
needs a lifecycle — claims get satisfied ("I handed Malcolm the lift") or
withdrawn ("never mind, we rented one") — and the question was whether
that state could be *derived* from the ledger or must be *stored*.

## Decision

**Stored: a `status` select (`open` | `fulfilled` | `cancelled`), closed by
humans.** Derivation fails on both exits:

- *Fulfilled* is not derivable. Reservations carry no location, so no
  movement can be mechanically matched to a claim — and with claims queued
  on one asset, even a location match couldn't say whose claim was
  satisfied. Only the person who handed it over knows.
- *Cancelled* is not derivable from anything, and deleting the row instead
  would erase demand history (deletes are superuser-only by design).

Mechanics:

- `status` is **not required**; empty means open, so pre-migration rows
  need no backfill.
- The `createRule` forbids creating a claim already fulfilled/cancelled.
- The `updateRule` stays plain auth-required: any signed-in user may close
  any claim. TrenchNote records reality, it doesn't referee it — and with
  a shared field account there is no per-person ownership to enforce.
- A `note` field ("for the clarifier pour") rides along.

UI consequences, decided together:

- **Humans close claims at the natural moment**: after a move, asset.html
  offers "did this hand it over?" with one-tap fulfill per open claim. No
  auto-matching guesswork. Cancelling is available on each banner, behind
  one confirm.
- **Stale open claims are flagged, never hidden.** The old behavior
  (date-based hiding) silently disposed of unresolved questions; now an
  open claim past its `expected_release` turns red ("release date
  passed") on both asset.html and the dashboard until someone closes it.
- Fulfilled/cancelled claims leave the pages but stay in the database —
  how often claims are fulfilled late is future-useful history.

## Consequences

- The claim queue is fully visible (all open claims, soonest first), so
  conflicts surface before they happen; two claims on one asset remain
  legal — people negotiate, the app shows them who to call.
- Anyone can close anyone's claim. Accepted deliberately: the alternative
  (ownership rules) fights the shared-account model from ADR 0004 and the
  tool's recording-not-refereeing stance.
- Flagged-forever stale claims create gentle pressure to actually close
  them — which is the point.

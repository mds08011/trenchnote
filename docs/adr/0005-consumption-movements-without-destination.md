# ADR 0005 — Consumption: bulk movements with no destination

**Status:** accepted · **Date:** 2026-07-09 · Amends ADR 0002

## Context

ADR 0002 declared "nothing leaves the system": `to_location` was required,
and installed/used-up material was handled by convention — transfer it to a
location like "Installed — Northside". Field reality: most consumed material
doesn't need a destination ("we used 200 supports"), and forcing crews to
maintain per-site "Installed" pseudo-locations turns a two-tap log into
housekeeping. The maintainer asked for a real consume concept: stock leaves,
history stays.

## Decision

A **consume is a bulk movement with a `from_location` and no
`to_location`** (migration `1783468807`). The movement's meaning is now
fully determined by which locations are set — receive (to only), transfer
(from + to), consume (from only) — enforced server-side in the `createRule`.
`to_location` is optional at the field level, but the rule still requires it
for **asset moves**: a physical machine always lands somewhere.

Derivation stays trivial: a consume subtracts from its source and adds
nowhere. Dashboard totals become *deliveries minus consumptions* (the old
"sum of deliveries" shortcut assumed nothing ever left).

The "Installed — X" location convention remains valid and becomes a choice:
consume when material is simply gone; transfer to an Installed location when
you want to track *where* it ended up. Both keep the ledger complete.

Negative balances are **displayed and flagged as data errors**, never
hidden or clamped — a negative count means more left a spot on paper than
ever arrived there, and the fix is a correcting movement (usually the
delivery nobody logged).

## Consequences

- "Who used what, where, when" stays answerable forever — the consume
  record is a normal append-only ledger row with `moved_by` and `note`
  (PO/slip numbers, "clarifier weir bay 2").
- The ledger can now express less stock than was delivered, which is true.
- Rejected: a `consumed` boolean or select field (redundant — the location
  shape already says it), and a separate consumptions collection (splits
  the single source of truth).

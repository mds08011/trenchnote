# ADR 0020 — Transfer manifests are a derived transit state confirmed atomically

**Status:** accepted · **Date:** 2026-07-12

## Context

A site-to-site truckload is one physical handoff but many ledger lines. The
sender needs to say what left, a driver needs a paper copy, and the receiving
superintendent needs to confirm what arrived. A plain series of movements
cannot record the disagreement between those two observations: “sent 40,
received 38” collapses into whichever number somebody typed last.

The design has two coupled questions:

1. What does “in transit” mean before the receiver confirms anything?
2. How can one offline receipt create several immutable movements and finish a
   workflow without leaving a half-received manifest after a dropped signal?

The existing ledger and stock derivation (ADRs 0002 and 0005) must remain the
source of truth. Plain transfers and consumes cannot acquire a second stock
formula just because manifests exist.

## Decision

### In transit is manifest-derived, not a virtual location

Dispatch changes the manifest from `draft` to `in_transit`. It writes no
movement and does not patch `assets.current_location`. Asset and material pages
overlay “in transit on Manifest #…” from open manifest lines while their ledger
location and stock remain unchanged until the receiving observation exists.

This deliberately means the source ledger still includes the load during the
trip. The UI shows the committed/in-transit amount separately; it never quietly
subtracts it from the ledger count. Writing a source-to-transit movement at
dispatch would force receipt to write a second transit-to-destination movement,
make every stock reader understand a synthetic location, and create stranded
stock when a receiver is offline. Derived workflow state disturbs the existing
math least.

### Confirmation is one PocketBase batch transaction

The `manifests` and `manifest_lines` collections are additive. Lines use the
movements union: one asset, or one bulk item plus quantity. `sent_quantity` is
immutable after dispatch. PocketBase number fields have a zero empty value, so
the parent status supplies nullability for `received_quantity`: zero while
draft/in-transit means unconfirmed; zero after receipt means the receiver
confirmed none arrived.

One receive submit sends a PocketBase `/api/batch` transaction containing, in
order:

- each line's received quantity and condition note;
- the ordinary movement(s) produced by that line;
- `assets.current_location` patches after their movements;
- the final manifest status and `received_by` account.

PocketBase rolls the whole batch back if any request fails. The offline queue
stores the semantic batch before attempting it and gives every created movement
a pre-generated id. If the response disappears after commit, replay verifies
the manifest's terminal status and treats the batch as already complete. This
extends ADR 0008's visible, idempotent queue without a background-sync API or a
new dependency.

The migration enables PocketBase's built-in batch endpoint with a 250-request,
10-second ceiling. That is bounded enough for the single SQLite writer and large
enough for a phone-sized manifest. No file uploads ride these transactions.

### Shortfalls go to one explicit holding location

Receipt removes the full sent quantity from the source. The received portion
moves to the destination; a shortfall moves to the seeded
`Missing in transfer` location (type `transit`). A missing unique asset moves
there as one whole asset. This is not the in-transit representation: it is the
post-receipt fact that the two people disagreed and the item remains unresolved.

The holding-location convention preserves total inventory, makes the loss
visible in ordinary location/stock views, and gives a later find an ordinary
movement back out. Treating a shortfall as a consume would falsely say it was
installed or used and would erase it from total inventory.

### Workflow rules are server-side and forward-only

API rules enforce `draft → in_transit → received | received_with_discrepancies`.
Route, driver, and creator are immutable once created. Receipt requires
`received_by` to equal the authenticated account making the request. Line shape
and sent quantity freeze at dispatch; only received quantity and condition note
can change while the parent is in transit.

With shared field accounts (ADR 0004), `created_by` and `received_by` identify
the signed-in crew/account. `driver_name` remains free text for the human in the
truck, matching `moved_by`.

### Gang Boxes travel as one asset line

Gang Boxes (ADR 0021) are ordinary assets marked `is_container`. A top-level
box therefore uses the existing one-unit asset branch and appears once on the
manifest; its contents are not repeated as lines. The Gang Box migration
tightens the line create rule so an asset already inside a box cannot be listed
independently and moved twice. At receipt the movement moves the box, while
contained assets continue deriving their effective location from it.

## Alternatives rejected

- **A virtual in-transit location at dispatch.** Rejected because it adds two
  movements per transfer, changes every stock display during a trip, and leaves
  synthetic stock behind whenever the second half has not synced.
- **Independent REST writes with a final status patch.** Pre-generated ids avoid
  duplicates but do not prevent a half-received manifest. The built-in batch
  transaction provides the boundary the handshake needs.
- **Shortfall as consumption.** Rejected because “not on the truck” is not
  “installed/used,” and global stock would be understated.
- **Carrier, tracking, cost, or freight fields.** Rejected by scope. A manifest
  is a two-site handshake, not a shipping system.

## Consequences

- Existing movement shapes and stock sums are unchanged. A completed partial
  receipt subtracts the full sent quantity from the source, adds only the
  received quantity to the destination, and exposes the balance at
  `Missing in transfer`.
- During transit the UI must state both truths: ledger stock still at source,
  and quantity committed on a named manifest. It must not label a silently
  adjusted number “on hand.”
- Batch requests become part of core's public API usage and self-hosters receive
  the required setting through the migration.
- Dispatch and receive work offline after the relevant shell/data has been
  loaded; as with every offline transfer between phones, the destination cannot
  see a sender's new manifest until the sender reaches the one writable server.

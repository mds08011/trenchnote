# TrenchNote invariants

**Authority:** Normative where marked confirmed; proposed where marked desired

**Reviewed:** 2026-07-12

An invariant is a rule that should remain true across implementation changes.
This document separates protections already enforced or consistently followed
from rules desired for future ecosystem handoffs.

## Confirmed current invariants

### The ledger is written before its cache

**CONFIRMED CURRENT:** for an asset move, create the `movements` record first,
then patch `assets.current_location`. A failed cache patch may make a page stale;
the reverse order could create a location claim with no historical fact.

### Movement shape is enforced on the server

**CONFIRMED CURRENT:** a movement identifies exactly one subject world:

- asset set, item empty, quantity zero, destination required; or
- asset empty, item set, quantity positive, at least one location set.

Client validation is convenience. The collection `createRule` is the boundary.

### Bulk stock is never directly edited

**CONFIRMED CURRENT:** stock is the sum of movement facts by location. There is
no stock field to backfill or reconcile. Negative stock remains visible as a
data error rather than being clamped to zero.

### User-facing ledger corrections append facts

**CONFIRMED CURRENT:** authenticated application clients cannot update or delete
movements, readings, or inspections. A correction is a later record that leaves
the original evidence visible.

Current caveat: PocketBase superusers bypass collection API rules. Therefore
this is an application/client invariant and operating rule, not cryptographic
immutability. No explicit `corrects` or `supersedes` link exists.

### Observation time and entry time remain distinct where field date matters

**CONFIRMED CURRENT:** inspections keep client-set `inspected_at` and server-set
`created`; readings keep optional client-set `read_at` and server-set `created`.
Offline replay must preserve the observation date.

### Derived inspection status is not stored

**CONFIRMED CURRENT:** due dates and RED/YELLOW/GREEN standing are calculated
from `inspection_requirements` and `inspections` by
`pb_public/tn-inspect.js`. No client writes a compliance-status field.

### Requirements cannot satisfy another asset

**CONFIRMED CURRENT:** when an inspection references a requirement, the server
requires `requirement.asset = asset`.

### Empty reservation status means open

**CONFIRMED CURRENT:** readers and filters treat both `""` and `"open"` as an
open reservation. Old rows remain valid without a destructive backfill.

### Date-only values render in UTC

**CONFIRMED CURRENT convention:** reservation dates, rental dates, inspection
dates, and reading observation dates represent date-only UTC midnight values.
Formatting must specify `timeZone: 'UTC'` to avoid showing the previous day in
western time zones.

### Offline replay is idempotent and visible

**CONFIRMED CURRENT:** first-party write paths pre-generate PocketBase IDs.
Replaying an already committed ID is success. Other failures park visibly; the
queue never silently drops a record. Queue order is FIFO server arrival order.

### Cached data never impersonates live data

**CONFIRMED CURRENT:** an API response served from the offline cache carries an
`X-TN-Cached-At` stamp, and the shared UI displays staleness. Clearing a session
also clears API caches for the shared-device authentication model.

### Field execution has no paid dependency

**CONFIRMED CURRENT and DECIDED:** scanning, moving, receiving, inspecting,
retaining, backing up, and current core exports work without a proprietary
sidecar. Optional paid software receives no in-process hook or direct database
access.

### Receiving evidence stays on the receiving event

**CONFIRMED CURRENT:** vendor/PO text, packing slip, OS&D note, and damage photos
attach to the movement that records receipt. TrenchNote does not create a
parallel delivery or purchase-order record that could drift from the ledger.

### Safety visibility does not become safety authority

**CONFIRMED CURRENT and DECIDED:** TrenchNote records observations and shows
derived attention. It does not assign inspectors, approve procedures, claim
legal compliance, or replace the operator's safety program.

### Service-worker shell changes are versioned

**CONFIRMED CURRENT convention:** every change under `pb_public/` requires a
`VERSION` bump in `pb_public/sw.js`, including a change to the service worker
itself. Markdown documentation changes do not.

## Current facts that are not stronger invariants

- `assets.current_location` is useful but may be stale; it is not truth.
- A typed `po_number` is a receiving reference, not proof a purchase order
  exists or matches the delivery.
- `moved_by`, `recorded_by`, `inspected_by`, and `assigned_to` are human-entered
  text, not verified user identities.
- Email notification is best effort. Delivery success is not required for a
  movement to be true.
- `tag_code` is permanent by convention and unique index, but there is no
  database rule preventing an authenticated update after printing.
- Quantities are positive integers, but the schema has no explicit
  unit-of-measure field.
- The REST contract is versioned as v1, but individual records do not carry a
  contract-version field.

## Desired future invariants

Everything in this section is **PROPOSED**. None is a statement of current
TrenchNote behavior.

### Product authority remains separate

Each product should keep its own authoritative database and domain facts.
TrenchNote owns logistics; LineCheck should own linear acceptance; LoopCheck
should own plant checkout and turnover. A handoff references source facts but
does not transfer or erase their authority.

### Public identity is stable and namespaced

A cross-product reference should identify issuer, object type, and stable public
ID without assuming two PocketBase databases share record IDs. Human codes may
travel alongside the ID but should not be the sole identity unless their scope
and permanence are explicit.

### Project identity is scoped and unambiguous

A project reference should name the issuing system and stable project ID, with
human project/job codes as labels. `locations.job_code` alone should not become
an implicit global key.

### Imports preserve provenance

An imported reference or evidence record should retain source product,
contract version, source public ID, source timestamp, import timestamp, and the
original payload or its integrity reference. Re-import should be idempotent.

### Evidence remains linked to the original fact

Evidence should remain attributable to the event or executed record that
produced it. Copying a photo into another application should not make the copy
authoritative or erase its source.

### Signed or executed records are not silently edited

If a future product signs, accepts, or locks an executed record, the frozen
content should not change in place. Corrections should create a traceable
replacement/void relationship while retaining the original record and
signatures. TrenchNote currently has no signature or lock model.

### Hash and calculation versions travel with their results

If a future handoff uses evidence hashes, canonical serialization, or domain
calculations, it should retain the algorithm/method version and explicit units.
TrenchNote currently performs no acceptance calculation and hashes no evidence.

### Lifecycle events are facts, not remote commands

A lifecycle event should state what the authoritative product recorded. It
should not command another application's workflow, mutate another database, or
pretend delivery guarantees acceptance. Consumers decide whether and how to
create local work from it.

### Handoffs are versioned and replay-safe

A handoff should declare its schema version, producer, stable manifest ID, and
source references. Replaying the same manifest should not duplicate local
records. Partial failure should remain visible and retryable.

### Basic field execution remains independently deployable

No shared authentication service, aggregation platform, or proprietary
application should become a runtime requirement for the open-source field
applications. Optional managed services may fail without preventing field facts
from being recorded locally.

## Validation before promotion

A desired invariant becomes confirmed only after:

1. an accepted ADR defines the rule and its tradeoffs;
2. the owning repository implements it at the authoritative boundary;
3. tests or reproducible verification prove the behavior; and
4. current-state and public-contract documentation are updated together.

## Related documents

- [Current state](current-state.md)
- [Product boundary](product-boundary.md)
- [Domain model](domain-model.md)
- [Architecture status](architecture-status.md)
- [Proposed ecosystem contracts](ecosystem-contracts.md)

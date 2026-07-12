# TrenchNote product boundary

**Authority:** Normative for TrenchNote's current scope; proposed for
cross-product ownership

**Reviewed:** 2026-07-12

This document protects TrenchNote from becoming a general construction
workflow system. It describes the boundary already supported by the repository,
then labels product-family ownership that still requires agreement.

## Bounded context

**CURRENT:** TrenchNote owns the field-logistics record for a physical asset or
bulk material while it is being received, stored, held, moved, issued, or
consumed.

Its primary object is a **physical inventory subject**:

- a unique asset identified in the field by a permanent `tag_code`; or
- a cataloged bulk item whose quantities move between locations.

Its core question is:

> Where is this physical material or asset, and what happened to it?

The movement ledger is the central record. Reservations, meter readings,
receiving evidence, and asset inspections remain in scope because they are
facts captured about the same physical subject at the same field touchpoint.

## Workflows TrenchNote owns

**CURRENT owned workflows:**

- define catalog items, physical assets, and logistics locations;
- assign permanent field tag codes and print browser-openable QR labels;
- receive bulk material from outside the tracked location network;
- record delivery evidence: vendor text, typed PO reference, packing slip,
  OS&D note, and damage photos;
- move a unique asset between locations;
- transfer bulk quantities between locations;
- consume bulk material so it leaves stock while remaining in history;
- derive asset location and bulk stock from movement facts;
- record free-text custody and movement attribution;
- reserve an asset and explicitly fulfill or cancel the claim;
- record meter/odometer observations associated with a physical asset;
- record recurring inspection requirements and inspection observations for a
  physical asset; and
- show inspection attention as a derived visibility aid.

TrenchNote may preserve an **installation reference** in a movement note or by
transferring material to an operator-created “Installed — …” location. That is
a logistics statement about where material left stock; it is not proof of
installation quality, acceptance, startup, or turnover.

## Explicit non-goals

**DECIDED:** TrenchNote does not own:

- procurement, purchase-order records, ordered quantities, invoice matching,
  rates, costing, accounting, payroll, or equipment billing calculations;
- vendor API integrations;
- construction scheduling or lookahead planning;
- inspection assignments, approvals, escalations, or a company safety program;
- installation acceptance, test procedures, service clearance, startup,
  functional testing, training approval, or turnover packages;
- a general form builder, workflow engine, document-management system, ERP, or
  Procore replacement;
- multi-tenant shared databases or multi-master instance synchronization;
- direct database access by sibling or paid products; or
- a paid dependency required to execute, retain, back up, or export the basic
  field ledger.

If a proposed feature requires TrenchNote to know what was ordered, schedule
people, approve work, determine regulatory compliance, or orchestrate another
product's workflow, it crosses this boundary and requires an explicit
architecture decision before implementation.

## Neighboring products

The following family map combines local repository evidence with intended
boundaries. “Proposed owner” is not a statement that the capability is shipped
or has been migrated.

| Product | Status at review | Primary concern | Boundary relative to TrenchNote |
| --- | --- | --- | --- |
| TrenchNote | **CURRENT** working, deployed field ledger; repository ahead of deployment | Where is the physical material or asset, and what happened to it? | Owns logistics facts through receipt, storage, custody, movement, issue, and consumption/installation reference |
| LineCheck | **CURRENT** pre-alpha domain/contracts scaffold; **PROPOSED** lifecycle owner | Has linear infrastructure or a service connection completed its required acceptance sequence? | Should consume explicit references or handoffs, never TrenchNote database rows; proposed owner of pressure testing, flushing, disinfection, sampling, service cutover, and restoration |
| LoopCheck | **CURRENT** separate application with plant checkout and currently implemented service-cutover features | Is a plant asset or process system ready to operate and turn over? | Owns equipment/system checkout, startup, functional testing, training, and turnover; its existing service-cutover feature creates an overlap to resolve deliberately |
| `*-lookahead` products | **CURRENT/UNKNOWN by repository** optional sidecars; TrenchNote's sidecar boundary is accepted in ADR 0011 | Paid coordination, aggregation, managed operations, and integrations | May consume public, versioned interfaces; must not become necessary for basic field execution or receive private database coupling |

## Current overlap

### Inspections

**CURRENT:** TrenchNote records inspection observations tied to a physical asset
and derives a visibility badge. LoopCheck records richer equipment checkout and
commissioning checks.

Boundary rule:

- TrenchNote may answer “does this tracked physical thing have a current
  inspection observation, or was it failed/removed?”
- LoopCheck owns “did this equipment or system complete the technical checkout
  required for startup and turnover?”
- Neither system should silently translate one record into the other's
  acceptance without an explicit, versioned handoff and human-visible
  provenance.

### Installation and consumption

**CURRENT:** a TrenchNote consumption says quantity left tracked stock. A
transfer to an installed pseudo-location says where it was staged as installed.
Neither is an acceptance record.

**PROPOSED:** LineCheck or LoopCheck may later reference the TrenchNote movement
that supplied material or equipment. The receiving application remains
authoritative for testing and acceptance; TrenchNote remains authoritative for
the logistics event.

### Service cutover

**CURRENT:** locally available LoopCheck code includes service connections,
notice, cutover phases, and restoration.

**PROPOSED:** LineCheck is the better long-term bounded-context owner because
service cutover is part of linear-infrastructure acceptance. No migration is
approved by this document. A dedicated overlap-and-migrations analysis is the
next documentation-baseline task.

## Areas that should not expand further

- `movements.po_number` must remain typed delivery reference text, not become a
  purchase-order entity or procurement join.
- `inspection_requirements.interval_days` must not grow assignments, approvals,
  notification schedules, or escalation state in core.
- `reservations` must remain a lightweight asset claim, not become a scheduler,
  dispatch system, or resource-loaded plan.
- `locations.job_code` must not turn TrenchNote into the system of record for
  projects, cost codes, or billing.
- `readings` must remain observed values, not calculate rates, invoices, or
  equipment charges.
- `assets.current_location` must remain a cache and must not displace the
  movement ledger.
- Receiving reports must remain evidence about what arrived, not compare
  receipts to an order model.
- Cross-product coordination must use explicit public contracts; do not add
  sibling database connections, shared tables, or in-process imports.

## Public and proprietary boundary

**DECIDED for TrenchNote:** the public AGPL repository contains every capability
required for field execution and the public API contract. An optional private
sidecar may provide commercial analysis or managed operations by authenticating
as an ordinary API client.

Public documentation may state:

- what core facts exist;
- what the public contract guarantees;
- what categories of optional sidecar capability are permitted; and
- that private code has no privileged database or runtime coupling.

Public documentation must not contain private pricing logic, customer-specific
configuration, operational credentials, proprietary report algorithms, private
roadmaps, or implementation details copied from a private repository. Those
belong only in the applicable private `*-lookahead` repository.

## Decision test for new features

Before adding a feature, answer in order:

1. Does it directly help identify, locate, receive, move, hold, inspect, or
   account for the custody of a physical subject?
2. Is it a field fact, rather than office analysis, scheduling, approval, or
   procurement?
3. Can the feature remain usable on a cheap phone with intermittent service?
4. Can it remain fully usable without a paid sidecar?
5. Does it preserve the append-only ledger and derived-state rules?
6. If it touches another product, can the boundary be expressed through a
   versioned export or API without shared persistence?

A “no” to questions 1–4 or 6 is a boundary warning, not an invitation to widen
TrenchNote quietly.

## Related documents

- [Current state](current-state.md)
- [Domain model](domain-model.md)
- [Invariants](invariants.md)
- [ADR 0011 — core/premium boundary](adr/0011-core-premium-extension-boundary.md)

The lifecycle map and overlap/migration analysis are planned and are not yet
authoritative.

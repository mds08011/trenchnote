# Proposed ecosystem contracts

**Status:** PROPOSED

**Authority:** Non-binding architecture draft

**Reviewed:** 2026-07-12

Nothing in this document is implemented by TrenchNote, promised by API contract
v1, or approved for production. These conceptual contracts exist to make open
questions concrete before any application code or migration is changed.

## Design constraints

Any future contract should:

- cross bounded contexts without sharing databases;
- identify the authoritative producer of every fact;
- use stable public IDs rather than assuming local PocketBase IDs match;
- retain human-readable codes without treating them as universal identity;
- preserve evidence provenance and timestamps;
- be versioned and replay-safe;
- tolerate unknown additive fields;
- avoid customer secrets and unnecessary personal data; and
- remain usable without an optional paid application.

Field names below illustrate semantics. They are not frozen JSON keys.

## Project reference

**PROPOSED purpose:** identify a project in its authoritative source while
carrying human context for reconciliation.

| Conceptual field | Meaning |
| --- | --- |
| `issuer` | Stable product/instance namespace that issued the project ID |
| `project_public_id` | Stable source-system project identifier |
| `project_code` | Optional human job/project code; label, not sole identity |
| `project_name` | Optional display value captured at handoff time |
| `source_url` | Optional operator-facing source record link |

Open issue: TrenchNote currently has no project entity. A location's `job_code`
may supply human context but cannot by itself satisfy this contract.

## Public identifier

**PROPOSED purpose:** reference a source object without coupling to a local
database record ID.

Conceptual form:

```text
issuer + object_type + public_id
```

Requirements:

- unique within the declared issuer/object namespace;
- never reassigned to another physical or executed object;
- stable across export/import and database restore;
- separate from mutable display labels; and
- printable only when field use justifies the physical-label commitment.

Current mapping candidate: `assets.tag_code` already provides a stable human
identifier within one TrenchNote instance. No equivalent exists for movements,
locations, readings, inspections, or projects.

## External reference

**PROPOSED purpose:** let a consuming application point to a source fact while
keeping local ownership clear.

| Conceptual field | Meaning |
| --- | --- |
| `source` | Producer/instance namespace |
| `object_type` | Source domain type such as asset or movement |
| `public_id` | Source public identifier |
| `contract_version` | Version under which the reference was interpreted |
| `source_url` | Optional human navigation link |
| `display_code` | Optional captured tag/job/code for reconciliation |

An external reference is not a foreign-key relation into another database and
does not permit the consumer to mutate the source.

## Evidence envelope

**PROPOSED purpose:** describe evidence consistently without claiming every
product must store files the same way.

| Conceptual field | Meaning |
| --- | --- |
| `evidence_public_id` | Stable source evidence identifier |
| `subject_ref` | Source fact or executed record the evidence supports |
| `kind` | Photo, packing slip, reading image, test file, signature image, or other controlled term |
| `captured_at` | When the evidence was observed/captured, if known |
| `entered_at` | When the authoritative system stored it |
| `captured_by` | Human text or actor reference with declared assurance level |
| `media_type` | Explicit media type |
| `size_bytes` | Optional size for transfer validation |
| `sha256` | Optional content hash; absent until hashing rules are accepted |
| `source_url` | Authorized retrieval location or reference |
| `provenance` | Original/copy/generated classification and source chain |

Open issues: authorization, retention, expiring file URLs, redaction, hashing,
and whether copied evidence is allowed or references are sufficient.

## Lifecycle event

**PROPOSED purpose:** announce that an authoritative domain fact occurred.

| Conceptual field | Meaning |
| --- | --- |
| `event_public_id` | Stable, replay-safe event identifier |
| `event_version` | Event schema version |
| `event_type` | Namespaced fact such as `logistics.material_consumed` |
| `producer` | Authoritative product and instance |
| `occurred_at` | Domain observation/execution time |
| `recorded_at` | Producer persistence time |
| `subject_ref` | Stable source subject/fact reference |
| `project_ref` | Optional source-scoped project reference |
| `evidence_refs` | Optional references, not embedded unrestricted files |
| `data` | Minimal event-specific facts |

Events are facts, not commands. Delivery of an event does not mean the consumer
accepted it, created work, or approved a lifecycle transition.

## Handoff manifest

**PROPOSED purpose:** transfer a bounded, reviewable package between products
without granting direct database access.

| Conceptual field | Meaning |
| --- | --- |
| `manifest_public_id` | Stable package ID used for idempotent re-import |
| `manifest_version` | Contract version |
| `producer` | Product/instance that assembled the handoff |
| `produced_at` | Assembly time |
| `handoff_type` | Specific bounded use case, not universal `WorkItem` |
| `project_ref` | Source project identity/context |
| `source_refs` | Authoritative records included or referenced |
| `evidence` | Evidence envelopes or authorized references |
| `summary` | Human-readable reconciliation data |
| `integrity` | Optional manifest hash and canonicalization version |

A manifest must not silently become the authoritative copy of its contents.
The consumer records import provenance and retains source references.

## Import provenance

**PROPOSED purpose:** make a consumer's local result traceable to a specific
source handoff.

| Conceptual field | Meaning |
| --- | --- |
| `import_public_id` | Consumer-generated import attempt ID |
| `manifest_ref` | Producer manifest ID/version |
| `source` | Producer identity |
| `received_at` | Time received by consumer |
| `imported_at` | Time local records were committed |
| `imported_by` | Actor/service account |
| `status` | Visible outcome such as complete, partial, rejected |
| `created_refs` | Local records produced by the import |
| `errors` | Operator-actionable rejected mappings without secrets |
| `payload_hash` | Optional original-payload integrity value |

Replaying the same accepted manifest should return or reconcile the existing
result rather than duplicate records.

## Example event names

These names are **PROPOSED examples**, not a registry:

- `logistics.asset_received`
- `logistics.asset_moved`
- `logistics.material_received`
- `logistics.material_consumed`
- `linear.test_completed`
- `linear.service_restored`
- `plant.checkout_completed`
- `plant.system_started`
- `turnover.package_issued`

The first real integration should define only the event or manifest it needs.
Do not approve this whole vocabulary preemptively.

## Versioning proposal

- A contract declares a major version.
- Additive optional fields are ignored safely by older consumers.
- Removed fields, required-field additions, identifier changes, enum semantic
  changes, and authority changes require a new major version.
- Producers retain enough old-version export capability for an agreed
  compatibility window.
- Example fixtures and contract tests travel with an accepted contract.
- Contract source should be published independently of private implementation
  code when more than one repository consumes it.

## Explicit exclusions

This draft does not propose:

- a universal work-item model;
- one shared workflow state machine;
- shared PocketBase collections or direct SQL access;
- central authentication;
- a monorepo or shared runtime library;
- guaranteed real-time delivery;
- remote commands that mutate another product; or
- copying proprietary pricing, scheduling, or customer operations into public
  payloads.

## Promotion path

Before any section becomes binding:

1. choose one real handoff and its authoritative producer/consumer;
2. resolve the relevant questions in [open-questions.md](open-questions.md);
3. validate payloads against fictional but realistic fixtures;
4. accept an ADR in each affected public repository;
5. publish a versioned contract and compatibility tests; and
6. update current-state documentation only after implementation ships.

## Related documents

- [Domain model](domain-model.md)
- [Invariants](invariants.md)
- [Lifecycle map](lifecycle-map.md)
- [Architecture status](architecture-status.md)

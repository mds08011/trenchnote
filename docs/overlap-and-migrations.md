# Product overlap and candidate migrations

**Authority:** Descriptive for observed overlap; proposed for every migration

**Reviewed:** 2026-07-12

No migration is approved or performed by this document. Sibling repositories
were inspected locally where available. Their active branches may change faster
than this repository, so each candidate requires a fresh source audit before
implementation.

## Summary

| Area | CURRENT location/semantics | Concern | PROPOSED disposition |
| --- | --- | --- | --- |
| Service cutover | Implemented in LoopCheck as service connections, notices, phase checks, cutover board, and restoration | Linear-infrastructure lifecycle lives inside plant checkout context | Move long-term ownership to LineCheck after LineCheck is production-capable; retain historical LoopCheck facts and compatibility export |
| Asset inspections | TrenchNote records recurring asset observations; LoopCheck records technical equipment checkout and compliance-oriented checks | Similar words can imply equivalent authority | Keep both, define names and handoff semantics; never auto-promote a TrenchNote inspection to commissioning acceptance |
| Installation/consumption | TrenchNote records stock consumption or installed pseudo-location; acceptance products record installation/test state | “Installed” can mean logistics exit or accepted installation | Preserve both facts with explicit source/meaning; no destructive merge |
| Physical/equipment identity | TrenchNote uses `tag_code`; LoopCheck uses equipment/P&ID tags; LineCheck defines its own IDs/contracts | Same physical thing may have multiple legitimate codes | Add namespaced external references after stable public-ID decision |
| Project identity | TrenchNote has location `job_code`; siblings have or propose projects | Human codes may collide or change | Define source-scoped project reference before imports |
| Evidence | Each product stores photos/files against its own events | Copying may lose source authority, timestamps, access rules, or integrity | Define evidence envelope and provenance before transfer |
| Signatures/turnover | Not in TrenchNote; active LoopCheck work is locally visible; LineCheck plans executed/locked records | Semantics may diverge before contracts settle | Keep ownership in acceptance products; align principles, not shared tables or premature shared code |
| Paid aggregation | TrenchNote accepts API-only private sidecar; sibling boundaries vary in maturity | Private logic can leak into public core or become required | Repeat explicit core/paid decision per product; exchange only public contracts |

## Service cutover assessment

### Current evidence

**CURRENT:** LoopCheck's committed public repository describes service-cutover
tracking as built. Its schema/UI includes service connections, customer-notice
evidence, phase-based checks, station ordering, optional meter-box labels, a
cutover board, and restoration status derived from check records.

**CURRENT:** LineCheck is pre-alpha. Its stated product direction covers linear
infrastructure testing and acceptance, but it does not yet provide a durable,
production-ready replacement for LoopCheck's cutover records.

### Boundary conclusion

**PROPOSED:** service cutover should eventually belong to LineCheck because it
is the operational transition from linear-infrastructure acceptance into
service and restoration. LoopCheck should focus on plant asset/system startup
and turnover.

This is not yet safe to execute. Moving code before LineCheck has equivalent
persistence, offline behavior, evidence retention, auth, export, and deployment
would replace working field capability with an architectural diagram.

### Migration prerequisites

1. Maintainer accepts the ownership decision in proposed ADRs for both products.
2. LineCheck implements a production-capable service-connection aggregate and
   field workflow with explicit units, evidence, offline behavior, and auth.
3. Stable project, service, event, and evidence identifiers are defined.
4. A versioned LoopCheck export includes every source record and append-only
   check/evidence reference required to reconstruct history.
5. LineCheck records import provenance, supports idempotent re-import, and
   exposes reconciliation errors.
6. Reports compare source and destination counts, statuses, timestamps, and
   evidence availability.
7. A compatibility window lets existing LoopCheck URLs/QR labels resolve or
   direct operators without losing historical access.
8. Backups and rollback are tested before any production cutover.

### Data preservation requirements

- Preserve original LoopCheck IDs and public/human service identifiers.
- Preserve both observation/execution time and original system-entry time.
- Preserve every check result, prompt snapshot, notice/evidence attachment,
  actor text, and current source URL where policy allows.
- Preserve source contract/schema version and import payload integrity.
- Do not rewrite historical records merely to fit LineCheck naming.
- Keep original LoopCheck data read-only through the retention/validation
  period; do not delete it after first import success.
- Record mapping decisions and rejected/ambiguous rows visibly.

### Principal risks

- customer/address data may require stricter access controls than ordinary
  equipment records;
- QR labels and bookmarked URLs may point to LoopCheck for years;
- derived phase semantics may not match LineCheck's acceptance sequence;
- duplicate imports may create conflicting service histories;
- attachments may be inaccessible after source retirement;
- migration can be mistaken for approval or acceptance of the underlying work;
  and
- active sibling development may change the source schema during planning.

## Inspection overlap

**CURRENT semantic difference:**

- TrenchNote requirement/inspection: “this tracked physical asset owes a
  recurring observation; show whether attention is needed.”
- LoopCheck check/checkout: “this plant equipment or system completed a
  technical checkout step required for readiness/turnover.”
- LineCheck test/acceptance record: “this linear segment or service completed a
  defined acceptance sequence.”

**PROPOSED:** keep separate records and use explicit event names. A downstream
consumer may show that a source observation exists, but it must state the source
and must not treat it as its own pass/acceptance without local rules and human
review.

## Duplicate concepts with incompatible semantics

| Term | TrenchNote meaning | Neighbor meaning/risk | Required clarification |
| --- | --- | --- | --- |
| `asset` / equipment tag | Physical logistics unit identified by `tag_code` | Plant P&ID equipment tag may represent functional equipment, not the same inventory record | Namespace and relationship type (`same_physical`, `installed_component`, `supplied_for`) |
| inspection/check/test | Visibility observation | Technical execution or contractual acceptance | Controlled event type and authority statement |
| installed | Quantity left stock or was moved to an installed location | Installation completed/verified/accepted | Separate logistics, execution, and acceptance facts |
| project/job | Optional location `job_code` | First-class project/contract context | Source-scoped stable project reference |
| complete/current/ready | Derived from different ledgers and rules | Same display word can hide incompatible calculations | Product-qualified status and derivation version |
| evidence | File attached to a source record | Snapshot/report/signature with different retention/access | Evidence kind, source, provenance, and integrity policy |

## Recommended migration order

Every step below is **PROPOSED**:

1. Stabilize and test each source product independently.
2. Decide source-scoped public and project identifiers.
3. Define one narrow service-cutover export fixture from LoopCheck.
4. Implement LineCheck import provenance and dry-run reconciliation.
5. Validate fictional data, then a scrubbed production-shaped sample.
6. Run dual-read comparison while LoopCheck remains authoritative.
7. Perform an operator-approved cutover with rollback and URL/QR compatibility.
8. Freeze LoopCheck cutover writes only after LineCheck is proven.
9. Retain source history according to an explicit policy; remove code only in a
   later, separately reviewed change.

TrenchNote requires no schema or runtime change for this migration. It may later
provide source logistics references through a separate, versioned handoff.

## What must not happen

- Do not connect LineCheck directly to LoopCheck or TrenchNote SQLite files.
- Do not copy active tables into a universal database.
- Do not rename or delete source records during documentation work.
- Do not use a shared `WorkItem` to erase domain differences.
- Do not put proprietary scheduling, pricing, customer operations, or private
  report logic in this public migration document.
- Do not claim migration completion until source counts, evidence, provenance,
  URLs, rollback, and operator acceptance have been verified.

## Related documents

- [Product boundary](product-boundary.md)
- [Lifecycle map](lifecycle-map.md)
- [Proposed ecosystem contracts](ecosystem-contracts.md)
- [Open questions](open-questions.md)

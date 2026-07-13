# Architecture status

**Authority:** Descriptive for current/decided topics; proposed for unresolved
direction

**Reviewed:** 2026-07-12

This table prevents architectural intent from being mistaken for shipped
behavior. “Risk if changed now” describes the compatibility or field risk, not
an argument that every current detail must remain forever.

| Topic | Status | Current implementation | Intended direction | Risk if changed now | Needed decision |
| --- | --- | --- | --- | --- | --- |
| Frontend stack | **CURRENT / DECIDED** | Static HTML/CSS, inline page logic, vendored Alpine.js/QR libraries, no build step | Retain the small static-first field client | High: payload, offline reliability, maintainer workflow, and self-hosting ethos | None unless field evidence justifies revisiting locked stack |
| Backend and persistence | **CURRENT / DECIDED** | One PocketBase process with embedded SQLite; schema in migrations | Retain one authoritative PocketBase database per TrenchNote instance | High: deployment, backup, API, and migration contract | None for TrenchNote; family-wide separate-database rule still needs a proposed/accepted ADR |
| Public identifier strategy | **CURRENT partial / PROPOSED** | Permanent unique asset `tag_code`; optional non-unique `item_code`; local PocketBase IDs elsewhere | Stable namespaced public IDs distinct from local DB IDs for cross-product references | High for printed labels and future handoffs | Scope, syntax, issuing authority, permanence, and migration for existing records |
| Project identity | **UNKNOWN / PROPOSED** | No project entity; optional `locations.job_code` | Explicit source-scoped project reference in handoffs | Medium now, high before integrations | Whether TrenchNote needs a project mapping or only transmits location/job context |
| Offline storage | **CURRENT / DECIDED** | Cache Storage for shell/API reads; IndexedDB queue for selected writes | Preserve visible staleness and local queue without framework/runtime growth | High: field reliability and data-loss risk | Browser/storage limits and future queue migration policy only when evidence requires |
| Synchronization | **CURRENT / DECIDED** | FIFO replay to one server, pre-generated IDs, arrival-order truth, and atomic manifest batches; no multi-master | Keep one writable instance; use export/import handoffs rather than instance sync | Very high: distributed conflict and ledger-order semantics | Define cross-product handoff replay/idempotency separately from device sync |
| Append-only facts | **CURRENT / DECIDED** | Movements, readings, inspections, condition reports, and condition resolutions are create-only for authenticated users; superusers can administrate | Retain append-only client behavior; add explicit correction links only if needed | High: dispute evidence and historical trust | Whether stronger server/admin controls or correction/supersession fields are warranted |
| Derived status | **CURRENT / DECIDED** | Stock, current job, latest reading, inspection standing, unresolved damage, and manifest in-transit standing are derived; asset location is cached | Keep stored state only where humans must decide it, as with reservations and manifest confirmation | High: drift and conflicting truth | Define per-product derivations in their own contracts, not a universal status model |
| Signature capture | **NOT IMPLEMENTED / PROPOSED elsewhere** | None in TrenchNote | Sign only frozen executed/acceptance records in the owning acceptance product | Low for TrenchNote, high if implied in exports | Signature meaning, identity, consent, scope, and correction/void model in owning repo |
| Record locking | **NOT IMPLEMENTED / PROPOSED elsewhere** | No frozen or locked TrenchNote record | Executed/signed records should become immutable snapshots with traceable replacement | Low until signatures/acceptance exist | Which record types lock, who locks, and how void-and-replace works |
| Evidence hashing | **NOT IMPLEMENTED / PROPOSED** | Files rely on PocketBase storage and ledger association; no hashes or canonical envelope | Hash only where verification value justifies canonicalization/versioning cost | Medium before cross-product evidence copies | Algorithm, canonical form, file-vs-envelope hash, retention, and verification UX |
| PDF generation | **CURRENT browser print / UNKNOWN production renderer** | Receiving report and labels print from browser; no server-generated PDF | Basic field exports remain core; advanced compilation may be optional paid work | Medium: byte consistency, Pi resource use, and public/paid boundary | Which products need deterministic core PDFs and what constitutes source evidence |
| API versioning | **CURRENT / DECIDED** | PocketBase REST contract v1 through migration `1783468824`; additive changes do not bump | Preserve documented compatibility; breaking semantics require ADR and new version | High for sidecars and integrations | Contract artifact/distribution mechanism when multiple products consume it |
| Cross-product handoffs | **NOT IMPLEMENTED / PROPOSED** | Internal site-to-site transfer manifests exist; no cross-product manifest, lifecycle event, provenance, or import record | Versioned exports/events with stable references; no direct DB coupling | Low now, high before first integration | First concrete cross-product handoff, minimum fields, transport, replay, and error ownership |
| Separate bounded contexts | **CURRENT as separate repos / PROPOSED as family rule** | Products are separate repositories/databases with overlapping concepts | Keep separate authorities; integrate through versioned contracts | High if centralized prematurely | Accept a family ADR before first production integration |
| Paid/core boundary | **CURRENT / DECIDED for TrenchNote** | AGPL core is standalone; private sidecar uses ordinary REST access | Field execution, retention, backup, and basic export stay public; paid side remains optional | High: trust, licensing boundary, and self-hostability | Apply equivalent explicit boundary decisions in each sibling product |
| Service-cutover ownership | **CURRENT overlap / PROPOSED migration** | Implemented in LoopCheck; LineCheck is pre-alpha | LineCheck should eventually own linear service cutover and restoration | High if moved before LineCheck persistence/export maturity | Scope, migration mapping, compatibility window, and owner approval |
| Deployment topology | **DECIDED; deployment partially current** | One live VPS; repository configs support Caddy and optional Pi replica; live app is behind `main` | One writable instance, tested backup/restore, optional replica/staging | High: data loss, printed URLs, and downtime | Confirm actual replica/restore status and update the live instance safely |
| Authentication | **CURRENT / DECIDED** | PocketBase users, shared field accounts, personal manager accounts, no public signup | Keep local auth until concrete cross-product requirements justify change | High: offline behavior and field friction | Service-account least privilege and future federation only when an integration exists |
| Units | **CURRENT partial / PROPOSED** | Reading type is explicit; bulk quantity has no unit field | Handoff values should carry explicit unit and semantic quantity basis | Medium before cross-product quantity exchange | Whether unit belongs on item, movement, or handoff only; migration for existing quantities |
| Import provenance | **NOT IMPLEMENTED / PROPOSED** | No import jobs or source-reference records | Preserve source, version, IDs, times, and idempotency for every cross-product import | Low now, high before imports | Storage shape, retention, re-import behavior, and operator-visible errors |

## Stabilization priorities

1. Keep the current collection semantics and API v1 stable while the public
   deployment catches up to `main`.
2. Add repeatable migration/API/offline verification before broad schema work.
3. Decide public/project identity before the first cross-product handoff.
4. Select one narrow handoff and validate it end to end before accepting a
   generic event vocabulary.
5. Resolve service-cutover ownership only after LineCheck can retain and export
   the migrated facts without LoopCheck database access.

## Related documents

- [Current state](current-state.md)
- [Invariants](invariants.md)
- [Proposed ecosystem contracts](ecosystem-contracts.md)
- [Open questions](open-questions.md)

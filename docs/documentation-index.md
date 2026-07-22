# TrenchNote documentation index

**Authority:** Descriptive index

**Reviewed:** 2026-07-12

This page maps the repository's documentation and states what kind of claim
each document is allowed to make.

## Authority levels

| Level | Meaning |
| --- | --- |
| **Normative** | Governs implementation, operations, public compatibility, or contribution behavior |
| **Descriptive** | Records confirmed behavior; code and migrations win if they disagree |
| **Proposed** | Candidate direction requiring review; not current functionality or a compatibility promise |
| **Historical** | Records why a decision was made at a point in time, including amendments and superseded clauses |
| **Generated** | Derived output that should not be treated as the source for manual edits |

An accepted ADR is normative for the decision it records and historical for
its context. A proposed ADR is proposed only.

## Start here

| Document | Authority | Purpose |
| --- | --- | --- |
| [`README.md`](../README.md) | Descriptive | Product overview, quickstart, current features, and documentation links |
| [`USER_GUIDE.md`](../USER_GUIDE.md) | Descriptive | Plain-language field workflow |
| [`docs/current-state.md`](current-state.md) | Descriptive | Confirmed implementation, deployment, tests, and limitations at a dated repository snapshot |
| [`docs/product-boundary.md`](product-boundary.md) | Normative/Proposed | Current TrenchNote scope plus explicitly proposed family boundaries |
| [`docs/open-questions.md`](open-questions.md) | Proposed | Decision backlog and latest safe decision points |

## Architecture and domain

| Document | Authority | Purpose |
| --- | --- | --- |
| [`docs/DEVELOPER_GUIDE.md`](DEVELOPER_GUIDE.md) | Descriptive | Implementation patterns, collections, offline queue, hooks, and development workflow |
| [`docs/API.md`](API.md) | Normative | Public PocketBase REST contract v1 and compatibility promise |
| [`docs/domain-model.md`](domain-model.md) | Descriptive/Proposed | Current entities and clearly separated proposed ecosystem concepts |
| [`docs/invariants.md`](invariants.md) | Normative/Proposed | Confirmed rules that protect current behavior and desired future cross-product rules |
| [`docs/architecture-status.md`](architecture-status.md) | Descriptive/Proposed | Decision status, implementation, change risk, and unresolved decisions by topic |
| [`docs/lifecycle-map.md`](lifecycle-map.md) | Descriptive/Proposed | Product-family lifecycle, ownership, overlap, and handoff points |
| [`docs/ecosystem-contracts.md`](ecosystem-contracts.md) | Proposed | Non-binding draft vocabulary for future public identifiers, evidence, events, and handoffs |
| [`docs/overlap-and-migrations.md`](overlap-and-migrations.md) | Descriptive/Proposed | Current cross-product overlap and possible migrations; performs no migration |

## Operations and deployment

| Document | Authority | Purpose |
| --- | --- | --- |
| [`docs/DEPLOY.md`](DEPLOY.md) | Normative operations guide | LAN/VPS deployment, SMTP, backup, replica, and restore procedures |
| [`deploy/README.md`](../deploy/README.md) | Normative operations guide | Ordered VPS installation checklist using committed configuration templates |
| [`deploy/UPDATE.md`](../deploy/UPDATE.md) | Normative operations guide | Backup, update, verification, and rollback sequence for a live instance |
| [`docs/RUNBOOK.md`](RUNBOOK.md) | Normative operations guide | Restarts, logs, restore, credential rotation, and PocketBase upgrades |
| [`docs/inspection-seeds.md`](inspection-seeds.md) | Descriptive examples | Non-authoritative inspection requirement starters; local safety program remains authoritative |

## Project governance and planning

| Document | Authority | Purpose |
| --- | --- | --- |
| [`CLAUDE.md`](../CLAUDE.md) | Normative contributor guidance | Product ethos, locked stack, domain model, non-goals, and docs-as-code rule |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Normative/Proposed | Contribution rules; CLA-versus-DCO choice remains undecided |
| [`ROADMAP.md`](../ROADMAP.md) | Proposed | Parked future ideas, not a promise of current functionality |
| [`LICENSE`](../LICENSE) | Normative legal text | GNU Affero General Public License v3 |

`AGENTS.md` was untracked at the reviewed snapshot and is therefore not listed
as committed repository documentation. If it becomes committed, it should be
classified as normative contributor guidance and kept consistent with
`CLAUDE.md`.

## Architecture decision records

All ADRs live in [`docs/adr/`](adr/). Their status line controls their
authority. At the reviewed snapshot every committed ADR below is accepted.

| ADR | Decision |
| --- | --- |
| [0001](adr/0001-single-binary-backend-static-vendored-frontend.md) | Single PocketBase binary and static vendored frontend |
| [0002](adr/0002-append-only-ledger-derived-state.md) | Append-only movement ledger and derived location/stock; amended by ADR 0005 |
| [0003](adr/0003-boring-ops-no-containers.md) | systemd/Caddy operations without containers |
| [0004](adr/0004-auth-shared-field-account.md) | Auth-required access with shared field accounts; amended by ADR 0008 |
| [0005](adr/0005-consumption-movements-without-destination.md) | Bulk consumption as a from-only movement |
| [0006](adr/0006-deployment-topology-vps-primary-pi-replica.md) | One writable VPS and optional Pi replica/staging target |
| [0007](adr/0007-reservation-lifecycle-stored-status.md) | Human-managed stored reservation lifecycle |
| [0008](adr/0008-offline-first-pwa.md) | Stamped caches, idempotent queue, and arrival-order truth |
| [0009](adr/0009-in-app-scanner-lazy-fallback.md) | Native scanner first and lazy local decoder fallback |
| [0010](adr/0010-qr-url-and-tag-code-format.md) | Long-lived QR URL and human-readable tag-code format |
| [0011](adr/0011-core-premium-extension-boundary.md) | Paid sidecar communicates through the same public REST API |
| [0012](adr/0012-timecard-data-capture.md) | Job codes, meter readings, custodianship, and move notices |
| [0013](adr/0013-receiving-log.md) | Receiving evidence belongs on delivery movements; no procurement model |
| [0014](adr/0014-certs-inspections-ledger.md) | Asset inspection ledger and derived visibility, not safety workflow |
| [0015](adr/0015-rental-dates-in-core.md) | Rental dates in core; commercial rates outside core |
| [0016](adr/0016-reading-observation-date.md) | Meter observation date distinct from system-entry time |
| [0018](adr/0018-item-code.md) | Optional catalog/reference code on items |
| [0019](adr/0019-damage-condition-reports.md) | Append-only photographed condition evidence and derived damage standing |
| [0020](adr/0020-transfer-manifests.md) | Manifest-derived transit and atomic two-sided transfer confirmation |
| [0021](adr/0021-gang-boxes-and-kitting.md) | One-level gang-box containment, derived member location, and audited contents |

ADR 0017 was considered and deferred inside ADR 0018; no standalone accepted
ADR 0017 exists.

## Public project site

| Artifact | Authority | Purpose |
| --- | --- | --- |
| [`docs/index.html`](index.html) | Descriptive | Hand-authored public landing page served at `trenchnote.com` |
| `docs/img/*` | Descriptive | Screenshots used by the public landing page and repository docs |
| [`docs/CNAME`](CNAME) | Normative deployment configuration | GitHub Pages custom domain |
| `docs/.nojekyll` | Normative deployment configuration | Serve the static documentation site without Jekyll processing |

## Documentation maintenance rules

1. Current behavior belongs in `current-state.md`; do not put proposed family
   architecture there.
2. Public compatibility promises belong in `API.md` and require the versioning
   discipline stated there.
3. Significant accepted structural choices require an ADR. Unapproved choices
   must use `Status: Proposed`.
4. Proprietary implementation details, pricing logic, customer operations, and
   private sidecar runbooks do not belong in this public repository. Public
   documents may describe only the boundary and the public contract.
5. Roadmap statements must remain visibly proposed and must not be copied into
   the README as shipped functionality.
6. A `pb_public/` documentation-navigation edit is still a runtime shell change
   and requires a service-worker `VERSION` bump. Markdown-only changes do not.

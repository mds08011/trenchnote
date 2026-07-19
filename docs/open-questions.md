# Architecture decision backlog

**Status:** PROPOSED

**Authority:** Decision backlog; no entry is an accepted decision

**Reviewed:** 2026-07-12

The recommendation in each entry is a working position, not approval. “Latest
safe decision point” means the last point before implementation would create
avoidable migration or compatibility cost.

## 1. What is the stable public identifier format?

| Field | Detail |
| --- | --- |
| Why it matters | Cross-product references cannot safely assume local PocketBase IDs are portable or that human codes are globally unique. |
| Options | Namespaced opaque IDs; namespaced human IDs; issuer/object/local-ID tuple; per-object strategies. |
| Current evidence | TrenchNote `tag_code` is stable and unique for assets; `item_code` is optional/non-unique; other records expose only local IDs. |
| Recommendation | Define an issuer + object type + stable public ID tuple. Preserve `tag_code` as the asset display/field identifier rather than forcing one universal string format. |
| Validate | Restore/import behavior, collision rules, printed-label implications, offline ID generation, and sibling ID models. |
| Decision owner | Maintainer with affected product owners. |
| Latest safe decision point | Before the first production cross-product handoff or external reference is stored. |

## 2. How are projects referenced across products?

| Field | Detail |
| --- | --- |
| Why it matters | TrenchNote has locations and job codes, while acceptance products use project contexts. A human job code alone can collide or change. |
| Options | Add a TrenchNote project entity; map locations to an external project reference; carry only source location/job context; maintain mapping in the consumer. |
| Current evidence | No TrenchNote project collection exists. `locations.job_code` is optional accounting text. |
| Recommendation | Do not add a project collection yet. Define a source-scoped project reference in the first handoff and validate whether a location-to-project mapping is sufficient. |
| Validate | Real divisions with one job across multiple locations, shared yards, job-code reuse, and cross-product project models. |
| Decision owner | Maintainer and field operations owner. |
| Latest safe decision point | Before importing TrenchNote facts into a project-scoped sibling record. |

## 3. Which first handoff justifies a contract?

| Field | Detail |
| --- | --- |
| Why it matters | Designing every lifecycle event at once risks a generic framework without a field need. |
| Options | Material-consumed reference; asset-delivered reference; service-cutover migration; acceptance-to-turnover package. |
| Current evidence | No handoff exists. Service cutover has the clearest current overlap but also the highest migration risk. |
| Recommendation | Start with a read-only, narrow fictional manifest that references one logistics event without creating remote workflow. Keep service-cutover migration as a separate project. |
| Validate | A real operator question the handoff answers, required evidence, failure behavior, and whether a plain export is enough. |
| Decision owner | Maintainer and intended integration consumer. |
| Latest safe decision point | Before publishing a generic event library or adding cross-product fields. |

## 4. Should service cutover move from LoopCheck to LineCheck?

| Field | Detail |
| --- | --- |
| Why it matters | Service cutover is linear acceptance/restoration, but working capability currently exists in LoopCheck. |
| Options | Keep in LoopCheck; migrate fully to LineCheck; maintain a compatibility/read-only facade; split planning from execution. |
| Current evidence | LoopCheck implements the field workflow. LineCheck is pre-alpha and not yet a safe destination. |
| Recommendation | Accept LineCheck as the intended future owner only after a joint ADR; do not migrate until parity, export, provenance, offline, auth, and rollback are proven. |
| Validate | Complete LoopCheck schema/UI audit, customer-data controls, LineCheck acceptance sequence, QR/URL longevity, and real field usage. |
| Decision owner | Maintainer acting as owner of both bounded contexts. |
| Latest safe decision point | Before expanding LoopCheck cutover further or designing LineCheck's service model irreversibly. |

## 5. How strong must append-only and correction guarantees become?

| Field | Detail |
| --- | --- |
| Why it matters | Current client rules prevent edits, but superusers can administrate records and no correction link identifies which fact is replaced. |
| Options | Keep operational convention; add `corrects`/`supersedes`; add admin audit hooks; implement frozen snapshots; cryptographic verification. |
| Current evidence | Movements, readings, and inspections are create-only for users. No signatures, locks, correction links, or hashes exist. |
| Recommendation | Add explicit correction semantics only when real dispute/reconciliation needs are understood. Do not claim absolute immutability meanwhile. |
| Validate | Actual correction frequency, PocketBase superuser behavior, restore/admin workflows, reporting needs, and storage cost. |
| Decision owner | Maintainer with legal/operations input where records support disputes. |
| Latest safe decision point | Before signatures, executed-record exports, or external consumers rely on a stronger claim. |

## 6. What evidence integrity and transfer model is required?

| Field | Detail |
| --- | --- |
| Why it matters | File copies can lose source linkage, authorization, metadata, or integrity. Hashing without canonical rules can create false confidence. |
| Options | Source URLs only; copy plus provenance; content hashes; signed/frozen evidence manifests. |
| Current evidence | TrenchNote files are PocketBase attachments on source records; no hashes or envelope exist. |
| Recommendation | Begin with source references and explicit original/copy provenance. Add SHA-256 only with a defined verification workflow and retention policy. |
| Validate | Offline access, expiring/protected URLs, backup/restore, redaction, file replacement behavior, and owner requirements. |
| Decision owner | Maintainer with records/security owner. |
| Latest safe decision point | Before the first handoff copies evidence or a report claims verifiable integrity. |

## 7. Where should explicit units live for bulk quantities?

| Field | Detail |
| --- | --- |
| Why it matters | `quantity=20` is ambiguous outside the local item's human description. Cross-product calculations must not guess units. |
| Options | Unit on item; unit copied onto every movement; unit only in export/handoff; quantity object with unit and basis. |
| Current evidence | Bulk quantity is a positive integer with no unit field. Readings do carry `hours`/`odometer`. |
| Recommendation | Validate field inventory conventions before a schema change. At minimum, any future handoff must state an explicit unit/basis even if sourced from reviewed mapping. |
| Validate | Pieces, feet, pallets, assemblies, mixed packaging, fractional quantities, and existing data assumptions. |
| Decision owner | Maintainer and field inventory users. |
| Latest safe decision point | Before exporting bulk quantity into another application's calculation or acceptance record. |

## 8. How should accepted contracts be distributed?

| Field | Detail |
| --- | --- |
| Why it matters | Copying TypeScript/JSON definitions between repos causes drift; a shared runtime package may violate independence and stack constraints. |
| Options | Versioned JSON Schema repository; release attachments; generated fixtures; language-specific packages; documentation plus contract tests. |
| Current evidence | TrenchNote API v1 is Markdown over PocketBase REST. LineCheck has TypeScript contract definitions. No family contract artifact exists. |
| Recommendation | Publish language-neutral schemas and fictional fixtures only after one contract is accepted. Keep runtime clients local to each repo. |
| Validate | No-build TrenchNote consumption, release process, compatibility tests, private consumer access, and offline self-hosting. |
| Decision owner | Maintainer/technical owner across affected repositories. |
| Latest safe decision point | Before a second repository independently implements the same payload. |

## 9. Is shared or federated authentication actually required?

| Field | Detail |
| --- | --- |
| Why it matters | Central auth adds operational dependency and offline failure modes, but separate logins may burden users. |
| Options | Keep local accounts; service accounts for integrations; optional OIDC per product; central mandatory identity. |
| Current evidence | TrenchNote uses local PocketBase accounts and ordinary service-account API access. No cross-product runtime login exists. |
| Recommendation | Keep local auth and per-integration service accounts. Consider optional federation only after a concrete multi-product deployment proves the need. |
| Validate | Device sharing, revocation, offline sessions, least privilege, self-hosting, and NGO/small-contractor operations. |
| Decision owner | Maintainer and deployment/security owner. |
| Latest safe decision point | Before a cross-product UI or managed service requires interactive single sign-on. |

## 10. What is the deployment stabilization gate?

| Field | Detail |
| --- | --- |
| Why it matters | Public production is behind repository `main`, and no automated regression suite protects the catch-up migration. |
| Options | Manual runbook only; scripted API/migration smoke gate; browser automation; staged release/versioning process. |
| Current evidence | Live service is healthy at service-worker `v6`; repository is `v15`; current receiving/inspection features are absent live. Preflight and live-verify scripts exist. |
| Recommendation | Add a repeatable migration/API/offline smoke checklist before the live catch-up. Introduce heavier automation only where repeated failures justify it. |
| Validate | Backup off-box, restore rehearsal, schema migration on a data copy, page titles, auth, offline replay, files, and rollback. |
| Decision owner | Maintainer/deployment operator. |
| Latest safe decision point | Before applying current migrations to the live ledger. |

## 11. What belongs in public versus private documentation?

| Field | Detail |
| --- | --- |
| Why it matters | The public core needs a trustworthy boundary without disclosing proprietary implementation or making private operations normative for self-hosters. |
| Options | Duplicate all docs; keep only private docs; public contract plus separate private implementation docs. |
| Current evidence | ADR 0011 defines the API-only sidecar boundary. TrenchNote is public AGPL; `bindery-trenchnote` is private. |
| Recommendation | Public repo owns core behavior, public contracts, compatibility, and boundary statements. Private repo owns pricing, customer operations, proprietary algorithms, private deployment, and private roadmap; link only through public versioned contracts. |
| Validate | Each new document for credentials, customer data, commercial logic, or public compatibility obligations. |
| Decision owner | Maintainer/product owner. |
| Latest safe decision point | At document creation, before proprietary detail enters public Git history. |

## Decision order

Recommended order, all still **PROPOSED**:

1. Stabilize deployment and verification.
2. Choose the first narrow handoff.
3. Decide public and project identity for that handoff.
4. Decide evidence/provenance and explicit-unit needs.
5. Publish the smallest versioned contract with fixtures.
6. Reassess service-cutover migration against a more mature LineCheck.
7. Consider stronger locking, hashing, federation, or shared tooling only when a
   proven requirement remains.

## Related documents

- [Architecture status](architecture-status.md)
- [Proposed ecosystem contracts](ecosystem-contracts.md)
- [Overlap and migrations](overlap-and-migrations.md)
- [Current state](current-state.md)

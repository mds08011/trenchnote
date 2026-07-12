# TrenchNote current state

**Authority:** Descriptive

**Repository snapshot:** `main` at `4325f70`

**Reviewed:** 2026-07-12

This document records behavior confirmed in this repository. It does not
describe the broader product family except where an implemented integration
already exists. Status words have the following meanings throughout the
architecture documentation:

- **CURRENT** — directly confirmed in committed code or configuration.
- **DECIDED** — an accepted direction, whether or not fully deployed.
- **PROPOSED** — a candidate that still requires review.
- **DEPRECATED** — behavior intended for removal or migration.
- **UNKNOWN** — the repository does not contain enough evidence.

## Product today

**CURRENT:** TrenchNote is a self-hostable field-logistics ledger for physical
equipment and bulk materials. It answers what a thing is, where it is, and who
moved it. It also records supporting field facts that belong at that same scan
point: reservations, meter readings, receiving evidence, and asset inspection
observations.

The application is usable as a standalone system. No paid service or sibling
application is required for field execution, data retention, or the exports
that exist today.

## Current stack

| Layer | CURRENT implementation | Repository evidence |
| --- | --- | --- |
| Application server | PocketBase `0.39.6` is the locally installed and documented tested version | `pocketbase.exe`; `docs/API.md` |
| Persistence | PocketBase collections backed by one embedded SQLite database | `pb_migrations/` |
| Server extension | One PocketBase JavaScript hook for best-effort off-site email | `pb_hooks/main.pb.js` |
| Frontend | Static HTML/CSS with inline page logic and Alpine.js | `pb_public/*.html` |
| Offline storage | Cache Storage for shell/API reads; IndexedDB for queued writes | `pb_public/sw.js`; `pb_public/tn-sync.js` |
| QR support | Native phone camera URLs, browser `BarcodeDetector`, and lazy local `jsQR` fallback | `pb_public/scan.html` |
| Runtime dependencies | Alpine.js and QR libraries vendored locally; no runtime CDN | `pb_public/vendor/` |
| Build process | None; committed files in `pb_public/` are served directly | `docs/DEVELOPER_GUIDE.md` |

`scripts/setup.sh` can download PocketBase for a supported OS and architecture.
Its default is the latest upstream release; operators who need the documented
tested version must set `PB_VERSION=0.39.6`.

## Current entry points

| Page | CURRENT purpose |
| --- | --- |
| `pb_public/index.html` | Authenticated dashboard: assets by location, bulk totals, reservations, inspection attention list, recent movements, and inspection CSV export |
| `pb_public/asset.html?code={tag_code}` | QR landing page for one asset: identity, location, movement history, reservations, readings, inspections, and moves |
| `pb_public/material.html?id={item_id}` | Bulk stock by location, delivery/transfer/consume entry, and delivery evidence |
| `pb_public/receiving.html` | Print-friendly receiving report filtered by material or typed PO reference |
| `pb_public/labels.html` | Printable asset QR labels with a caller-selected base URL |
| `pb_public/scan.html` | Single QR scan and location walk/audit mode |
| `pb_public/login.html` | PocketBase password authentication and local token storage |
| `/_/` | PocketBase superuser administration UI |
| `/api/collections/*` | PocketBase REST API; the documented public contract is `docs/API.md` |

PocketBase serves the frontend and API from the same origin. Frontend code uses
`window.location.origin`; only a printed QR label embeds a deployment address.

## Current collections

The complete schema is reproducible from the ordered migrations in
`pb_migrations/`. There are eight application collections.

| Collection | CURRENT purpose | Authority and mutability |
| --- | --- | --- |
| `items` | Catalog entry describing a kind of unique or bulk thing | Mutable catalog data; authenticated create/update; superuser-only delete |
| `locations` | Jobsite, yard, warehouse, or transit location | Mutable reference data; authenticated create/update; superuser-only delete |
| `assets` | One physical instance of a uniquely tracked item | Mutable master data and location cache; authenticated create/update; superuser-only delete |
| `movements` | Asset moves and bulk receipts, transfers, or consumptions | Authoritative ledger; create-only for authenticated users; superusers retain administrative access |
| `reservations` | Human claim on an asset with open/fulfilled/cancelled lifecycle | Mutable workflow record; closed records remain stored |
| `readings` | Meter or odometer observation for one asset | Authoritative ledger; create-only for authenticated users; superusers retain administrative access |
| `inspection_requirements` | Recurring obligation attached to one asset | Mutable catalog-like data; authenticated create/update; superuser-only delete |
| `inspections` | Pass, fail, or removed-from-service observation | Authoritative ledger; create-only for authenticated users; superusers retain administrative access |

The server enforces the asset-versus-bulk movement shape and requires an
inspection requirement, when supplied, to belong to the inspected asset.

## Authoritative facts and derived state

**CURRENT authoritative facts:**

- A `movements` record is the authoritative statement that an asset or bulk
  quantity moved. Corrections are additional movement records.
- A `readings` record is the authoritative meter observation. Its `read_at`
  is the observation date when supplied; `created` remains entry time.
- An `inspections` record is the authoritative inspection observation.
  `inspected_at` is client-set so offline and back-entered records retain the
  field date; `created` records when the server received it.
- Receiving photos, packing slips, vendor text, and OS&D notes are evidence on
  the receive-shaped movement itself, not a separate delivery record.

**CURRENT derived or cached answers:**

- `assets.current_location` is a convenience cache. Clients write the
  movement first and patch the cache second.
- Bulk stock per location is movements in minus movements out.
- Dashboard bulk total is external receipts minus consumptions.
- Current job is the current location's `job_code`.
- Latest meter reading is selected by observation date, then entry time.
- Inspection status and next-due date are derived by `pb_public/tn-inspect.js`.
- Reservation status is not derived; a person explicitly fulfills or cancels
  the claim.

No executed-record signature, frozen snapshot, evidence hash, correction link,
or general record-locking mechanism exists in TrenchNote today.

## Current user workflows

**CURRENT:**

1. An administrator creates users, locations, items, assets, and optional
   inspection requirements in PocketBase or through the authenticated API.
2. A manager prints asset labels. Each QR contains
   `{baseUrl}/asset.html?code={tag_code}` and prints the tag code underneath.
3. A field user signs in once on a phone, scans a label, reviews last-known
   identity/location/status, and records a move.
4. A location walk scans successive labels, compares their cached location to
   the selected physical location, and offers a correcting movement.
5. A user opens a bulk item to receive, transfer, or consume a quantity.
   Delivery mode optionally captures vendor, typed PO reference, packing slip,
   OS&D note, and supporting photos.
6. A user can reserve an asset and later fulfill or cancel the reservation.
7. Metered assets can receive hour/odometer observations with an optional
   gauge photo.
8. Assets with inspection requirements display a derived attention badge and
   accept inspection observations. The module records visibility; it does not
   assign, approve, escalate, or certify a safety program.

## Current offline behavior

**CURRENT:** `pb_public/sw.js` precaches the application shell under an explicit
`VERSION`. Shell requests are cache-first. API GET requests are network-first
and fall back to responses stamped with `X-TN-Cached-At`; the UI displays the
staleness rather than presenting cached data as live.

`pb_public/tn-sync.js` queues the following writes in IndexedDB when a network
request fails:

- movements, including an optional follow-up asset-location cache patch;
- meter readings and their optional photo;
- inspections and their optional photo; and
- delivery movements with packing-slip and damage-photo blobs.

Each queued ledger record carries a pre-generated PocketBase ID so replay is
idempotent. Replay is FIFO and pauses visibly on authentication or validation
failure. Reservations and inspection-requirement edits are not queued for
offline replay.

Offline operation is not multi-instance synchronization. The device queues
writes for one authoritative PocketBase instance.

## Current exports and integrations

**CURRENT exports:**

- client-generated CSV of the inspection ledger;
- browser-printable receiving reports, including evidence images;
- browser-printable QR label sheets; and
- authenticated reads through PocketBase REST API contract v1.

PocketBase realtime subscriptions are part of the documented API surface, but
the core UI does not use them as an ecosystem event bus. There is no versioned
handoff manifest, project export, lifecycle-event envelope, or import
provenance record.

**CURRENT external side effect:** after a committed movement transfers
something between two different locations, `pb_hooks/main.pb.js` attempts to
email the origin location's `notify_email`. Missing SMTP or mail failure is
logged and never rolls back the movement.

## Current authentication and authorization

**CURRENT:** all application collection reads and writes require an
authenticated PocketBase user. Public self-registration is disabled. The
operating model is a shared field account per crew/device context and personal
accounts for managers; accounts are created by a superuser.

`pb_public/tn-auth.js` stores the token in local storage, attaches it to API
requests, and calls `auth-refresh` on page load. This refresh is also the
expiry check because PocketBase may return an empty `200` list to a guest
instead of `401`.

The movement, reading, and inspection collections are append-only for normal
authenticated clients. PocketBase superusers are outside collection API rules,
so current immutability is an operational and client-level guarantee, not a
cryptographic or absolute database guarantee.

## Current deployment topology and status

**DECIDED reference topology:** one writable PocketBase instance on a VPS,
bound to localhost and exposed through Caddy HTTPS. An optional trailer/office
Pi receives Litestream replication of SQLite plus a separate file copy of
uploaded storage. The Pi is a replica and staging target, never a writable peer.
LAN-only and fully standalone installations are also supported.

Repository configuration for that topology lives in `deploy/`; operator
instructions live in `docs/DEPLOY.md`, `deploy/README.md`, and
`docs/RUNBOOK.md`.

**CURRENT public deployment, verified 2026-07-12:**

- `https://trenchnote.com` serves the public project site.
- `https://app.trenchnote.com/api/health` reports a healthy PocketBase API.
- The deployed service worker is `v6`, while this repository is `v15`.
- The deployed application does not yet expose the current receiving page or
  inspections collection; `deploy/UPDATE.md` already records that the live box
  is behind `main`.

**UNKNOWN:** the repository cannot confirm whether the optional Pi replica,
offsite backup destination, SMTP delivery, or restore drill is currently
operational. Runbooks describe how they should work, not proof that a specific
deployment completed them.

## Current tests and verification

**CURRENT:** there is no automated unit, browser, migration, or CI test suite.
`scripts/seed_demo.sh` exercises ordinary authenticated API writes and is used
as a manual contract smoke test. `deploy/preflight.sh` validates a throwaway
PocketBase startup and collection availability, while
`deploy/verify-live.sh` performs read-only checks against a deployment.

Frontend verification is manual: exercise pages in a browser, test offline by
warming caches and stopping PocketBase, and verify queued writes after restart.

## Known limitations and active instability

- **CURRENT:** repository `main` and the public deployment are not at the same
  version.
- **CURRENT:** no automated regression gate protects migrations, derived
  calculations, offline replay, internal documentation links, or browser flows.
- **CURRENT:** API list calls commonly cap at 500 records. The inspection CSV
  export paginates; several dashboard and detail views do not.
- **CURRENT:** the QR base URL is embedded when labels are printed. Native
  camera scans require labels to be reprinted after a host change; the in-app
  scanner can accept a TrenchNote URL from an older origin.
- **CURRENT:** the two-step movement-then-cache update can leave
  `assets.current_location` stale if the second write fails. The ledger remains
  authoritative.
- **CURRENT:** offline ordering is server arrival order. Concurrent crews may
  produce an honest movement history containing stale assumptions.
- **CURRENT:** synchronous SMTP can delay a notified request when mail settings
  point to an unreachable server, although mail failure cannot undo the write.
- **UNKNOWN:** formal maturity and release criteria have not been declared.
- **UNKNOWN:** there is no committed mapping from TrenchNote locations/job codes
  to project identities in sibling products.

## Related documents

- [Product boundary](product-boundary.md)
- [Domain model](domain-model.md)
- [Invariants](invariants.md)
- [Public API contract](API.md)
- [Developer guide](DEVELOPER_GUIDE.md)
- [Documentation index](documentation-index.md)

Architecture-status and ecosystem documents are the next planned
documentation-baseline task and are not yet authoritative.

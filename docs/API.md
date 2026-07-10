# TrenchNote — Public API Contract (v1)

This document is the **boundary** decided in
[ADR 0011](adr/0011-core-premium-extension-boundary.md): the interface that
premium features, integrations, and any third-party tool may build on —
all with exactly the same access. If it isn't described here, it isn't
contract, and building on it is at your own risk.

TrenchNote's API **is** [PocketBase's standard REST
API](https://pocketbase.io/docs/api-records/) — the core adds collections
and rules, not custom endpoints. Everything below is reachable at the same
origin that serves the pages (e.g. `http://192.168.1.50:8090`).

## Contract collections

These six collections — their fields, semantics, and the operations marked
allowed — are stable. A breaking change to any of them requires a new ADR
and a version bump of this contract, announced in the release notes.

| Collection | Read (list/view) | Create | Update | Delete |
|---|---|---|---|---|
| `items` | ✔ contract | ✔ | ✔ | admin-only |
| `locations` | ✔ contract | ✔ | ✔ | admin-only |
| `assets` | ✔ contract | ✔ | ✔ (see cache rule) | admin-only |
| `movements` | ✔ contract | ✔ (see shape rule) | **never** | **never** |
| `reservations` | ✔ contract | ✔ (open only) | ✔ (lifecycle) | admin-only |
| `readings` | ✔ contract | ✔ | **never** | **never** |

Field-level shapes are defined by the migrations in `pb_migrations/` and
explained in the [developer guide](DEVELOPER_GUIDE.md#data-model).
Highlights that are load-bearing for API clients:

- **`movements` is an append-only ledger** (ADR 0002). No client — premium,
  third-party, or future core code — can ever update or delete a movement.
  Corrections are new records.
- **The movement shape rule** (enforced server-side; malformed records are
  rejected no matter who sends them). A movement is exactly one of:
  - **Asset move:** `asset` set, `item` empty, `quantity = 0`,
    `to_location` **required** — a physical machine always lands somewhere.
  - **Bulk move:** `asset` empty, `item` set, `quantity > 0`, and at least
    one of `from_location`/`to_location` set. Which are set determines the
    meaning (ADR 0005): *receive* = `to` only; *transfer* = both;
    *consume* = `from` only (installed / used up — leaves stock without
    landing anywhere, record stays in the ledger forever).
- **`assets.current_location` is a cache, not truth.** Clients that log an
  asset move must write the movement record *first*, then PATCH the cache —
  in that order, always.
- **Bulk stock is derived, never stored.** Compute stock-on-hand per
  location by summing bulk movements (in minus out; consumes subtract and
  add nowhere). There is no stock column, and there never will be
  (ADR 0002).
- **Reservation lifecycle** (ADR 0007): `status` is one of
  `open | fulfilled | cancelled`, stored, not derived. **Empty status means
  open** — records created before the status field exist and are read as
  open everywhere; clients must treat `""` and `"open"` identically. The
  create rule rejects reservations born `fulfilled` or `cancelled`. `note`
  is free text. Fulfilled/cancelled claims remain in the database as demand
  history.
- **`tag_code` is permanent** once printed on a label (ADR 0010): unique,
  never recycled onto different gear. QR labels encode
  `{Base URL}/asset.html?code={tag_code}`.
- **`readings` is an append-only ledger** (ADR 0012), same rules as
  movements: no updates, no deletes, corrections are new records. A
  reading is `asset` + `value` + `reading_type` (`hours` | `odometer`) +
  optional `recorded_by` (free text) and `photo` (the gauge); the
  timestamp is `created`. **Latest reading is derived** (newest record per
  asset — there is no latest-reading column on assets), and a value lower
  than its predecessor is legal data (replaced meter or typo) that
  consumers should flag, not drop.
- **Billing facts on locations (ADR 0012):** `job_code` is the accounting
  job number equipment time at that location is billed to; an asset's
  "current job" is derived as its current location's `job_code` and is
  deliberately stored nowhere. `notify_email`, when set, makes the core
  email that address whenever a movement with a destination leaves the
  location — best-effort via the instance's SMTP settings, server-side.
  API clients get no delivery feedback and must not depend on it; a mail
  failure never fails the movement create.
- **`items.meter`** (`hours` | `odometer`, empty = no meter) drives
  whether the UI offers a reading at scan time; `assets.assigned_to` is
  free-text custodianship. Both optional, both plain facts with no
  side effects.

## Other contract surface

- **Query features:** PocketBase's `filter`, `sort`, `expand` (including
  nested expands like `asset.item`), and pagination (`page`, `perPage`,
  max 500 per page) on the collections above.
- **File URLs:** `/api/files/{collection}/{recordId}/{filename}` — e.g. an
  item's photo at `/api/files/items/{id}/{photo}`.
- **Realtime:** PocketBase's SSE subscriptions ("server-sent events" — a
  one-way stream the server pushes changes over) at `/api/realtime`, for
  the contract collections, authenticated like everything else. Prefer this
  over tight polling loops; the server may be a Raspberry Pi whose first
  job is serving field scans.

## Not contract

The internal SQLite file layout and `pb_data/` contents, the PocketBase
admin UI and admin-only endpoints, PocketBase system collections, and any
endpoint or behavior not listed here. These can change without notice.

## Authentication

**Every operation above requires a signed-in user** (ADR 0004, migration
`1783468806`). Anonymous access returns nothing; public self-signup is
disabled, so accounts are created by the admin in the PocketBase UI.

- API clients authenticate as a **service account**: an ordinary PocketBase
  user record with its own credentials and only the permissions any
  authenticated client gets — never a superuser key. Give each integration
  its own account so access can be revoked independently of field phones.
- Obtain a token via PocketBase's standard
  `auth-with-password`, send it as the `Authorization` header, and renew it
  with `auth-refresh`.
- **Gotcha (contract-relevant):** PocketBase treats a missing or invalid
  token on reads as a *guest* and returns empty lists with HTTP **200**,
  not 401. Detect auth failure via `auth-refresh`, not response codes —
  otherwise an expired token is indistinguishable from an empty jobsite.

## Versioning

- This is **contract v1**. Additive changes (new optional fields, new
  collections) don't bump the version; breaking changes (renamed/removed
  fields, changed rules, changed URL patterns) require an ADR and bump this
  document's version, announced in release notes.
- Contract v1 as published here reflects the schema through migration
  `1783468810` (timecard data capture, ADR 0012 — an additive change:
  one new collection and four new optional fields).
- Core is currently developed and tested against **PocketBase 0.39.x**
  (pin with `PB_VERSION=0.39.6 ./scripts/setup.sh`). A PocketBase upgrade
  that changes REST behavior is treated as a breaking change and handled
  the same way.

# TrenchNote — Developer Guide

How the thing actually works. Read [the README](../README.md) first for what
TrenchNote is; read the [ADRs](adr/) for why it's built this way. This
document is the *how*.

## The moving parts

There are exactly two:

1. **PocketBase** — one Go binary (`pocketbase` / `pocketbase.exe`, downloaded
   by `scripts/setup.sh`, never committed). It provides the SQLite database,
   the REST API, the admin UI, and the static file server. There is no other
   backend process, no reverse proxy required for local use, no job queue.
2. **Static HTML pages in `pb_public/`** — PocketBase serves this folder at
   its own origin. Each page is self-contained: its own CSS, its own Alpine.js
   component in a `<script>` tag at the bottom. There is no build step; what
   you commit is byte-for-byte what the browser gets.

Because the pages are served by the same process that hosts the API, all
frontend code talks to `window.location.origin`. This is a hard convention:
it's why one file works on `127.0.0.1`, a LAN IP, and a real domain with zero
configuration.

```
trenchnote/
├── pb_migrations/          # versioned schema — the ONLY source of the DB shape
├── pb_public/
│   ├── index.html          # dashboard: assets by location, materials, spoken-for, feed
│   ├── asset.html          # QR landing page: view, move, reserve one asset
│   ├── material.html       # bulk item: derived stock per location, move quantities
│   ├── labels.html         # printable QR sheet for all assets
│   ├── login.html          # sign-in; stores the PocketBase token in localStorage
│   ├── tn-auth.js          # shared auth helper — TN.fetch, TN.requireLogin
│   └── vendor/             # alpine.min.js, qrcode.min.js — committed on purpose
├── scripts/setup.sh        # downloads the right PocketBase binary
└── docs/                   # you are here
```

## Data model

Five collections, created by the migrations in `pb_migrations/` (one file per
collection, plus later alterations). PocketBase applies pending migrations
automatically at startup, in filename order — a fresh clone reproduces the
whole database on first `serve`.

### items — the catalog

What a thing *is* ("19' Scissor Lift"), never a specific one.
`tracking_mode` is the fork in the road:

- `unique` → each physical one becomes an **asset** with its own QR tag.
- `bulk` → there are no individual records; quantities move through the
  ledger (see below).

### locations

`name` + `type` (`jobsite` | `yard` | `warehouse` | `transit`). Optional
convention: if you want to track *where* material was installed (not just
that it was used), create a location like "Installed — Northside" and
transfer there instead of consuming (see ADR 0005).

### assets — a specific physical thing

Belongs to an item, carries `tag_code` (short, human-readable, **unique
index** — one label, one asset, enforced by SQLite). Rentals are not special:
`ownership=rented` plus `vendor`/`po_number`, nothing else changes.

`current_location` is a **cache**, not truth — see the ledger rules below.

### movements — the append-only ledger, the source of truth

One collection holds both kinds of moves, distinguished by which fields are
set:

| | `asset` | `item` | `quantity` |
|---|---|---|---|
| Asset move | set | empty | 0 |
| Bulk move | empty | set | > 0 |

For bulk moves, the locations then say *which kind* of move it is:

| | `from_location` | `to_location` | meaning |
|---|---|---|---|
| Receive | empty | set | delivery from outside |
| Transfer | set | set | between locations |
| Consume | set | empty | installed/used — leaves stock, stays in history |

Asset moves always require a `to_location` — a physical machine lands
somewhere. All of these shapes are enforced **server-side** by the
collection's `createRule` (migrations `1783468805`–`1783468807`), so no
client can write a malformed row. The timestamp is the `created` autodate
field.

`updateRule` and `deleteRule` are `null` (admin-only) **even in the
permissive Phase 1** — a ledger you can rewrite is not a ledger. Corrections
are new movement records.

### reservations

`asset`, `requested_by`, `needed_by`, `expected_release`. Soft claims — they
don't block moves; they surface as "spoken for" warnings on asset.html and
the dashboard so the person grabbing the thing knows someone is counting on
it.

## The two invariants

Everything else in the codebase follows from these:

1. **Write the movement first, then update the cache.** An asset move is two
   requests: `POST /api/collections/movements/records`, then `PATCH` the
   asset's `current_location`. In that order, always. If the PATCH fails you
   have a true ledger and a stale cache — visible and fixable. The other
   order can lose a move entirely. (See `move()` in `asset.html`.)

2. **Bulk stock is derived, never stored.** `material.html` computes
   stock-on-hand per location on every load by summing the ledger: quantity
   moved in minus quantity moved out, per location (a consume subtracts from
   its source and adds nowhere). There is no column to drift out of sync.
   The dashboard's "total on hand" uses the shortcut that falls out of the
   model: internal transfers net to zero, so an item's total equals its
   deliveries (no `from_location`) minus its consumptions (no
   `to_location`). Negative balances are rendered flagged, never hidden —
   they mean the ledger and the ground disagree, and the fix is a correcting
   movement.

## Frontend patterns

Each page is one Alpine component: an `x-data` factory function returning
state + methods, with `x-init="load()"` kicking off fetches. No shared JS
between pages — a few duplicated helpers are the accepted price of pages that
can be read top-to-bottom in isolation.

Patterns you'll see repeatedly (all commented in the source):

- **Filter + expand in one request:**
  `/api/collections/assets/records?filter=(tag_code='A001')&expand=item,current_location`
  pulls the asset and its related records in a single round-trip — matters on
  a bad connection. The dashboard uses a **nested expand** (`asset.item`) to
  resolve movement → asset → item in one request.
- **Parallel fetches:** `Promise.all` for independent reads (dashboard fires
  six at once).
- **`localStorage.tn_name`:** the mover's name, typed once per phone, prefilled
  everywhere a name is asked for.
- **Date handling:** reservation dates are stored date-only at UTC midnight.
  Always format them with `timeZone: 'UTC'`
  (`toLocaleDateString(undefined, { …, timeZone: 'UTC' })`) or western
  timezones display the previous day. This bug happened once already; don't
  reintroduce it.
- **perPage ceilings:** list fetches cap at PocketBase's max of 500. Fine for
  a division-sized deployment; pagination is the known upgrade path if a
  ledger outgrows it.

## Auth

Since migration `1783468806` (see ADR 0004), **every API rule requires a
signed-in user**. The model: crews share one field account signed in once
per phone; PMs get personal accounts; accounts are created in the admin UI
(collections → users) — public self-signup is disabled.

The frontend plumbing is deliberately small:

- **`login.html`** POSTs to `/api/collections/users/auth-with-password` and
  stores `{ token }` in localStorage (`tn_token`), then returns the user to
  the page they were headed for (`?next=`, restricted to same-site paths).
- **`tn-auth.js`** is shared by all pages — the one exception to
  "self-contained pages", because drifting auth code is how lockouts and
  holes happen. Pages call `TN.requireLogin()` at the top of their script
  and use `TN.fetch()` (attaches the `Authorization` header) instead of
  `fetch()`.
- **Expiry is caught by `auth-refresh`, not by status codes.** PocketBase
  treats a missing/invalid token on reads as a guest and returns **200 with
  empty lists**, not 401 — so you cannot detect a stale token from a list
  response. `TN.requireLogin()` fires a background `auth-refresh` on every
  page load: invalid → clear token, bounce to login; valid → store the
  **new** token it returns, sliding the session forward (a phone in regular
  use never logs out).

When testing rules by hand, remember the guest behavior: an
unauthenticated list "succeeding" with `totalItems: 0` is the lockdown
*working*, not broken. Writes fail loudly (400/403).

## Working on the schema

- Never change collections in the admin UI on a real instance — the change
  would exist only in that instance's `pb_data/`. Write a migration.
- New migration = new file in `pb_migrations/` named
  `{unix_timestamp}_{what_it_does}.js`, with an up and a down function. Look
  at `1783468805_bulk_movements.js` for the alteration pattern
  (`findCollectionByNameOrId` → mutate → `app.save`).
- PocketBase 0.23+ does **not** add `created`/`updated` automatically; they
  are explicit `autodate` fields in every collection migration. Forget them
  and the ledger has no timestamps.
- The `TODO(auth)` lockdown happened in migration `1783468806`. New
  collections must ship with auth-required rules from day one
  (`@request.auth.id != ""`), never `""`.

## Local development

```sh
./scripts/setup.sh    # once — downloads the binary
./pocketbase serve    # http://127.0.0.1:8090, migrations auto-apply
```

Admin UI at `/_/` (create the superuser on first visit, or
`./pocketbase superuser upsert EMAIL PASS`). To reset to a blank database,
stop the server and delete `pb_data/` — the migrations rebuild the schema on
next start. To test from a phone, serve on `--http=0.0.0.0:8090` and use the
laptop's LAN IP.

Running it on a real box (trailer Pi, VPS), plus backups and restore, is
covered in [DEPLOY.md](DEPLOY.md).

The pages have no test suite; the verification workflow is exercising the
API with `curl` (create → move → check the ledger) and the pages in a
browser. Keep it that way until there's a reason not to — the whole frontend
is ~45 KB of readable source.

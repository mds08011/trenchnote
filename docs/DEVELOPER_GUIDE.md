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

`name` + `type` (`jobsite` | `yard` | `warehouse` | `transit`). Convention,
not schema: material that gets installed/consumed is moved to a location you
create for that purpose (e.g. "Installed — Northside"), so the ledger never
has an exit door.

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

The either/or shape is enforced **server-side** by the collection's
`createRule` (see `pb_migrations/1783468805_bulk_movements.js`), so no client
can write a malformed row. `from_location` empty means "entered from outside
the system" (a delivery, a new rental). `to_location` is always required.
The timestamp is the `created` autodate field.

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
   moved in minus quantity moved out, per location. There is no column to
   drift out of sync. The dashboard's "total on hand" uses a shortcut that
   falls out of the model: since `to_location` is required, nothing ever
   leaves the system, so an item's total in circulation equals the sum of its
   deliveries (movements with no `from_location`).

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
- Every permissive API rule carries a `TODO(auth)` comment — the pre-internet
  lockdown changes each `""` rule to require `@request.auth.id != ""`. Keep
  that discipline in new migrations.

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

The pages have no test suite; the verification workflow is exercising the
API with `curl` (create → move → check the ledger) and the pages in a
browser. Keep it that way until there's a reason not to — the whole frontend
is ~45 KB of readable source.

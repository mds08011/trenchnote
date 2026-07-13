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
├── pb_hooks/
│   └── main.pb.js          # server hooks: the off-site move email (ADR 0012)
├── pb_public/
│   ├── index.html          # dashboard: assets by location, materials, spoken-for, feed
│   ├── asset.html          # QR landing page: view, move, reserve one asset
│   ├── material.html       # bulk item: derived stock per location, move quantities
│   ├── receiving.html      # print-friendly receiving report (ADR 0013)
│   ├── manifests.html      # build a transfer manifest (list or scanner)
│   ├── manifest.html       # print, dispatch, and receive one manifest
│   ├── labels.html         # printable QR sheet for all assets
│   ├── scan.html           # in-app QR scanner + inventory walk mode
│   ├── login.html          # sign-in; stores the PocketBase token in localStorage
│   ├── tn-auth.js          # shared auth helper — TN.fetch, TN.requireLogin
│   ├── tn-sync.js          # offline write queue (IndexedDB), sync badge, stale banner
│   ├── tn-inspect.js       # derived inspection badge — one verdict, two pages (ADR 0014)
│   ├── sw.js               # service worker: shell cache-first, API network-first
│   ├── manifest.json       # PWA manifest (+ icon-192/512.png)
│   └── vendor/             # alpine.min.js, qrcode.min.js — committed on purpose
├── scripts/setup.sh        # downloads the right PocketBase binary
└── docs/                   # you are here
```

## Data model

Fourteen collections, created by the migrations in `pb_migrations/` (one file
per collection, plus later alterations). PocketBase applies pending migrations
automatically at startup, in filename order — a fresh clone reproduces the
whole database on first `serve`.

### items — the catalog

What a thing *is* ("19' Scissor Lift"), never a specific one.
`tracking_mode` is the fork in the road:

- `unique` → each physical one becomes an **asset** with its own QR tag.
- `bulk` → there are no individual records; quantities move through the
  ledger (see below).

`meter` (`hours` | `odometer`, empty = none — ADR 0012) says whether this
*kind* of thing has a gauge. It lives on the catalog because every 19'
scissor lift has an hour meter — flag it once and the asset page knows to
offer a reading field, and what to call it.

`item_code` (text, optional, non-unique — ADR 0018) is the office's
catalog/reference number for a kind of thing (a bulk item's "Misc-66"),
distinct from an asset's unique `tag_code`. Most useful for bulk items,
which otherwise carry no code anywhere; shown on material.html.

### locations

`name` + `type` (`jobsite` | `yard` | `warehouse` | `transit`). Optional
convention: if you want to track *where* material was installed (not just
that it was used), create a location like "Installed — Northside" and
transfer there instead of consuming (see ADR 0005).

Two optional office-facing fields (ADR 0012): `job_code`, the accounting
job number equipment time at this location is billed to (text — job number
formats vary), and `notify_email`, the PM/super to notify when equipment
leaves this location. An asset's "current job" is **derived** — its
current location's `job_code` — never stored anywhere.

### assets — a specific physical thing

Belongs to an item, carries `tag_code` (short, human-readable, **unique
index** — one label, one asset, enforced by SQLite). Rentals are not special:
`ownership=rented` plus `vendor`/`po_number`, nothing else changes.

`current_location` is a **cache**, not truth — see the ledger rules below.

`assigned_to` (text, optional — ADR 0012) is custodianship: trucks and
vehicles belong to a person even though they rarely trade between jobs the
way shared tools do. Free text like `moved_by` — crews don't have accounts.

`on_rent_date` / `off_rent_date` (date, optional — ADR 0015) are empty on
owned gear. Dates are a non-commercial fact about the asset, so they live
in core; the *rate* does not (that's premium data). Stored date-only at
UTC midnight like the reservations dates — format with `timeZone: 'UTC'`.
asset.html shows an off-rent countdown (amber within a week, red once
overdue) on rented assets; the dates are set office-side in the admin UI,
like `vendor`/`po_number`.

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

**Receiving-log fields (ADR 0013):** five optional fields carry dispute
evidence on deliveries — `vendor_name`, `po_number` (free text a human
types; TrenchNote never knows what was *ordered*, only what arrived),
`packing_slip` (one photo), `osd_note` (over/short/damaged, in words),
and `photos` (up to 8 damage close-ups). The UI offers them only in
material.html's "New delivery" mode, but the `createRule` deliberately
does not forbid them on other shapes: an empty optional field hurts
nothing, and a tighter rule could reject offline-queued moves replayed
from phones running older code. Because the ledger is append-only, the
slip photo's `created` timestamp is evidence-grade. `receiving.html`
renders these per item or per PO as the print-friendly report a PM
attaches to a vendor dispute email.

### reservations

`asset`, `requested_by`, `needed_by`, `expected_release`, `note`, `status`
(`open` | `fulfilled` | `cancelled` — **empty means open**, because rows
predating the status field have no value; read status with "not
fulfilled/cancelled", never "=== open"). Soft claims — they don't block
moves; they surface as "spoken for" warnings on asset.html and the
dashboard so the person grabbing the thing knows someone is counting on it.

Lifecycle (ADR 0007): humans close claims, the app never guesses. After a
move, asset.html offers one-tap "mark fulfilled" per open claim; each
banner has a confirm-guarded cancel. The `createRule` forbids creating a
claim pre-closed; the `updateRule` lets any signed-in user close any claim.
An open claim past its `expected_release` is flagged red on both pages —
stale claims are unresolved questions and are never hidden. Closed claims
drop out of the UI but stay in the database.

### readings — the second append-only ledger (ADR 0012)

Hour-meter / odometer readings, one record per glance at the gauge:
`asset` (relation), `value`, `reading_type` (`hours` | `odometer` — copied
from `items.meter` at capture time so each record is self-contained),
`recorded_by` (free text), `photo` (the gauge, optional), and `read_at`
(ADR 0016 — the observation date, date-only UTC midnight, optional). The
`created` autodate still records system-entry time; `read_at` is stamped
at *capture* (asset.html sets today) so a reading taken offline carries
its real read-day through the sync queue, not the sync-day. Same idea as
inspections' `inspected_at`.

Same mutability rules as movements — `updateRule`/`deleteRule` are `null`,
corrections are new readings — because these numbers end up on equipment
invoices and the history is what settles a dispute. Two derived answers,
never stored: **latest reading** = newest record per asset **ordered by
`read_at`** (fallback `created`; the fetch sorts `-read_at,-created`), and
the **lower-than-previous flag** = a reading smaller than its predecessor
in that same order (meter replaced, or a typo — flagged in the UI at
render time by comparing neighbors, accepted either way).

### inspection_requirements + inspections — compliance (ADR 0014)

`inspection_requirements` is catalog-like: what a specific asset owes and
how often (`name`, `interval_days`, free-text `reference`). Managers
update it as the safety program changes; delete is admin-only so an
obligation can't be fat-thumbed away from under its history.

`inspections` is the **third append-only ledger**: `result`
(`pass` | `fail` | `removed_from_service`), `inspected_by`, `note`,
optional `photo`, and a **client-set `inspected_at`** (date-only UTC
midnight) — compliance math keys on the day the eyes were on the thing,
so an offline Friday inspection syncing Monday still reads Friday, and
back-entered paper records keep their true dates (`created` still shows
when the row entered the system — a big gap between the two is visible
evidence of back-entry, not hidden). The createRule enforces the
integrity shape server-side: ad-hoc (`requirement` empty) or a
requirement **on the same asset** (`requirement.asset = asset`).

Everything shown about compliance — next-due dates, overdue, the
RED/YELLOW/GREEN badge — is **derived at render time** by
`pb_public/tn-inspect.js`, the second shared-file exception after
tn-auth.js (asset page and dashboard must give the same do-not-use
verdict; see the file header for the exact rules). No status column
exists. Requirement starters live in
[inspection-seeds.md](inspection-seeds.md) — examples, not advice.

### condition_reports + condition_resolutions — photo evidence (ADR 0019)

`condition_reports` is an append-only observation ledger: `asset`,
`report_type` (`damage` | `wear` | `condition_note`), required
`description`, one **required** image `photo`, and required free-text
`reported_by`. `condition_resolutions` is a second append-only outcome ledger:
`report`, `resolution` (`repaired` | `accepted_as_is` | `disposed` |
`returned_to_vendor`), optional `note`, and required free-text `resolved_by`.
Both use server-set `created` as their timestamp and reject update/delete for
ordinary authenticated clients.

The derived rule is a set difference, not a column on `assets`: select damage
reports for an asset, subtract every report id referenced by any resolution,
and show **DAMAGED** when anything remains. Wear and `condition_note` records
are evidence only. Multiple resolutions are legal because two offline phones
may both record a true outcome; any one closes the report for badge purposes,
and all remain in the history.

The required-photo rule is enforced by the collection schema. This module's
purpose is dispute evidence, so a text-only report is incomplete. It does not
grow repair work orders, maintenance schedules, labor/parts/cost tracking, or
return-to-service approval; report and resolve are the entire lifecycle.

### manifests + manifest_lines — two-sided transfers (ADR 0020)

`manifests` stores the route and human handshake:
`from_location`, `to_location`, `created_by` (the signed-in PocketBase account),
free-text `driver_name`, `status`, and optional `received_by`. The server API
rule is the workflow boundary: only
`draft → in_transit → received | received_with_discrepancies` is allowed.
Route, driver, and creator cannot change during a transition; receipt must set
`received_by` to the account making that request.

`manifest_lines` uses the movement union. An asset line sets `asset`, keeps
`item` empty, has `quantity = 0`, and sends one whole unit. A bulk line sets
`item`, keeps `asset` empty, and has positive equal `quantity` and
`sent_quantity`. The shape and sent fact freeze at dispatch. While the parent
is in transit, a receiver may set only `received_quantity` and
`condition_note`. PocketBase number fields have a zero empty value; the parent
status distinguishes pending zero from a confirmed zero.

Dispatch writes no movement. `asset.html` and `material.html` derive their
“in transit on Manifest #…” overlays by filtering lines whose parent status is
`in_transit`; the ordinary asset cache and bulk ledger sum still show the
source until receipt. This avoids a synthetic transit location and leaves every
existing stock reader unchanged.

Receipt is one JSON `POST /api/batch` transaction, ordered line update →
movement → asset cache patch → final manifest status. A received bulk portion
moves source-to-destination; its shortfall moves source-to the fixed
`Missing in transfer` location (`tnmissingxfer01`). A missing unique asset moves
there as a whole record. The source therefore loses the full sent quantity,
the destination gains only what was confirmed, and total inventory remains
honest. Finding the shortfall later is an ordinary movement out of that holding
location.

The migration enables PocketBase's built-in batch API at 250 requests and a
10-second timeout. A Gang Box (ADR 0021) is a top-level asset, so it rides as
one existing asset line; its contained children are not repeated. Migration
`1783468822` rejects a contained child as a manifest line, preventing the box
and its contents from being moved twice.

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
- **Mutate list items through the reactive array, never through the raw
  object you pushed.** Alpine wraps arrays in proxies; writes to the raw
  reference are invisible and the DOM silently stops updating. Push, then
  re-find the item (`this.rows.find(...)`) before mutating — scan.html's
  `addRow` shows the pattern and the comment.
- **The scanner decodes via `BarcodeDetector` where real** (check
  `getSupportedFormats()` includes `qr_code`) **and lazily injects
  `vendor/jsQR.min.js` otherwise** (iOS Safari). Keep the fallback out of
  the SW precache and out of script tags — the whole point is that
  Chrome/Android never fetch it (ADR 0009).

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

## Offline (ADR 0008)

Two files, no dependencies, no build step:

- **`sw.js`** — shell cache-first (versioned; **bump `VERSION` whenever
  anything in pb_public/ changes**, or phones keep the old shell), API GETs
  network-first with a cache fallback stamped `X-TN-Cached-At`. `TN.fetch`
  sees that stamp and shows the "showing saved data from…" banner — cached
  data never poses as live. Note the two match options and why:
  `ignoreSearch` (scanned `?code=` URLs must hit the cached page) and
  `ignoreVary` (the auth token rotates, `Vary: Authorization` would defeat
  the cache).
- **`tn-sync.js`** — the offline write queue. Moves made offline land in
  IndexedDB (raw, ~40 lines, no wrapper lib) and replay FIFO on page load /
  `online` / badge tap. Every movement body carries a **pre-generated
  PocketBase id** (`TNSync.genId()` at build-the-body time, online or off),
  so replaying an already-committed record fails `validation_not_unique`
  and is treated as success — the queue is idempotent. Sync preflights an
  `auth-refresh` because PocketBase answers dead tokens AND validation
  problems with 400 on creates; auth must be checked separately. Failures
  park visibly (red badge, human-tap discard); nothing is silently dropped.

  The queue holds movements
  (entries with no `kind`, the original shape — old pending entries keep
  working), `kind: 'reading'` meter readings, `kind: 'inspection'`
  (whose client-set `inspected_at` survives the outage). Readings and
  inspections replay as **multipart** form data because the photo rides
  along — IndexedDB stores the `File` as a Blob natively, no base64
  games. Same pre-generated-id idempotency, same FIFO order.

  Movement entries can also carry a `files` payload (ADR 0013): a
  delivery logged offline queues its packing-slip photo and damage
  close-ups as Blobs (`TNSync.enqueue(movement, assetPatch, label,
  files)`), and the replay switches to multipart when files are present —
  JSON otherwise, so pre-0013 pending entries replay byte-identically.
  In the multipart build, `null` fields are *skipped*, never appended:
  FormData stringifies `null` into the literal text `"null"`.

  Transfer manifests add `kind: 'batch'` (ADR 0020). The semantic request
  array and a local render snapshot are written to IndexedDB **before** the
  first network attempt, then replayed through PocketBase's transactional
  `/api/batch`. Every created movement still has a pre-generated id. If the
  response disappears after commit, replay checks the parent manifest's
  expected terminal status; because the server transaction is all-or-nothing,
  that status proves every request already landed. The snapshot lets
  `manifest.html` honestly render an unsynced draft/receipt from this phone.

  Two hard-won rules for anything new that touches this queue:
  everything stored must be **plain data** — Alpine wraps component
  state (arrays especially) in reactive Proxies, and IndexedDB's
  structured clone rejects a Proxy with `DataCloneError`, losing the
  queued record (enqueue defensively rebuilds; keep it that way). And
  the service worker **precaches with `cache: 'reload'`** — without it,
  the browser's HTTP cache can feed a *stale* copy of a page into a
  brand-new shell cache right after a deploy, and phones keep old code
  despite the VERSION bump.

Conflict stance in one line: the ledger's order is arrival order, the
cache converges to the latest entry, bulk sums converge under any
interleaving, and a from/to mismatch in the history is the honest record
of two crews acting on stale views. Details and rejected alternatives in
ADR 0008.

Testing offline locally: sign in, load the pages once (warms the caches),
then kill PocketBase and reload — the app must still open and render, with
the stale banner up. Queue a move, restart PocketBase, tap the badge.

## Server hooks: the off-site move email (ADR 0012)

`pb_hooks/main.pb.js` is TrenchNote's first server-side hook, and it holds
to one discipline: **best-effort, never blocking**. It runs
`onRecordAfterCreateSuccess` on `movements` — the ledger write is already
committed before the hook fires — and everything inside is try/caught, so
the worst any mail problem can do is leave a log line.

The rule: a movement with a real destination (`to_location` set) leaving a
location whose `notify_email` is set → one plain-text email to that
address via **PocketBase's built-in mailer** (Admin UI → Settings → Mail
settings; setup walkthrough in [DEPLOY.md](DEPLOY.md)). Receives don't
notify (nothing left anywhere) and neither do consumes (material installed
*on* the site never left it). SMTP not configured → one `info` log line
per skipped notice; send failure → one `warn` line with the error. Both
are searchable in Admin UI → Logs under "TrenchNote notify".

Known tradeoff: the send is synchronous inside the request, so SMTP
settings pointing at a dead server make notified moves wait out the
connection attempt. That's documented for operators in DEPLOY.md; the
boring built-in mailer beats a queue nobody operates.

## The public API contract

TrenchNote is open-core: this AGPL repo is complete and self-sufficient,
and any paid tooling lives *outside* it, talking to PocketBase's REST API
like any other client would
([ADR 0011](adr/0011-core-premium-extension-boundary.md)). The practical
consequence for anyone working here: the fourteen collections' shapes and rules
are a published contract ([API.md](API.md)), so breaking changes to them
need an ADR and a contract version bump — not just a migration. Nothing in
this repo may ever reference, detect, or depend on premium code.

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
PB_VERSION=0.39.6 ./scripts/setup.sh  # once — tested contract version
./pocketbase serve    # http://127.0.0.1:8090, migrations auto-apply
```

Admin UI at `/_/` (create the superuser on first visit, or
`./pocketbase superuser upsert EMAIL PASS`). To reset to a blank database,
stop the server and delete `pb_data/` — the migrations rebuild the schema on
next start. To test from a phone, serve on `--http=0.0.0.0:8090` and use the
laptop's LAN IP.

Running it on a real box (trailer Pi, VPS), plus backups and restore, is
covered in [DEPLOY.md](DEPLOY.md).

### Seeding a demo instance

`scripts/seed_demo.sh` fills a local instance with realistic fake data —
6 locations, 29 assets (some rented), 10 bulk materials, ~80 movements in
all three bulk shapes, reservations in every lifecycle state, and
inspection requirements exercising all three badge colors (a failed
harness, an extinguisher due in 10 days, a current gas monitor —
possible because `inspected_at` is client-set, ADR 0014) — so sidecar
and premium development runs against the real API instead of mock JSON.
Deliveries also carry the receiving log (ADR 0013): every one has a
`vendor_name` and `po_number`, two carry over/short/damaged notes, and
two upload a real (placeholder) packing-slip photo via multipart — so
`receiving.html` renders with evidence, including a PO that spans two
items and a PO with two deliveries. The six rented assets carry
on/off-rent dates (ADR 0015): one past-due, one due within a week, one
open-ended with no return date — enough for `asset.html`'s off-rent
countdown to show its overdue, due-soon, and absent states. It writes
**only through the public
API contract** ([API.md](API.md)), authenticated as an ordinary user,
exactly as a sidecar would (ADR 0011) — which makes it a living contract
test: if the seed script breaks, the contract moved.

```sh
# once: create a user in the admin UI (collections -> users), then
TN_EMAIL=demo@example.com TN_PASSWORD=... ./scripts/seed_demo.sh
```

It aborts rather than duplicating if the sentinel location ("Millbrook
Staging Yard") already exists — reseed against a fresh `pb_data/`. Known
limitation, by design: the API cannot backdate `created`, so all seeded
movements are stamped "now"; history lives in the sequences and the
reservation dates.

The pages have no automated test suite; the current verification workflow is
exercising the API with `curl` (create → move → check the ledger), running the
deployment preflight/live checks, and exercising the pages and offline replay in
a browser. Keep the source readable and the field payload small; add automation
where repeated failures justify its maintenance cost.

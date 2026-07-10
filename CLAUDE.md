# CLAUDE.md — TrenchNote

Project context for Claude Code sessions. Read this first, every session.

## What TrenchNote is

A minimalist, low-bandwidth, self-hostable web app for tracking physical
equipment and materials across heavy civil and water/wastewater construction
job sites. Built by a project engineer at a water/wastewater general
contractor. Designed to run on low-bandwidth devices — old Androids, company
iPads — in dirt lots with poor cell reception. Offline-first as of ADR 0008:
the app shell and last-known data are cached (staleness always shown, never
hidden), and moves logged offline queue in IndexedDB and sync when signal
returns.

It is a **surgical field-logistics ledger** — not an ERP, not a Procore
replacement, not accounting software. It answers three questions well and
refuses to be anything else: *What is this thing? Where is it? Who moved it?*

### The problems it solves

The division running it has ~12 concurrent job sites and 6 project managers.

1. **Bartered internal tools.** Shared equipment (scaffold, scissor lifts, hand
   tools) gets traded between sites and grabbed unannounced. Nobody knows where
   things are or who has them next.
2. **The staging-yard black hole.** Materials sit in a yard or warehouse for
   12–18 months and go missing before startup and commissioning, causing delays
   and vendor disputes.
3. **Rented equipment.** Gear rented from vendors (United Rentals, Sunbelt) needs
   to be logged as physically on-site — without building vendor API integrations.

## Non-negotiable ethos

Weigh every design decision against these. If a change violates one, stop and
raise it rather than proceeding.

- **Runs on a cheap smartphone on a dirt lot with bad reception.** Pages measured
  in kilobytes. High contrast for direct sunlight. Tap targets sized for gloved
  hands. No megabyte JS payloads.
- **Static-first, no build step.** Plain HTML + CSS + Alpine.js. No React, no
  bundler, no npm build pipeline. The maintainer is strong in HTML/CSS and
  learning the backend as the project grows — favor boring, legible, commented
  code over cleverness.
- **Trivially self-hostable** by NGOs, small contractors, and people in
  developing nations. A $5 VPS or a Raspberry Pi in a job trailer must be enough.
- **No third-party app-store downloads.** QR check-in/out happens in the mobile
  browser. The QR code is just a URL that the native phone camera opens.

## Locked tech stack

Do not change these without explicit approval from the maintainer.

- **Backend: PocketBase** — single Go binary with embedded SQLite. Use its
  built-in auth, REST API, and admin UI. The binary is downloaded, not committed.
- **Frontend: vanilla HTML/CSS + Alpine.js**, served from `pb_public/`.
  **Vendor Alpine and any QR library locally into `pb_public/vendor/`.** Do not
  rely on a runtime CDN — self-hosters and bad-reception sites need it to work
  without external requests.
- **License: AGPLv3** — same choice as Vikunja. It closes the SaaS loophole
  (anyone offering TrenchNote over a network must publish their modifications)
  while leaving NGOs and self-hosters completely unaffected. Keep the maintainer
  as sole copyright holder (or use a CLA for outside contributors) so a paid
  managed-hosting tier remains possible later.

## Data model — 8 collections

Schema lives in `pb_migrations/` as versioned PocketBase JS migrations, NOT as
hand-built collections in the admin UI. A fresh self-hoster must be able to
reproduce the entire database from the repo.

- **`items`** — the catalog: what a thing *is*, not a specific one.
  `name`, `description`, `category`, `tracking_mode` (select: `unique` | `bulk`),
  `photo` (file), `meter` (select: `hours` | `odometer`, empty = no meter —
  a property of the kind of thing, so it's flagged once per catalog entry;
  drives the optional reading prompt on asset.html — ADR 0012).
- **`locations`** — `name`, `type` (select: `jobsite` | `yard` | `warehouse` |
  `transit`), plus two optional office-facing facts (ADR 0012): `job_code`
  (text — the accounting job number equipment time here is billed to; an
  asset's "current job" is DERIVED as its current location's job_code,
  never stored) and `notify_email` (the PM/super who is emailed by
  `pb_hooks/main.pb.js` the moment a movement with a destination leaves
  this site — best-effort via PocketBase's built-in mailer, silent
  log-line skip when SMTP isn't configured, never blocks the write).
- **`assets`** — a specific physical instance of a unique item.
  `item` (relation→items), `tag_code` (text, **unique index**), `serial_number`,
  `ownership` (select: `owned` | `rented`), `vendor`, `po_number`,
  `current_location` (relation→locations), `assigned_to` (text, optional —
  custodianship for trucks/vehicles that belong to a person; free text
  like `moved_by`, ADR 0012).
- **`movements`** — the append-only ledger and **source of truth**. One
  collection holds both kinds of moves, distinguished by which fields are set:
  - *Asset move:* `asset` (relation→assets) set; `item` empty, `quantity` 0;
    `to_location` required (a machine always lands somewhere).
  - *Bulk move:* `item` (relation→items) + `quantity` (number > 0) set;
    `asset` empty. The locations say which kind: to-only = receive (delivery
    from outside), from+to = transfer, from-only = **consume** (installed/
    used; leaves stock, stays in the ledger — ADR 0005). Stock per location
    is derived in-minus-out; dashboard totals are deliveries − consumptions;
    negative balances are flagged as data errors, never hidden.
  Plus `moved_by` (text), `note` (text — PO/slip numbers). All shapes are
  enforced server-side by the collection's `createRule` (migrations
  1783468805–1783468807). Timestamp is the `created` autodate field.
  Receiving-log fields (ADR 0013, all optional, offered by the UI only in
  "New delivery" mode): `vendor_name`, `po_number` (free text a human
  types — never a PO record), `packing_slip` (file, 1 — the form nags
  loudly when absent but never blocks), `osd_note` (over/short/damaged in
  the receiver's words), `photos` (file, ≤8 — damage close-ups).
  `receiving.html` prints them per item or per PO as dispute evidence.
- **`readings`** — the second append-only ledger (ADR 0012): hour-meter /
  odometer readings. `asset` (relation), `value` (number), `reading_type`
  (select: `hours` | `odometer` — copied from `items.meter` at capture so
  each record is self-contained), `recorded_by` (text), `photo` (the
  gauge). Update/delete superuser-only; corrections are new readings —
  these numbers end up on invoices. **Latest reading is derived** (newest
  record per asset, no column on assets); a value lower than its
  predecessor is accepted (replaced meter / typo) and flagged at render
  time, never blocked and never stored as a flag.
- **`reservations`** — `asset` (relation), `requested_by`, `needed_by` (date),
  `expected_release` (date), `note`, `status` (select: `open` | `fulfilled` |
  `cancelled`; **empty = open** for pre-status rows — filter with "not
  closed", never "= open"). Humans close claims (ADR 0007): post-move
  fulfill offer + confirm-guarded cancel on asset.html; open claims past
  their release date are flagged red, never hidden; closed claims leave the
  UI but stay in the DB. UI: reserve + "spoken for" queue on asset.html,
  upcoming list on the dashboard. Dates are stored date-only at UTC
  midnight — always format with `timeZone: 'UTC'` or western timezones show
  the previous day.
- **`inspection_requirements`** — what an asset owes and how often (ADR
  0014): `asset` (relation), `name` ("Monthly visual"), `interval_days`
  (int — the ONLY scheduling concept in the module), `reference` (free-text
  citation). Catalog-like, manager-edited (update allowed, delete
  admin-only). Per-asset, not per-item: inspection clocks are per-unit.
- **`inspections`** — the third append-only ledger (ADR 0014): `asset`,
  `requirement` (nullable — ad-hoc is real), `result` (`pass` | `fail` |
  `removed_from_service`), `inspected_by` (text), `inspected_at`
  (**client-set**, date-only UTC midnight — compliance math must survive
  offline queues and back-entry; `created` still shows when it entered),
  `note`, `photo` (nagged for on fail/removed, never required). createRule
  enforces `requirement.asset = asset` server-side. The RED/YELLOW/GREEN
  badge is **derived at render time** by `pb_public/tn-inspect.js` (shared
  by asset.html + index.html — the second exception to self-contained
  pages, because DO-NOT-USE logic must not drift): RED = latest fail/
  removed, past due, or no pass on record; YELLOW = due within 14 days (a
  code constant, not a setting); GREEN = all current; no badge = no
  requirements. Nothing about compliance is ever stored.

### Model principles

- **The movements ledger is the source of truth.** `assets.current_location` is a
  convenience cache updated after each move — always write the movement record
  first, then update the cache.
- **`tracking_mode` distinguishes the two worlds without splitting the schema.**
  Unique items (a specific serial-numbered total station) become `assets` and
  move as whole records. Bulk commodities (500 pipe supports) move as quantities
  in the ledger. Bulk stock-on-hand is derived by summing movements per location,
  not stored in a column that must be kept in sync.
- **Rentals are not a special case.** A rented scissor lift is just an asset with
  `ownership=rented` plus `vendor` and `po_number`. No integrations.

## Repo structure

```
trenchnote/
├── CLAUDE.md              # this file — project context
├── README.md              # what it is + quickstart for self-hosters
├── USER_GUIDE.md          # field guide for crews — plain language, no jargon
├── ROADMAP.md             # parked ideas + the free/hosted-tier line
├── LICENSE                # AGPLv3
├── docs/
│   ├── DEVELOPER_GUIDE.md # how it works: data model, invariants, patterns
│   └── adr/               # architecture decision records (the WHY)
├── .gitignore             # ignore the pocketbase binary and pb_data/
├── pb_migrations/         # versioned schema (COMMITTED)
├── pb_hooks/              # server hooks: off-site move email (ADR 0012)
├── pb_public/             # the static frontend
│   ├── index.html         # dashboard: assets by location, materials, recently moved
│   ├── asset.html         # scan landing page: view + move an asset
│   ├── material.html      # bulk item: stock per location (derived) + move quantities
│   ├── labels.html        # print QR labels for all assets
│   ├── scan.html          # in-app QR scanner; walk mode audits a location
│   ├── login.html         # sign in; token to localStorage
│   ├── tn-auth.js         # shared auth helper (TN.fetch / TN.requireLogin)
│   ├── tn-sync.js         # offline write queue + sync badge + stale banner
│   ├── sw.js              # service worker (bump VERSION on any pb_public change!)
│   ├── manifest.json      # PWA manifest (+ icon-192/512.png)
│   └── vendor/            # vendored alpine.min.js, qrcode.min.js
└── scripts/
    └── setup.sh           # download the right PocketBase binary for the OS
```

Committed: source, migrations, vendored libs, docs.
Ignored: the PocketBase binary (`pocketbase` / `pocketbase.exe`) and `pb_data/`
(the live database and uploaded files).

## Conventions

- **Frontend talks to PocketBase at `window.location.origin`.** PocketBase serves
  the pages from `pb_public/`, so the same file works on localhost and over the
  LAN IP with no config — never hardcode a host.
- **QR codes encode `{baseUrl}/asset.html?code={tag_code}`** at highest error
  correction, with the human-readable tag code printed underneath as the
  mud-proof fallback. Keep tag codes short (3–5 chars) so QR density stays low
  and scans survive scratches and mud.
- **Comment the PocketBase API calls** — filter syntax, `expand`, the
  write-movement-then-update-cache sequence — so the maintainer learns the
  backend by reading the code.
- Design tokens: one accent (safety orange) spent only on the primary action;
  system fonts for zero webfont bytes; monospace for tag codes.
- **Any change to a file in `pb_public/` requires bumping `VERSION` in
  `sw.js`** — the service worker serves the shell cache-first, so without the
  bump, phones keep running the old code. Movements are created with
  pre-generated ids (`TNSync.genId()`) so offline replays are idempotent —
  keep that pattern in any new write path (ADR 0008).

## Security posture

**Phase 2 — locked down** (migration `1783468806`, ADR 0004). Every API rule
requires `@request.auth.id != ""`; there is no public self-signup
(`users.createRule` is null — accounts are created in the admin UI). Access
model: crews share one field account signed in once per phone; PMs get
personal accounts. Frontend plumbing: `pb_public/tn-auth.js` (`TN.fetch`
attaches the token, `TN.requireLogin` gates every page) + `login.html`.
Sessions slide forward via `auth-refresh` on each page load — this is also
how expired tokens are detected, because PocketBase treats a bad token on
reads as a guest (200 + empty list), NOT a 401. The movements ledger stays
append-only: update/delete are superuser-only. New collections must ship
with auth-required rules from day one.

## Non-goals — push back if asked to build these

- No heavy frontend framework, build step, bundler, or runtime CDN dependency.
- No vendor API integrations. Rentals stay manual (`ownership=rented`).
- No accounting, scheduling, or document management. TrenchNote is a logistics
  ledger and stays one.
- No multi-tenant shared-database complexity. The future SaaS tier is one
  PocketBase instance per customer (Vikunja-style), which is simpler and safer.
- No multi-master sync between instances. Deployment is one writable VPS with
  the Pi as replica/staging (ADR 0006); a truly offline site gets its own
  standalone install, never a synced peer.

## Definition of done — the docs-as-code rule

Claude acts as Lead Developer AND Technical Writer for this project. A
feature, bug fix, or architecture change is NOT finished until the
documentation checklist below is done. Do not ask permission to write the
docs — analyze the code just written, update the documentation, and report
the feature and the documentation as complete together.

1. **ADRs** — if the work involved a significant structural choice (how the
   database works, how offline syncing works, which library was chosen),
   create or update an ADR in `docs/adr/` explaining WHY it was done this way.
   Document the real rationale, not invented ones.
2. **Developer docs** — update `docs/DEVELOPER_GUIDE.md` so future
   open-source contributors and self-hosters know how the new code works
   under the hood.
3. **User guide** — update `USER_GUIDE.md` (repo root) explaining how a
   foreman or laborer uses the feature, in plain English, no jargon.
4. **README** — update `README.md` if setup instructions or core features
   changed.

Docs must stay truthful to the code as shipped: no documenting aspirations as
features, and if the code and the docs disagree, fixing that mismatch is part
of the task.

## Working style

Work task by task. After each task, stop and show the maintainer for review
before moving on. Explain what you did and why, especially anything touching the
data model or the ethos above.

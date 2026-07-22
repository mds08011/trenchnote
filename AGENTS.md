# AGENTS.md — TrenchNote

Project context for Codex sessions. Read this first, every session.

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

## Data model — 14 collections

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
  badge is **derived at render time** by `pb_public/tn-inspect.js` (one of the
  shared derived-logic helpers — with `tn-containers.js`, ADR 0021 — that are
  the deliberate exceptions to self-contained pages, because DO-NOT-USE and
  location-derivation logic must not drift between surfaces): RED = latest fail/
  removed, past due, or no pass on record; YELLOW = due within 14 days (a
  code constant, not a setting); GREEN = all current; no badge = no
  requirements. Nothing about compliance is ever stored.
- **`condition_reports`** — append-only photographed observations (ADR 0019):
  `asset`, `report_type` (`damage` | `wear` | `condition_note`), required
  `description`, required single `photo`, `reported_by`, and server-set
  `created`. `condition_note` documents good condition at rental delivery or
  before return without marking the asset damaged.
- **`condition_resolutions`** — append-only human outcomes (ADR 0019):
  `report`, `resolution` (`repaired` | `accepted_as_is` | `disposed` |
  `returned_to_vendor`), `note`, `resolved_by`, and server-set `created`.
  **DAMAGED is derived**: any damage report without a related resolution.
  No damaged/open status is stored.
- **`manifests`** — the forward-only site-to-site handshake (ADR 0020):
  `from_location`, `to_location`, signed-in `created_by`, free-text
  `driver_name`, `status` (`draft` → `in_transit` → `received` or
  `received_with_discrepancies`), and signed-in `received_by`. In transit is
  derived from this workflow row — dispatch writes no movement and uses no
  virtual location.
- **`manifest_lines`** — immutable sent facts plus receiving confirmation:
  one `asset`, or one `item` + `quantity`, with `sent_quantity`,
  `received_quantity`, and `condition_note`. Receipt uses one PocketBase batch
  transaction to write line confirmations, ordinary movements, asset-cache
  patches, and final status. Shortfalls move to the seeded `Missing in
  transfer` holding location rather than being mislabeled as consumption.
- **`container_events`** — append-only Gang Box membership facts (ADR 0021):
  add/remove one loose asset to/from one top-level container. `assets.is_container`
  marks a box and `assets.container_id` is a derived membership cache; contained
  assets have their `current_location` cleared and derive location from the box
  (via `pb_public/tn-containers.js`) and cannot move independently. Enforced by
  `pb_hooks/containers.pb.js`.
- **`kit_audits`** — append-only, client-dated Gang Box checklist snapshots
  (ADR 0021). `results` is a bounded JSON list `[{asset_id, present|missing}]`;
  the server refuses an incomplete checklist and, atomically, removes each
  `missing` member and parks it at `Missing in transfer` (ADR 0020). Boxes
  travel on transfer manifests as one ordinary asset line; their contents are
  never repeated as lines.

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
├── CLAUDE.md              # agent context (Claude Code) — read first every session
├── AGENTS.md              # agent context (Codex) — twin of CLAUDE.md, kept in lockstep
├── README.md              # what it is + quickstart for self-hosters
├── USER_GUIDE.md          # field guide for crews — plain language, no jargon
├── ROADMAP.md             # parked ideas + the free/hosted-tier line
├── RELEASING.md           # release procedure (v1.0.0 onward)
├── CONTRIBUTING.md        # CLA/DCO note (ADR 0011) + how to contribute
├── LICENSE                # AGPLv3
├── docs/
│   ├── DEVELOPER_GUIDE.md # how it works: data model, invariants, patterns
│   ├── current-state.md   # what is SHIPPED today (status words) — the ground truth
│   ├── BACKLOG.md         # incident-driven product backlog (motivated, unbuilt)
│   ├── adr/               # architecture decision records (the WHY) — the decision log
│   ├── tasks/             # per-task implementation prompts (see Session workflows)
│   └── …                  # domain-model, invariants, architecture-status,
│                          #   lifecycle-map, product-boundary, API, etc.
├── .gitignore             # ignore the pocketbase binary and pb_data/
├── pb_migrations/         # versioned schema (COMMITTED)
├── pb_hooks/              # server hooks (JS):
│   ├── main.pb.js         #   off-site move email (ADR 0012)
│   └── containers.pb.js   #   gang-box / kitting invariants (ADR 0021)
├── pb_public/             # the static frontend
│   ├── index.html         # dashboard: assets by location, materials, recently moved
│   ├── asset.html         # scan landing page: view + move an asset
│   ├── material.html      # bulk item: stock per location (derived) + move quantities
│   ├── receiving.html     # print-friendly receiving report (ADR 0013)
│   ├── manifests.html     # build and dispatch a transfer manifest (ADR 0020)
│   ├── manifest.html      # print/receive one transfer manifest (ADR 0020)
│   ├── labels.html        # print QR labels for all assets
│   ├── scan.html          # in-app QR scanner; walk mode audits a location
│   ├── login.html         # sign in; token to localStorage
│   ├── tn-auth.js         # shared auth helper (TN.fetch / TN.requireLogin)
│   ├── tn-sync.js         # offline write queue + sync badge + stale banner (ADR 0008)
│   ├── tn-inspect.js      # derived inspection badge logic (ADR 0014)
│   ├── tn-containers.js   # derived gang-box location logic (ADR 0021)
│   ├── sw.js              # service worker (bump VERSION on any pb_public change!)
│   ├── manifest.json      # PWA manifest (+ icon-192/512.png)
│   └── vendor/            # vendored alpine.min.js, qrcode.min.js, jsQR.min.js
├── scripts/
│   ├── setup.sh           # download the right PocketBase binary for the OS
│   ├── seed_demo.sh       # fill a local instance with fake demo data
│   ├── seed_local_june2026.sh # a larger local dev seed
│   └── smoke_test.sh      # regression gate: fresh DB + seed + invariant
│                          # assertions over the REST API. Run before any
│                          # migration lands, any tag, any deploy.
├── tests/
│   └── gang_boxes.ps1     # Windows integration test for gang boxes / kitting
└── deploy/                # VPS/Pi deploy config: Caddyfile, systemd unit,
                           # litestream.yml, preflight.sh, verify-live.sh (ADR 0006)
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
- **Tag codes are UPPERCASE and case-insensitive.** For fleet equipment that
  already carries a stenciled company asset number, `tag_code` **is that number
  verbatim** — `P-138`, `FL-16`, `SC-50`, `MISC-37`, `T-127A`. Hyphens, mixed
  length, and trailing letters are all fine, and even the longest still encodes
  to a coarse QR version 6 (41×41 modules) at level H, so density stays low.
  Crews already speak these numbers; a second invented ID would fight a decade
  of stenciled paint (docs/BACKLOG.md item 8). Invented short codes (`A001`
  style) remain the convention only for untagged small tools and the future
  unassigned-tag pools (BACKLOG item 1). Enter codes uppercase in the admin UI;
  the unique index is case-insensitive (migration `1783468825`, so `P-138` and
  `p-138` can never become two assets), and `asset.html`/`scan.html` normalize
  a scanned or typed code to uppercase before lookup (PocketBase's `=` filter
  is case-sensitive, so any new tag-lookup path must uppercase its input too).
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
- **No purchase orders / procurement** (ADR 0013). `po_number` on a delivery
  is a free-text string a human types — TrenchNote knows what *arrived*,
  never what was *ordered*. No PO records, no line items, no received-vs-
  ordered matching, no three-way match. That's the accounting department's
  spreadsheet, and the wall stays up.
- **No equipment billing or rate calculation.** Reports may summarize the
  ledger for the existing billing process; TrenchNote never computes charges.
  (Rates stay in the premium sidecar per ADR 0015; a future monthly equipment
  report — docs/BACKLOG.md item 7 — *feeds* accounting's split, never does it.)
- **The inspections module is a visibility layer, not a safety program**
  (ADR 0014). It records inspections; it does not schedule work, assign
  inspectors, or constitute compliance. If a feature request needs workflow
  — assignments, approvals, escalations — the answer is no.
- **No repair work orders or maintenance management** (ADR 0019). Condition
  reports record photo evidence and a human resolution only — no mechanic
  assignments, maintenance scheduling, labor/parts/cost tracking, or approval
  workflow.
- No multi-tenant shared-database complexity. The future SaaS tier is one
  PocketBase instance per customer (Vikunja-style), which is simpler and safer.
- No multi-master sync between instances. Deployment is one writable VPS with
  the Pi as replica/staging (ADR 0006); a truly offline site gets its own
  standalone install, never a synced peer.

## Definition of done — the docs-as-code rule

Codex acts as Lead Developer AND Technical Writer for this project. A
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
5. **Status + agent docs** — if the change alters what is *shipped*, reconcile
   `docs/current-state.md` (it is the ground-truth status doc). Any edit to this
   file (`CLAUDE.md`) must be mirrored into `AGENTS.md` (see "Canonical planning
   docs" below). And if you touched anything in `pb_public/`, bump `VERSION` in
   `pb_public/sw.js`.

Docs must stay truthful to the code as shipped: no documenting aspirations as
features, and if the code and the docs disagree, fixing that mismatch is part
of the task.

## Canonical planning docs — do not create parallels

This repo already has its planning and decision infrastructure. **Do NOT create
`DECISIONS.md`, `docs/ROADMAP.md`, or `docs/ARCHITECTURE.md`** — the equivalents
exist and are the single source of truth. If you think a parallel file is
needed, you are wrong; extend the existing one.

- **Decision log** → `docs/adr/` (numbered ADRs — the WHY). A significant new
  decision gets a **new numbered ADR** here. Rejected ideas that should never be
  re-proposed are recorded in `ROADMAP.md` ("Explicitly not planned") and the
  Non-goals above.
- **Roadmap / parking lot** → root `ROADMAP.md` (shaped-but-undated ideas + the
  free/paid line) and `docs/BACKLOG.md` (incident-driven product backlog).
  Neither is a promise list; TrenchNote is post-v1.0 and in parking-lot mode.
- **Architecture** → `docs/architecture-status.md`, `docs/domain-model.md`,
  `docs/invariants.md`, `docs/lifecycle-map.md`, and `docs/current-state.md`
  (what is shipped today, with CURRENT/DECIDED/PROPOSED status words).
- **Task queue** → `docs/tasks/` (see below). **Empty is the normal resting
  state** — the parking lot is not a task queue.
- **`CLAUDE.md` and `AGENTS.md`** are twin agent-context files (for Claude Code
  and Codex respectively). Keep them in lockstep: identical project facts,
  differing only in the agent name and the filename in the H1. Any edit to one
  is mirrored into the other.

## Session workflows

Two modes. Work out which one you are in before writing any code.

### Execution workflow — when `docs/tasks/` has an actionable task

1. Read this file, `ROADMAP.md`, and the ADRs relevant to the task.
2. In `docs/tasks/`, pick the **lowest-numbered** task whose `Status:` is not
   `DONE` and not `BLOCKED` (respect the BLOCKED reason). That is your task.
3. Do exactly what its Specification and Acceptance criteria say — **no more.**
   Do not "improve" settled decisions; if you disagree, stop and raise it.
4. Honour the Definition of done (docs-as-code) *and* the task's own checklist.
   Bump `sw.js` VERSION if you touched `pb_public/`. Run
   `scripts/smoke_test.sh` (green) before a migration/backend change is "done".
5. Update the task's `Status:` line to `DONE`. If it closes a milestone, tick
   that milestone in `ROADMAP.md`.
6. Commit with a message describing what changed (author the maintainer only;
   **no `Co-Authored-By` trailer**). Then stop and show the maintainer.

### Roadmap-maintenance workflow — when `docs/tasks/` is empty (or a milestone just closed)

An empty `docs/tasks/` is the **normal** state of this post-v1.0 repo. Do **not**
invent work. This is a planning session, not a coding session:

1. Re-read `ROADMAP.md`, `docs/BACKLOG.md`, and `docs/adr/`; check
   `docs/current-state.md` for what is actually shipped vs deployed.
2. If — and only if — the maintainer has named committed near-term work, break
   it into numbered task files using `docs/tasks/_TEMPLATE.md`. One task = one
   focused session.
3. Run a short ideation pass (one new-feature, one cut, one integration idea),
   each checked against the Non-goals and the ADRs so a **rejected idea is not
   re-proposed**.
4. Present everything to the maintainer for approval **before** writing task
   files. Only then do execution sessions resume.

If mid-task you find the roadmap or an ADR is wrong or contradicts the code,
**stop**, describe the conflict, and propose a doc edit. Do not improvise around
it.

## Working style

Work task by task. After each task, stop and show the maintainer for review
before moving on. Explain what you did and why, especially anything touching the
data model or the ethos above.

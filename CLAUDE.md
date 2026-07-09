# CLAUDE.md — TrenchNote

Project context for Claude Code sessions. Read this first, every session.

## What TrenchNote is

A minimalist, low-bandwidth, self-hostable web app for tracking physical
equipment and materials across construction job sites. Built by a project
engineer at a water/wastewater general contractor.

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

## Data model — 5 collections

Schema lives in `pb_migrations/` as versioned PocketBase JS migrations, NOT as
hand-built collections in the admin UI. A fresh self-hoster must be able to
reproduce the entire database from the repo.

- **`items`** — the catalog: what a thing *is*, not a specific one.
  `name`, `description`, `category`, `tracking_mode` (select: `unique` | `bulk`),
  `photo` (file).
- **`locations`** — `name`, `type` (select: `jobsite` | `yard` | `warehouse` |
  `transit`).
- **`assets`** — a specific physical instance of a unique item.
  `item` (relation→items), `tag_code` (text, **unique index**), `serial_number`,
  `ownership` (select: `owned` | `rented`), `vendor`, `po_number`,
  `current_location` (relation→locations).
- **`movements`** — the append-only ledger and **source of truth**. One
  collection holds both kinds of moves, distinguished by which fields are set:
  - *Asset move:* `asset` (relation→assets) set; `item` empty, `quantity` 0.
  - *Bulk move:* `item` (relation→items) + `quantity` (number > 0) set;
    `asset` empty.
  Plus `from_location` (relation; empty = entered from outside the system),
  `to_location` (relation, required), `moved_by` (text), `note` (text). The
  either/or shape is enforced server-side by the collection's `createRule`.
  Timestamp is the `created` autodate field.
- **`reservations`** — `asset` (relation), `requested_by`, `needed_by` (date),
  `expected_release` (date). Schema now; UI later.

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
├── LICENSE                # AGPLv3
├── .gitignore             # ignore the pocketbase binary and pb_data/
├── pb_migrations/         # versioned schema (COMMITTED)
├── pb_public/             # the static frontend
│   ├── index.html         # dashboard: assets by location, materials, recently moved
│   ├── asset.html         # scan landing page: view + move an asset
│   ├── material.html      # bulk item: stock per location (derived) + move quantities
│   ├── labels.html        # print QR labels for all assets
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

## Security posture

Phase 1 API rules are permissive (public list/view/create/update) for local
testing. **Every permissive rule must carry a `TODO(auth)` comment** marking the
rule that becomes `@request.auth.id != ""` before TrenchNote is exposed to the
internet. PocketBase auth is built in; locking down is a later, deliberate step —
not an accident waiting to happen.

## Non-goals — push back if asked to build these

- No heavy frontend framework, build step, bundler, or runtime CDN dependency.
- No vendor API integrations. Rentals stay manual (`ownership=rented`).
- No accounting, scheduling, or document management. TrenchNote is a logistics
  ledger and stays one.
- No multi-tenant shared-database complexity. The future SaaS tier is one
  PocketBase instance per customer (Vikunja-style), which is simpler and safer.

## Working style

Work task by task. After each task, stop and show the maintainer for review
before moving on. Explain what you did and why, especially anything touching the
data model or the ethos above.

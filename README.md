# TrenchNote

**A minimalist, self-hostable ledger for tracking equipment and materials
across construction job sites.**

Project page: [trenchnote.com](https://trenchnote.com/)

Tape a QR code to a scissor lift. Anyone who scans it with their phone camera
sees what it is, where it's supposed to be, and how long it's been there — and
can log a move in two taps. No app to install; crews sign in once on each phone
with a shared field account. No vendor integrations.

TrenchNote answers three questions and refuses to be anything else:

1. **What is this thing?**
2. **Where is it?**
3. **Who moved it?**

![The TrenchNote dashboard: assets grouped by location, material totals, upcoming reservations, and the recent-movements ledger](docs/img/dashboard.png)

## Current status

TrenchNote is working field software under active development. The committed
schema and UI cover the workflows described below, and a public PocketBase
instance is deployed, but there are no release tags or formal maturity level and
no automated regression suite yet. The public deployment may lag `main`; see the
dated [current-state report](docs/current-state.md) before planning an update.

Self-hosters should pin the documented PocketBase version, keep an off-box
backup, and rehearse restores before using the ledger as the only copy of field
records. The deployment and rollback procedures are documented and do not
require containers or a managed service.

It is not an ERP, not a Procore replacement, and not accounting software. It's
a field-logistics ledger built by a project engineer at a water/wastewater
general contractor, for the real problems of shared-equipment divisions:
internal tools bartered between sites, materials vanishing from staging yards,
and rented gear nobody remembers is still on rent.

Because the ledger already knows where everything sat and when, it also
captures what the office needs to bill equipment time to jobs: a job code
per location, optional hour-meter/odometer readings (with a gauge photo) at
the scan moment or on a month-end walkdown, and an email to a site's PM the
instant something is logged as leaving their site — before the truck is out
of the gate, not on Friday.

## Design principles

- **Works on a cheap smartphone on a dirt lot with bad reception — or none.**
  Pages are measured in kilobytes, high contrast for direct sunlight, tap
  targets sized for gloved hands. Offline-first: the app opens with zero
  connectivity, shows the last-known data (clearly marked as old), and moves
  logged offline queue on the phone and sync themselves when signal returns.
- **No build step.** Plain HTML + CSS + Alpine.js, served straight from disk.
  All JavaScript is vendored into the repo — zero CDN or external requests at
  runtime.
- **Trivially self-hostable.** The entire backend is
  [PocketBase](https://pocketbase.io): one Go binary with an embedded SQLite
  database. A $5 VPS or a Raspberry Pi in a job trailer is enough.

## Quickstart

You need `git`, `curl`, and `unzip` (all standard on Linux/macOS; on Windows,
use Git Bash).

```sh
git clone https://github.com/mds08011/trenchnote.git
cd trenchnote
PB_VERSION=0.39.6 ./scripts/setup.sh  # tested PocketBase version
./pocketbase serve
```

On first start, PocketBase applies the schema from `pb_migrations/`
automatically — no manual database setup.

Then:

1. Open **http://127.0.0.1:8090/_/** and create your admin account.
2. Still in the admin UI, create the app logins in the **users** collection:
   one shared "field" account for crews, personal ones for managers. (There
   is no public sign-up, on purpose.)
3. Add a few `locations` (e.g. "Main Yard", "Northside LS"), a couple of
   `items` (what a thing *is* — "19' Scissor Lift"), and `assets` (a
   specific physical one, with a short `tag_code` like `A001`).
4. Open **http://127.0.0.1:8090/labels.html**, sign in, print the QR labels,
   and tape them on.
5. Scan a label with your phone camera → sign in once on that phone → the
   asset page opens in the browser → tap **Move** when the thing changes
   sites.
6. Already in the app? **📷 Scan** opens an in-app scanner — and picking
   your location turns it into an inventory walk that flags anything the
   ledger has wrong, with a one-tap fix.
7. Moving a mixed truckload between sites? Open **Transfer manifest** on the
   dashboard, add assets by scan or list plus bulk quantities, dispatch, print
   the cab copy, and let the receiving site confirm every line.

Developing against the API, or want a busy-looking demo?
`scripts/seed_demo.sh` fills a local instance with realistic fake data
through the public API (see the developer guide).

Bulk materials (pipe supports, fittings — items with `tracking_mode=bulk`)
have no individual tags: open them from the dashboard's **Materials** section
to log deliveries and moves as quantities. Stock per location is always
derived from the movement ledger, never stored. Material that gets installed
doesn't vanish from history — log it as **Used / consumed** (it leaves stock
but stays in the ledger, with a note for the PO or where it went), so vendor
disputes stay winnable. Deliveries carry their own evidence: a packing-slip
photo taken at the truck, vendor, PO number, and an over/short/damaged note —
and `receiving.html` prints them per material or per PO as the report you
attach to the dispute email.

Site-to-site truckloads can use **Transfer manifests**: the sender records the
load and driver, dispatch makes it visible as “in transit,” and the receiving
super confirms or adjusts every line in one submit. A short receipt becomes a
named discrepancy, not a text-message argument. Dispatch and receipt use the
same visible offline queue as moves; confirmation writes the ordinary movement
ledger atomically, so existing stock math remains the source of truth. This is
a two-site handshake only — no carriers, tracking numbers, freight costs, or
shipping-system scope.

Need a machine for an upcoming pour? Any asset page has a **Reserve** option;
the claim shows up as a "spoken for" warning to anyone who scans that asset,
and on the dashboard.

Gear that's only legal to use until a date — harnesses, extinguishers,
slings, gas monitors — can carry **inspection requirements**. The same scan
that answers "where is it" also shows whether its recorded inspection history
needs attention: a derived RED **do-not-use** / YELLOW **due-soon** / GREEN
badge on the asset page, a
worst-first panel on the dashboard for the Monday safety walk, one-tap
inspection logging (works offline), and a CSV export of the append-only
inspection history. It records inspections — it is not a safety program,
and requirement intervals must come from yours (templates with that warning
in [docs/inspection-seeds.md](docs/inspection-seeds.md)).

### Testing from a phone

Your phone can't reach `127.0.0.1` — that's your computer's loopback. Serve on
your LAN IP instead:

```sh
./pocketbase serve --http=0.0.0.0:8090
```

Then set the **Base URL** on the labels page to `http://<your-lan-ip>:8090`
before printing, so the QR codes point somewhere phones can actually reach.

## Product boundary and related applications

TrenchNote owns physical logistics: receipt, location, custody, movement,
reservation, consumption, and evidence captured at those events. It may record
that material left stock or was moved to an installed location, but it does not
decide that installation, testing, startup, acceptance, or turnover succeeded.

The intended product family keeps separate bounded contexts and databases:
LineCheck for linear-infrastructure testing and acceptance, and LoopCheck for
plant equipment/system checkout and turnover. No cross-product handoff is
implemented in TrenchNote today. Proposed ownership and migration questions are
documented in [product-boundary.md](docs/product-boundary.md) and
[overlap-and-migrations.md](docs/overlap-and-migrations.md), not presented as
shipped integrations.

An optional proprietary `trenchnote-lookahead` sidecar may analyze the public
REST contract as an ordinary client. It is never required for field execution,
retention, backup, or current core exports, and its proprietary implementation
and operations remain documented in its private repository.

### Explicit non-goals

- No procurement or purchase-order model; a delivery PO number is typed
  reference text only.
- No accounting, rates, billing calculations, scheduling, or dispatch system.
- No inspection assignments, approvals, escalations, or claim of legal
  compliance.
- No vendor API integrations, shared product database, multi-master sync,
  universal workflow engine, or paid runtime dependency.

## Documentation

- **[docs/documentation-index.md](docs/documentation-index.md)** — every
  document mapped by authority: normative, descriptive, proposed, historical,
  or generated.
- **[docs/current-state.md](docs/current-state.md)** — confirmed stack,
  collections, workflows, offline behavior, deployment status, tests, and
  limitations at a dated repository snapshot.
- **[USER_GUIDE.md](USER_GUIDE.md)** — the field guide: scanning, moving,
  reserving, materials. Written for crews, not developers.
- **[docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)** — how it works under
  the hood: data model, the ledger invariants, migrations, frontend patterns.
- **[docs/product-boundary.md](docs/product-boundary.md)** and
  **[docs/domain-model.md](docs/domain-model.md)** — owned scope, neighboring
  contexts, authoritative facts, mutability, and proposed concepts kept
  separate from current entities.
- **[docs/architecture-status.md](docs/architecture-status.md)** and
  **[docs/open-questions.md](docs/open-questions.md)** — settled choices,
  proposed directions, risks, and the decision backlog.
- **[docs/DEPLOY.md](docs/DEPLOY.md)** — running it for real: trailer
  Pi or VPS, systemd, HTTPS with Caddy, and backups you've actually tested.
- **[docs/API.md](docs/API.md)** — the public API contract (v1): what
  integrations and third-party tools may build on, and the stability
  promise that comes with it.
- **[docs/RUNBOOK.md](docs/RUNBOOK.md)** — day-two operations: restarts,
  logs, restores, password rotation, safe upgrades.
- **[docs/adr/](docs/adr)** — architecture decision records: why a single
  binary + static pages, and why an append-only ledger.

## Security note

**Everything requires sign-in.** Every API rule is locked to authenticated
users; there is no public self-registration (accounts are created by the
admin); the movements ledger can't be edited or deleted even by signed-in
users. Field crews sign in once per phone with a shared account and the
session renews itself on use.

For internet-facing deployments, put HTTPS in front (two lines of Caddy
config — see [docs/DEPLOY.md](docs/DEPLOY.md)) and use strong passwords on
the admin and user accounts. That's the whole checklist.

## License

[AGPLv3](LICENSE). Self-host it, modify it, run it for your company or NGO
freely. If you offer a modified TrenchNote to others over a network, you must
publish your modifications — that's the point.

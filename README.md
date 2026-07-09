# TrenchNote

**A minimalist, self-hostable ledger for tracking equipment and materials
across construction job sites.**

Tape a QR code to a scissor lift. Anyone who scans it with their phone camera
sees what it is, where it's supposed to be, and how long it's been there — and
can log a move in two taps. No app to install, no account for field crews, no
vendor integrations.

TrenchNote answers three questions and refuses to be anything else:

1. **What is this thing?**
2. **Where is it?**
3. **Who moved it?**

It is not an ERP, not a Procore replacement, and not accounting software. It's
a field-logistics ledger built by a project engineer at a water/wastewater
general contractor, for the real problems of shared-equipment divisions:
internal tools bartered between sites, materials vanishing from staging yards,
and rented gear nobody remembers is still on rent.

## Design principles

- **Works on a cheap smartphone on a dirt lot with bad reception.** Pages are
  measured in kilobytes. High contrast for direct sunlight. Tap targets sized
  for gloved hands.
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
./scripts/setup.sh     # downloads the PocketBase binary for your OS
./pocketbase serve
```

On first start, PocketBase applies the schema from `pb_migrations/`
automatically — no manual database setup.

Then:

1. Open **http://127.0.0.1:8090/_/** and create your admin account.
2. In the admin UI, add a few `locations` (e.g. "Main Yard", "Northside LS"),
   a couple of `items` (what a thing *is* — "19' Scissor Lift"), and `assets`
   (a specific physical one, with a short `tag_code` like `A001`).
3. Open **http://127.0.0.1:8090/labels.html**, print the QR labels, and tape
   them on.
4. Scan a label with your phone camera → the asset page opens in the browser →
   tap **Move** when the thing changes sites.

Bulk materials (pipe supports, fittings — items with `tracking_mode=bulk`)
have no individual tags: open them from the dashboard's **Materials** section
to log deliveries and moves as quantities. Stock per location is always
derived from the movement ledger, never stored. Material that gets installed
doesn't vanish — make a location like "Installed — Northside" and move it
there, so the ledger stays complete for vendor disputes.

### Testing from a phone

Your phone can't reach `127.0.0.1` — that's your computer's loopback. Serve on
your LAN IP instead:

```sh
./pocketbase serve --http=0.0.0.0:8090
```

Then set the **Base URL** on the labels page to `http://<your-lan-ip>:8090`
before printing, so the QR codes point somewhere phones can actually reach.

## Security note

Out of the box the API rules are **open for local testing** (anyone on the
network can read and write). Before exposing TrenchNote to the internet, lock
the rules down to authenticated users — every open rule in `pb_migrations/` is
marked with a `TODO(auth)` comment. PocketBase's auth is built in; this is a
deliberate later step, not an oversight.

## License

[AGPLv3](LICENSE). Self-host it, modify it, run it for your company or NGO
freely. If you offer a modified TrenchNote to others over a network, you must
publish your modifications — that's the point.

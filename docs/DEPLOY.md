# TrenchNote — Deployment & Backups

How to run TrenchNote somewhere other than your laptop, and how to make sure
a dead SD card can't erase eighteen months of ledger history.

> **Auth status:** as of migration `1783468806`, every API rule requires a
> signed-in user and there is no public self-registration (see ADR 0004).
> Both options below are safe. For anything internet-facing, use Option B's
> HTTPS setup — never expose the bare HTTP port to the world — and use
> strong passwords on the admin and user accounts.

## Option A — a box on the LAN (job trailer, office)

The right first deployment: a Raspberry Pi, a mini PC, or any always-on
machine on the same network as the phones. No domain, no TLS certificates,
no monthly bill.

```sh
# On the box (any Linux; a Pi 3 or better is plenty):
sudo useradd --system --create-home --home-dir /opt/trenchnote trenchnote
sudo -u trenchnote git clone https://github.com/mds08011/trenchnote.git /opt/trenchnote/app
cd /opt/trenchnote/app
sudo -u trenchnote ./scripts/setup.sh
```

Give the box a **fixed address** — reserve its IP in your router's DHCP
settings (e.g. `192.168.1.50`). The QR labels will encode this address;
if it changes, every printed label dies.

### Run it as a service (systemd)

Create `/etc/systemd/system/trenchnote.service`:

```ini
[Unit]
Description=TrenchNote (PocketBase)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=trenchnote
WorkingDirectory=/opt/trenchnote/app
# 0.0.0.0 = listen on the LAN, not just localhost
ExecStart=/opt/trenchnote/app/pocketbase serve --http=0.0.0.0:8090
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now trenchnote
```

The service starts on boot, restarts on crashes, and survives power cuts to
the trailer. Visit `http://192.168.1.50:8090/_/` once to create the admin
account, create the app logins in the **users** collection (a shared field
account for crews + personal ones for PMs), seed your
locations/items/assets, then print labels from
`http://192.168.1.50:8090/labels.html` with the Base URL set to
`http://192.168.1.50:8090`.

**Phones must be on the same network** (the site Wi-Fi or an office AP that
reaches the yard). If crews are on cell data only, you need Option B.

## Option B — internet-facing VPS

For crews scanning over cell data from twelve different sites, TrenchNote
needs a real domain and HTTPS.

Any $5-tier VPS (1 CPU, 512 MB) is more than enough. Setup is Option A plus
a reverse proxy for HTTPS. [Caddy](https://caddyserver.com) is the boring
choice because it fetches and renews certificates automatically:

```sh
# PocketBase listens on localhost only; Caddy is the front door
ExecStart=/opt/trenchnote/app/pocketbase serve --http=127.0.0.1:8090
```

`/etc/caddy/Caddyfile` — this is the entire proxy config:

```
trenchnote.example.com {
    reverse_proxy 127.0.0.1:8090
}
```

Point your domain's DNS at the VPS, `sudo systemctl reload caddy`, and
TrenchNote is at `https://trenchnote.example.com`. Reprint the labels with
that as the Base URL.

### Moving from LAN to VPS later

Copy `pb_data/` from the old box to the new one (stop the service first,
see Backups below). Then reprint every label — the old QRs encode the LAN
IP, which phones on cell data can't reach. This is why you don't laminate
200 labels before choosing where TrenchNote lives.

## Updating

```sh
cd /opt/trenchnote/app
sudo -u trenchnote git pull
sudo systemctl restart trenchnote   # pending migrations auto-apply on start
```

Schema changes ship as migrations, so `git pull` + restart is the whole
upgrade. To also upgrade the PocketBase binary itself: stop the service,
delete `pocketbase`, re-run `scripts/setup.sh`, start — but read the
PocketBase release notes first, and take a backup before any binary upgrade.

## Backups

**What needs backing up: `pb_data/` and nothing else.** The schema is
rebuilt from `pb_migrations/` in git; the binary is re-downloadable. But
`pb_data/` holds the ledger — the thing that wins vendor disputes — and the
uploaded photos. If TrenchNote becomes the division's source of truth,
`pb_data/` on one SD card is the single point of failure.

### Rule one: never copy `pb_data/` while the server is running

SQLite keeps in-flight writes in sidecar files (`-wal`); a naive `cp` of a
live database can produce a corrupt copy that *looks* fine until you need
it. Use either of these instead:

### Method 1 — PocketBase's built-in backups (recommended)

Admin UI → **Settings → Backups**. PocketBase snapshots `pb_data/` into a
zip safely (it handles the database locking for you), on demand or on a
schedule — set the cron expression to e.g. `0 3 * * *` for nightly at 3am,
and keep several (e.g. max 7). The same settings screen can store backups
directly in any S3-compatible bucket (Backblaze B2, Wasabi, AWS), which
gets them **off the box** — a backup on the same SD card as the database
protects against nothing.

Restoring: Admin UI → Settings → Backups → restore on the zip. PocketBase
unpacks it and restarts itself.

### Method 2 — offsite copy of the backup zips

If you'd rather not hand PocketBase S3 credentials, ship the zips somewhere
else on a schedule. The built-in backups land in `pb_data/backups/`, so a
nightly cron on another machine (or the same one, pushing outward) works:

```sh
# e.g. on the office NAS / your workstation, in crontab -e:
# pull last night's backups from the trenchnote box at 4am
0 4 * * * rsync -a trenchnote@192.168.1.50:/opt/trenchnote/app/pb_data/backups/ ~/trenchnote-backups/
```

For a fully manual cold copy without the built-in system: stop the service
(`sudo systemctl stop trenchnote`), copy the whole `pb_data/` folder, start
it again. Fine for a pre-upgrade snapshot; too manual to be your only plan.

### Test the restore — once, now

A backup you have never restored is a hope, not a backup. Do the drill once:
on any spare machine, clone the repo, run `setup.sh`, unzip a backup into a
fresh `pb_data/` (or use the admin UI restore), start PocketBase, and check
that an asset page loads with its movement history intact. Ten minutes, and
now the recovery procedure is something you've done rather than something
you believe in.

## Quick reference

| Task | Command |
|---|---|
| Status / logs | `systemctl status trenchnote` · `journalctl -u trenchnote -f` |
| Restart | `sudo systemctl restart trenchnote` |
| Update app | `git pull` then restart |
| Backup now | Admin UI → Settings → Backups → Create |
| Restore | Admin UI → Settings → Backups → ⟲ on the zip |

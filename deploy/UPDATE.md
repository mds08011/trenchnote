# TrenchNote — updating a live instance

For a box that's **already deployed and serving** (e.g. `app.trenchnote.com`).
New deploy instead? Use [README.md](README.md). The why behind these commands
is in [docs/DEPLOY.md → Updating](../docs/DEPLOY.md#updating).

The whole update is `git pull` + restart — schema ships as migrations that
auto-apply on boot. The discipline around it is what this checklist is for,
because you're touching **production data**.

## The golden rule

**Back up before you pull. Every time.** A migration runs against the real
ledger on restart; a backup is your only undo. If you don't yet have the Pi
replica (runbook Phase 6), this manual backup is your *only* safety net.

## Checklist

### 1. Back up — and get the backup OFF the box
Admin UI → **Settings → Backups → Create**, then download the zip to your
laptop (or confirm the S3 target has it). A backup sitting only on the droplet
protects against nothing.

### 2. Note the current version (for rollback)
```sh
cd /opt/trenchnote/app
git rev-parse --short HEAD     # write this down — the commit to roll back to
```

### 3. Pull + restart
```sh
sudo -u trenchnote git pull
sudo systemctl restart trenchnote      # pending migrations auto-apply, in order
systemctl status trenchnote            # active (running)
journalctl -u trenchnote -n 30         # skim for migration errors
```

### 4. Verify it's actually current
From your laptop, in a checkout of the version you just deployed:
```sh
sh deploy/verify-live.sh https://app.trenchnote.com
```
Expect `LIVE VERIFY PASS`. It checks health, that every collection exists
(catches a migration that didn't apply), that `receiving.html` serves the real
page (not the catch-all dashboard), and that the deployed `sw.js` VERSION
matches your checkout. Or check by hand:
```sh
curl -s -o /dev/null -w '%{http_code}\n' https://app.trenchnote.com/api/collections/inspections/records  # want 200
curl -s https://app.trenchnote.com/sw.js | grep 'const VERSION'                                          # want the repo's version
```

### 5. Phones update themselves
The bumped `sw.js` VERSION makes each phone re-download the app shell on its
next visit with signal — no crew action needed. **Labels do NOT need
reprinting** for a code update: they encode `asset.html?code=…`, unchanged.
(Reprint only when the *domain/URL* changes.)

## Rollback (if step 4 fails or something's wrong)

Additive migrations (new collections / new optional fields) don't remove data,
so most bad updates are a code problem, not a data one:

```sh
cd /opt/trenchnote/app
sudo -u trenchnote git checkout <the short hash from step 2>
sudo systemctl restart trenchnote
```

If a migration itself misbehaved and you need the data back, restore the
step-1 backup: Admin UI → Settings → Backups → restore on the zip (it unpacks
and restarts PocketBase). This is why step 1 is non-negotiable.

## This first catch-up jump (as of 2026-07-10)

The live box is several releases behind `main` — it predates the readings
ledger, so the pull will apply, in order:

- `1783468809/810` timecard fields + **readings** (ADR 0012)
- `1783468813/814` inspection requirements + **inspections** (ADR 0014)
- `1783468815` **receiving-log** fields on movements (ADR 0013)
- `1783468816` **rental** on/off dates on assets (ADR 0015)

All are **additive** (new collections, new *optional* fields) and were each
applied cleanly on fresh databases during development — none rewrites or drops
existing data. Still: **step 1 first.** After the restart, `verify-live.sh`
should flip from the failures below to `PASS`.

# TrenchNote — Operations Runbook

The five things an operator actually does, with exact commands. Assumes the
DEPLOY.md production shape: app at `/opt/trenchnote/app`, running as the
`trenchnote` system user under systemd, admin via a `deploy` user, Caddy in
front. Commands run as `deploy` on the server.

## Restart the service

```sh
sudo systemctl restart trenchnote     # the app
sudo systemctl restart caddy          # the HTTPS proxy (rarely needed)
sudo systemctl status trenchnote      # is it running, since when
```

Restarting TrenchNote drops no data (SQLite persists everything
immediately) and takes ~2 seconds. Phones retry on their own; offline
queues on phones are unaffected by definition.

## Read the logs

```sh
sudo journalctl -u trenchnote -f        # live tail (Ctrl-C to stop)
sudo journalctl -u trenchnote -n 200    # last 200 lines
sudo journalctl -u trenchnote --since "1 hour ago"
sudo journalctl -u caddy -n 50          # TLS/proxy problems live here
```

PocketBase also keeps request logs in the admin UI (Logs, in the left
nav) — that's where "who called what, when" lives.

## Restore a backup

Two sources, in order of preference:

**From the Litestream replica on the Pi** (seconds-old ledger):
```sh
# on the Pi:
litestream restore -o /tmp/restore/data.db <replica-url-from-litestream.yml>
```
Copy the restored `data.db` into a fresh checkout's `pb_data/` on the
target box, rsync the replica's `storage/` alongside it, start the
service, and check an asset page shows its movement history.

**From a PocketBase zip backup** (nightly): admin UI → Settings → Backups →
⟲ restore on the chosen zip (PocketBase unpacks and restarts itself). Or
manually: stop the service, unzip into `pb_data/`, start.

The drill is the deliverable: a restore you have never rehearsed is a
rumor, not a backup. Rehearse on the Pi or any spare machine — never on
the production box.

## Rotate the shared field-account password

When a phone is lost or someone leaves:

1. Admin UI → collections → **users** → the field account → set a new
   password.
2. Every field phone gets signed out on its next `auth-refresh` (next page
   load with signal) and asks for the new password — that's the whole
   playbook, one password change re-fences the fleet (ADR 0004).
3. Unsynced moves parked on phones are NOT lost: the queue survives
   re-login and drains after sign-in (ADR 0008).

Same procedure for a PM's personal account. The admin (superuser) password
is rotated in the admin UI under Settings → Admins.

## Update PocketBase (or TrenchNote) safely

App updates (pages, migrations) are just:
```sh
cd /opt/trenchnote/app && sudo -u trenchnote git pull
sudo systemctl restart trenchnote     # pending migrations auto-apply
```

**Binary updates get the rehearsal treatment** — a PocketBase version bump
can change REST behavior, which is contract (docs/API.md):

1. Take a backup (admin UI → Settings → Backups → Create, or wait for the
   nightly).
2. On the Pi/staging: restore last night's data into a scratch dir, run
   the NEW binary against it (`--dir` pointing at the scratch copy), click
   through an asset page, a material page, and a move.
3. Read the PocketBase release notes for breaking changes.
4. Then on the server:
   ```sh
   sudo systemctl stop trenchnote
   cd /opt/trenchnote/app
   sudo -u trenchnote rm pocketbase
   sudo -u trenchnote sh -c "PB_VERSION=x.y.z ./scripts/setup.sh"
   sudo systemctl start trenchnote
   ```
5. Update the tested-against version in docs/API.md — that line is a
   promise to API clients.

## Where everything is

| What | Where |
|---|---|
| App + binary | `/opt/trenchnote/app` (git checkout) |
| Live data (the only thing that needs backing up) | `/opt/trenchnote/app/pb_data/` |
| Service unit | `/etc/systemd/system/trenchnote.service` |
| Caddy config | `/etc/caddy/Caddyfile` |
| SSH hardening | `/etc/ssh/sshd_config.d/00-hardening.conf` |
| Firewall | `sudo ufw status verbose` |

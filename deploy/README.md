# TrenchNote — VPS deploy runbook

An ordered, copy-paste checklist for standing up the internet-facing VPS
(the writable instance in the ADR 0006 topology). This is the *how*, in
order; [docs/DEPLOY.md](../docs/DEPLOY.md) is the *why* and the reference
for every command here. Run it top to bottom, on the box, as yourself —
none of this is automated, on purpose: it creates accounts, changes SSH and
firewall settings, and sets passwords, which are decisions a person makes.

## Files in this directory

| File | Goes to | What it is |
|---|---|---|
| `trenchnote.service` | `/etc/systemd/system/` | runs PocketBase on localhost |
| `Caddyfile` | `/etc/caddy/Caddyfile` | HTTPS front door (auto-TLS) |
| `litestream.yml` | `/etc/litestream.yml` | Phase 6 only: replicate to the Pi |
| `preflight.sh` | run from the app dir | proves a fresh checkout works before you cut over |

## Fill these in first

Before you start, know these values (only the domain and the Pi address are
needed for the templates; nothing here is a secret you hand to me):

- **DOMAIN** — the hostname crews will scan, e.g. `trenchnote.acme.com`.
- **VPS_IP** — the VPS's public IP (for the DNS record).
- **PI_TS_ADDR** — the Pi's Tailscale address (Phase 6 only).

---

## Phase 0 — Prerequisites (before touching the box)

- [ ] A VPS provisioned (any $5 tier: 1 CPU, 512 MB, a current Debian/Ubuntu LTS).
- [ ] Your SSH public key installed for the initial `root` login.
- [ ] **DNS A record `DOMAIN → VPS_IP` created and propagated.** Do this now —
      Caddy can't issue a certificate until the name resolves to this box.
      Check with `dig +short DOMAIN` from your laptop.

## Phase 1 — First-boot hardening (do this before the app)

> Full rationale in [DEPLOY.md → First-boot hardening](../docs/DEPLOY.md#first-boot-hardening-any-internet-reachable-box).
> Keep your root session open until you've proven the `deploy` user works.

```sh
apt update && apt upgrade -y
[ -f /var/run/reboot-required ] && reboot        # then reconnect

# non-root admin, key-only
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/deploy && visudo -c
```

**Now, in a second terminal, prove `ssh deploy@VPS_IP` works and `sudo -v`
succeeds — before continuing.** Then disable root + passwords:

```sh
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sshd -t && systemctl reload ssh          # silence from sshd -t = valid
```

Prove root is now refused and `deploy` still works, then the firewall:

```sh
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable                          # note: 8090 is NOT opened — Caddy only
sudo apt install -y unattended-upgrades
```

## Phase 2 — Install TrenchNote

```sh
sudo useradd --system --create-home --home-dir /opt/trenchnote --shell /usr/sbin/nologin trenchnote
sudo -u trenchnote git clone https://github.com/mds08011/trenchnote.git /opt/trenchnote/app
sudo -u trenchnote sh -c "cd /opt/trenchnote/app && ./scripts/setup.sh"   # downloads the binary
```

**Preflight — prove the checkout works before it's load-bearing:**

```sh
sudo -u trenchnote sh -c "cd /opt/trenchnote/app && sh deploy/preflight.sh"
```

Expect `PREFLIGHT PASS`. It boots a throwaway DB on a temp port, applies every
migration, checks all eight collections, and cleans up — your real `pb_data/`
is never touched.

**Install the service** (the unit already targets localhost:8090 for the Caddy
setup — no edit needed):

```sh
sudo cp /opt/trenchnote/app/deploy/trenchnote.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now trenchnote
systemctl status trenchnote               # active (running); migrations auto-applied
curl -fs http://127.0.0.1:8090/api/health # {"message":"API is healthy."...}
```

## Phase 3 — HTTPS with Caddy

Caddy isn't in the base Debian/Ubuntu repos — add its official one first
(current instructions: <https://caddyserver.com/docs/install#debian-ubuntu-raspbian>):

```sh
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo cp /opt/trenchnote/app/deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/trenchnote.example.com/DOMAIN/' /etc/caddy/Caddyfile   # <-- your DOMAIN
sudo systemctl reload caddy
```

Give it ~30s to fetch the certificate, then from your laptop:

```sh
curl -fsI https://DOMAIN/api/health       # HTTP/2 200
```

If cert issuance fails, it's almost always DNS — confirm `dig +short DOMAIN`
returns `VPS_IP` and that ports 80/443 are open (Phase 1 firewall).

## Phase 4 — First-run app config (browser, office-side)

Do this yourself in the admin UI — these are credentials and settings, not
things to script.

1. Open `https://DOMAIN/_/` and **create the superuser (admin) account** — use
   a strong, unique password.
2. **Settings → Application → Application URL** = `https://DOMAIN` (used in the
   off-site move emails' links).
3. **Collections → users** → create the app logins: one shared **field**
   account for crews, personal ones for PMs. (Self-signup is off by design.)
4. *(optional)* **Settings → Mail settings** — configure SMTP for the off-site
   move alerts and send a test. Walkthrough in
   [DEPLOY.md → email setup](../docs/DEPLOY.md#off-site-move-alerts-email-setup).
   No SMTP = moves still work, alerts are skipped with a log line.
5. Seed real `locations`, `items`, `assets`, then print labels from
   `https://DOMAIN/labels.html` **with the Base URL set to `https://DOMAIN`**
   (the QR codes bake in this address — get it right before laminating).

Want realistic demo data to click through first? On the box:
`TN_EMAIL=<a user> TN_PASSWORD=... sh scripts/seed_demo.sh` (see
[DEVELOPER_GUIDE](../docs/DEVELOPER_GUIDE.md#seeding-a-demo-instance)) — but
**don't seed demo data into the instance you'll run for real.**

## Phase 5 — Backups (do not skip)

`pb_data/` is the only thing that must be backed up — it's the ledger.

1. **Admin UI → Settings → Backups** — schedule nightly (`0 3 * * *`), keep 7.
2. **Get them off the box:** either point the same screen at an S3-compatible
   bucket (Backblaze B2 / Wasabi), or rsync `pb_data/backups/` to another
   machine on a cron. Details + the mandatory restore drill in
   [DEPLOY.md → Backups](../docs/DEPLOY.md#backups).
3. **Do the restore drill once, now** — a backup you've never restored is a
   hope, not a backup.

## Phase 6 — (Later) Pi replica + Litestream

Optional, and only once the VPS is proven in production. This is the "make the
VPS expendable" layer from ADR 0006.

1. Install [Tailscale](https://tailscale.com) on both VPS and Pi; note the Pi's
   `100.x.y.z` address → **PI_TS_ADDR**.
2. On the Pi: a `trenchnote` user with key-only SSH and a `~/replica/` dir.
3. On the VPS: install Litestream, copy `deploy/litestream.yml` to
   `/etc/litestream.yml`, fill in **PI_TS_ADDR** and the key path, then
   `sudo systemctl enable --now litestream` and check `litestream replicas`.
4. Add the hourly photo rsync (`pb_data/storage/` → Pi) and run the restore
   drill on the Pi. Full config in
   [DEPLOY.md → reference topology](../docs/DEPLOY.md#the-reference-topology-vps-primary--trailer-pi-replica).

---

## Updating later

```sh
cd /opt/trenchnote/app
sudo -u trenchnote git pull
sudo systemctl restart trenchnote          # pending migrations auto-apply
```

Take a backup before any PocketBase *binary* upgrade, and rehearse it on the Pi
first (Phase 6). Day-two operations live in [RUNBOOK.md](../docs/RUNBOOK.md).

## If cutover goes wrong

Nothing here touches the old setup until Phase 4, so rollback is: stop the new
service (`sudo systemctl stop trenchnote`), and if you'd already moved DNS,
point it back. Because the labels bake in the URL, don't print production
labels until `https://DOMAIN` is the address you've committed to.

# ADR 0003 — Boring ops: systemd + Caddy + built-in backups, no containers

**Status:** accepted · **Date:** 2026-07-09

## Context

TrenchNote's self-hosters range from a project engineer with a Raspberry Pi
in a job trailer to NGOs on a $5 VPS. The default answer in 2026 open source
is "here's a docker-compose.yml" — and for many projects that's right,
because they have four services to coordinate.

TrenchNote is one process. The binary embeds the database, the API, and the
static file server. Wrapping one self-contained binary in a container adds a
runtime to install, image updates to track, volume mounts to get wrong
(losing `pb_data/` to an unmounted volume is *the* classic PocketBase data
loss), and a layer of indirection between the operator and their one file
that matters.

## Decision

The supported deployment story (docs/DEPLOY.md) is deliberately minimal:

- **systemd** runs the binary — start on boot, restart on crash. It is
  already on every target machine.
- **Caddy** in front for internet deployments — two lines of config buys
  automatic HTTPS. On LAN deployments, nothing sits in front at all.
- **PocketBase's built-in backups** (scheduled zips, optional S3 offload)
  instead of an external backup stack, because they snapshot SQLite safely
  and are configured in a settings screen the operator will actually find.
- **No Dockerfile or compose file in the repo.** Nothing stops someone
  containerizing it themselves, but the repo doesn't bless a path that adds
  failure modes for its least-resourced users.

## Consequences

- The full deployment is: clone, run setup script, paste a systemd unit.
  A person who has never deployed anything can follow it.
- Backup/restore is "one folder, one settings screen," and the restore
  drill is documented as a mandatory once.
- We accept: no one-command orchestration for people who standardize on
  containers, and per-distro quirks (init systems other than systemd are on
  the operator).
- Revisit if TrenchNote ever grows a second process — that's the point
  where compose earns its keep, and also a smell that ADR 0001 is being
  violated.

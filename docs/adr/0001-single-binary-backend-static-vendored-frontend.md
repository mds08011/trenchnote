# ADR 0001 — Single-binary backend, static vendored frontend

**Status:** accepted · **Date:** 2026-07-08

## Context

TrenchNote's users open it on cheap smartphones, on dirt lots, on job-site
connections that drop to one bar. Its self-hosters are small contractors and
NGOs whose entire ops budget for tooling is a $5 VPS or a Raspberry Pi in a
job trailer. The maintainer is strong in HTML/CSS and learning backend
development as the project grows.

Those constraints rule out most of the default 2020s stack: an SPA framework
means megabyte payloads and a build pipeline; a conventional
backend-plus-database means two services to install, connect, and back up;
runtime CDN dependencies mean the app breaks exactly where it's needed most —
places with bad connectivity.

## Decision

- **Backend: PocketBase** — one Go binary embedding SQLite, the REST API, the
  admin UI, auth (for later), and the static file server. Deploying TrenchNote
  is: download binary, run binary.
- **Frontend: plain HTML + CSS + Alpine.js**, served by PocketBase from
  `pb_public/`. No build step — the committed files are exactly what ships.
  Each page is self-contained and readable top-to-bottom.
- **All JavaScript vendored into the repo** (`pb_public/vendor/`, ~65 KB
  total). Zero external requests at runtime.
- **Pages talk to `window.location.origin`** — the API and the pages share an
  origin by construction, so one file works on localhost, LAN IP, and a real
  domain without configuration.
- **License: AGPLv3** — self-hosters and NGOs are unaffected; anyone offering
  a modified TrenchNote as a service must publish their changes. The
  maintainer stays sole copyright holder so a paid managed-hosting tier
  remains possible.

## Consequences

- Pages are measured in kilobytes (largest is ~17 KB of source) and work on
  low-end phones with bad reception.
- Self-hosting is a two-command quickstart; backups are "copy `pb_data/`".
- The QR workflow needs no app install: a QR code is just a URL the phone
  camera opens in the browser.
- We accept: some duplicated helper code between pages (the price of
  self-contained files), manual vendored-library upgrades, and coupling to
  PocketBase's migration API across its version bumps.
- Not chosen on purpose: React/Vue + bundler, separate API server + Postgres,
  any runtime CDN dependency, native mobile apps.

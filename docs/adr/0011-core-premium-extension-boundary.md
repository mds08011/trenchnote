# ADR 0011 — Core/premium boundary: premium is a sidecar on the public REST API

**Status:** accepted · **Date:** 2026-07-09
**Amended:** 2026-07-09 — premium repo renamed `trenchnote-lookahead` (the
Lookahead brand now covers the premium tier of both sibling products).
Naming reference only; the boundary is unchanged.
**Provenance:** ported 2026-07-09 from `trenchnote-alt` (ADR 0005 there);
renumbered because this repo's 0005 is the consumption ADR. Updated on
port: the Phase-2 auth lockdown this ADR flagged as an open dependency has
since shipped here (ADR 0004, migration `1783468806`), consumption
movements exist (ADR 0005), and the reservation status field this ADR used
as a hypothetical example has actually landed in core (ADR 0007, migration
`1783468808`) — exactly through the process this ADR prescribes.

## Context

TrenchNote is adopting an **open-core** model: the AGPL core (everything
field crews touch — scan, move, locations, QR labels, offline sync) stays
free forever; office-facing intelligence (cross-site dashboard, rental
burn alerts, reporting/exports, SSO, managed hosting) will be commercially
licensed. The guiding rule: **the ledger is free, insight about the ledger
is paid.**

That forces an architectural decision: through what boundary may premium
code interact with the core? The boundary must keep the license line clean,
keep the core fully functional and Pi-friendly with zero premium code
present, and be usable by any third party — premium gets no private doors.

## Decision

Premium is a **sidecar**: a completely separate application, in a separate
private repository, that talks to the core's PocketBase REST API over HTTP
exactly as any external client would. ("Sidecar" = a second program that
runs alongside the main one and communicates with it over the network,
rather than being loaded into it.)

### The boundary

- Premium may use **only the core's public, documented HTTP API**: the REST
  endpoints PocketBase exposes for the core's collections, the file-URL
  pattern, and PocketBase's realtime subscriptions (SSE — "server-sent
  events," a one-way stream the server pushes updates over, which is how a
  dashboard can see new movements without constant polling).
- Whatever premium can call, **any third party can call the same way**,
  with the same documentation. If premium needs a capability the API lacks,
  the capability is added to the *core* — AGPL, migrated, documented,
  available to everyone — never as a private side channel.
- No shared process, no reading `pb_data/` or the SQLite file, no importing
  core source into premium or premium source into core.

### Contract surface (v1) and stability promise

The following are **contract**: their record shapes, semantics, and rules
cannot change without a new ADR *and* a version bump announced in the
release notes. The full surface is documented in
[docs/API.md](../API.md).

- Collections: `items`, `locations`, `assets`, `movements`, `reservations`
  — list/view for all five; create for `movements` (under its server-side
  shape rule) and `reservations`; update for `assets.current_location`
  (the cache) and `reservations` (lifecycle status, ADR 0007).
- The movements ledger invariants (ADR 0002, as amended by ADR 0005):
  append-only, shape determined by which of `asset`/`item` and
  `from_location`/`to_location` are set, stock derived by summing.
- The file URL pattern `/api/files/{collection}/{recordId}/{filename}`.
- The tag/QR format (ADR 0010) — already contract for printed labels.

Because the API is largely PocketBase's own, the core also documents which
PocketBase version each release is tested against; a PocketBase upgrade
that changes REST behavior is a breaking change.

### Repo layout

- **Core:** this repository, AGPL, complete and self-sufficient. Nothing in
  it references, downloads, bundles, or checks for premium.
- **Premium:** a separate **private** repository (currently
  `trenchnote-lookahead`), commercially licensed, with its own docs, deploy
  story, and release cycle. It depends on the core's *published API
  contract*, never on core internals — so the two version independently.
- Schema changes premium wants are proposed as *core* migrations with their
  own ADR, land in AGPL core for everyone, and only then may premium build
  on them. (Worked example: the reservation `status` field — ADR 0007,
  migration `1783468808` — landed in core, for everyone, first.)

### Auth boundary

- The auth lockdown has shipped (ADR 0004, migration `1783468806`): every
  list/view/create/update rule requires a signed-in user, and public
  self-signup is disabled. Premium therefore authenticates as a **service
  account** — an ordinary PocketBase user record, created by the admin like
  any other account, with its own credentials and only the API-rule
  permissions any authenticated client gets. Premium never holds a
  superuser credential.
- Operational recommendation: give the sidecar its *own* user record
  (e.g. `lookahead@…`) rather than reusing a crew's shared field account, so
  its access can be revoked by changing one password without re-logging
  every field phone — the same lost-phone playbook as ADR 0004.
- Known PocketBase behavior that clients must handle (see the developer
  guide): a missing or expired token on reads returns empty lists with
  HTTP 200, not 401. A sidecar must detect auth failure via
  `auth-refresh`, not response codes — otherwise an expired token looks
  like an empty jobsite.
- SSO is a premium-internal feature for premium's *own* users. It must not
  alter or wrap the core's auth.

### Copyright and contributions

The maintainer currently holds sole copyright in the core, which is what
makes the open-core model legally possible. To preserve that, **external
contributions to core will require either a CLA or a DCO before
acceptance** (CLA = "contributor license agreement," the contributor grants
the maintainer broad rights to their patch; DCO = "developer certificate of
origin," a lighter sign-off asserting the contributor has the right to
submit the code). Which of the two is a deferred decision — but the
requirement is recorded *now*, before the first outside patch, because
accepting even one contribution without it creates a co-copyright-holder
whose permission would be needed for any future licensing move. See
[CONTRIBUTING.md](../../CONTRIBUTING.md).

### Premium must never

1. Gate, degrade, or be required for any core field workflow. A core
   instance with zero premium code present is the fully supported product.
2. Modify the core schema, API rules, or migrations. All schema is core.
3. Write to the movements ledger in v1. Premium is read-only on the ledger;
   its only sanctioned writes are `reservations` records, through the same
   public API and server-side validation as every other client.
4. Become a dependency of core code — no imports, no bundling, no "premium
   detected" branches in core pages.
5. Run inside the core's process or touch `pb_data/` directly.
6. Assume it runs on the Pi. Premium is designed to run *off-box* (office
   PC, VPS, managed cloud) pointed at the core's API, with polite polling
   or SSE — the trailer Pi serves field scans first.
7. Use any endpoint, header, or behavior not in the public docs.

## Alternatives rejected

- **(B) PocketBase hooks / plugin layer** — premium logic loaded into the
  same PocketBase instance (`pb_hooks/` JavaScript, or compiled-in Go
  plugins). Attractive because it keeps one process and enables real
  server-side hook points, but: **Go plugins require compiling a custom
  binary — a build step, violating hard constraint #3 outright.** JS hooks
  keep the single binary but put proprietary files inside the core's
  folder, so "copy one folder" backups and restores would carry premium
  code onto free instances; premium becomes coupled to PocketBase's
  embedded JS VM across version bumps; a premium bug can crash or slow the
  process that serves field scans; and same-process loading is exactly
  where AGPL "combined work" questions get murky (flagged for legal
  review — engineering read: this is the riskiest option license-wise).
- **(C) Shared database, separate app** — premium reads the SQLite file or
  a replica directly. Bypasses every API rule and server-side validation,
  couples premium to internal schema details PocketBase considers private,
  invites the classic corrupt-copy/locking hazards on a Pi's SD card, and
  is not a boundary a third party could use against a hosted instance —
  failing the "same access as premium" rule by construction.
- **Private/undocumented API for premium** — rejected on principle: the
  boundary is only honest if the door premium uses is the door everyone
  gets.

## Consequences

- **Zero core changes now.** The core stays one binary + one folder; free
  self-hosters and the Pi are untouched by premium's existence.
- Premium buyers run a second application (or buy managed hosting, where
  that's our problem, not theirs). That's the cost of the clean line.
- Real-time premium features ride PocketBase's SSE subscriptions or
  polling. If that ever proves insufficient, the escape hatch is a generic
  **outbound webhook feature built into core** — AGPL, for everyone — not
  in-process hooks.
- The published contract collections are now harder to refactor: breaking
  changes need an ADR + announced version bump. (Schema changes already
  required ADRs; this adds the compatibility obligation.)
- Open dependencies remaining at time of port: a CLA-vs-DCO decision is
  due before the first external contribution. (Resolved since the original
  draft: the auth ADR exists — ADR 0004; `docs/API.md` is published.)
- The license analysis above is engineering input, not legal advice. The
  maintainer will confirm the AGPL specifics separately — in particular the
  sidecar's arm's-length status, and whether distributing core and premium
  *together* (a future hardware kit) changes the analysis.

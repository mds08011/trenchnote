# Contributing to TrenchNote

Thanks for your interest! Bug reports, field stories, and doc fixes are
always welcome as issues.

## Before sending code: the sign-off requirement

TrenchNote is open-core ([ADR 0011](docs/adr/0011-core-premium-extension-boundary.md)):
the core is AGPL forever, and the maintainer — an individual, not a company —
holds sole copyright, which is what keeps future licensing decisions possible.

To preserve that, **code contributions require a DCO sign-off**. A DCO
(["developer certificate of origin"](https://developercertificate.org/)) is a
`Signed-off-by: Your Name <you@example.com>` line on each commit — add it with
`git commit -s` — asserting you wrote the patch, or otherwise have the right to
submit it under the project's license. That is the whole of the paperwork.

A CLA ("contributor license agreement") was considered and **declined**
(decided 2026-07-21): the maintainer is not a company positioned to administer
one, and a DCO gives the assurance the sole-copyright model needs without it.

Please still open an issue before a substantial patch so your work doesn't
stall — but the sign-off, not a signed agreement, is all that's required.

## Ground rules for patches

- Read [CLAUDE.md](CLAUDE.md) — the non-negotiable ethos and locked tech
  stack (no build step, no CDN calls, single binary, ledger-derived stock)
  are hard constraints, and a patch that violates one will be declined
  regardless of quality.
- Schema changes ship as migrations in `pb_migrations/`, never as
  hand-edits, and need a short ADR in `docs/adr/`.
- The contract collections are a published API surface
  ([docs/API.md](docs/API.md), and the v1 contract surface in ADR 0011) —
  breaking changes to them need an ADR *and* a contract version bump, not
  just a migration.
- Anything touching the tag/QR format is a breaking change to physical
  printed labels ([ADR 0010](docs/adr/0010-qr-url-and-tag-code-format.md))
  and needs explicit maintainer sign-off.
- Comment the "why," not the "what." Boring, readable code wins.
- Update the affected docs in the same change — see the documentation
  standing orders in [CLAUDE.md](CLAUDE.md).

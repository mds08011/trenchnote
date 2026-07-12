# Contributing to TrenchNote

Thanks for your interest! Bug reports, field stories, and doc fixes are
always welcome as issues.

## Before sending code: the copyright requirement

TrenchNote is open-core ([ADR 0011](docs/adr/0011-core-premium-extension-boundary.md)):
the core is AGPL forever, and the maintainer holds sole copyright, which is
what keeps future licensing decisions possible. To preserve that,
**code contributions require either a CLA or a DCO before they can be
merged**:

- **CLA** ("contributor license agreement") — a short agreement granting
  the maintainer broad rights to your patch.
- **DCO** ("developer certificate of origin") — a `Signed-off-by:` line in
  your commits asserting you have the right to submit the code.

Which of the two TrenchNote will use is **not decided yet**. Until it is,
please open an issue before writing a substantial patch — small fixes can
usually wait for the decision; large ones deserve a conversation first so
your work doesn't stall on paperwork.

## Ground rules for patches

- Read [CLAUDE.md](CLAUDE.md) — the non-negotiable ethos and locked tech
  stack (no build step, no CDN calls, single binary, ledger-derived stock)
  are hard constraints, and a patch that violates one will be declined
  regardless of quality.
- Schema changes ship as migrations in `pb_migrations/`, never as
  hand-edits, and need a short ADR in `docs/adr/`.
- The eight contract collections are a published API surface
  ([docs/API.md](docs/API.md)) — breaking changes to them need an ADR *and*
  a contract version bump, not just a migration.
- Anything touching the tag/QR format is a breaking change to physical
  printed labels ([ADR 0010](docs/adr/0010-qr-url-and-tag-code-format.md))
  and needs explicit maintainer sign-off.
- Comment the "why," not the "what." Boring, readable code wins.
- Update the affected docs in the same change — see the documentation
  standing orders in [CLAUDE.md](CLAUDE.md).

# TrenchNote — Roadmap notes

Not a promise list — a parking lot for ideas that have a decided *shape*
but no build date. The boundary rules come first: anything here still has
to clear the non-goals in [CLAUDE.md](CLAUDE.md) and the free/paid line
of [ADR 0011](docs/adr/0011-core-premium-extension-boundary.md) (the
ledger is free; insight about the ledger can be paid, and lives outside
this repo).

## Future — hosted / premium tier (outside this repo, per ADR 0011)

- **Email digests of upcoming/overdue inspections** (ADR 0014). The free
  core answers "what needs attention" with the dashboard Inspections
  panel and the CSV export; a scheduled "here's your week" email is
  office intelligence, needs operated infrastructure (schedules, SMTP,
  retries), and belongs to the hosted tier. The data it would read is
  already fully public API contract — any subscriber-built script can do
  the same today.
- **Equipment timecard generator** (ADR 0012) — already underway as the
  `bindery-trenchnote` sidecar.

## Explicitly not planned

See the non-goals in [CLAUDE.md](CLAUDE.md) — no workflow (inspection
assignments/approvals/escalations), no vendor integrations, no
accounting, no multi-tenant instances.

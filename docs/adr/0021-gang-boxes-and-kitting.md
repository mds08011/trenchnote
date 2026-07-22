# ADR 0021 — Gang Boxes & Kitting: one-level containment, derived location, audited contents

**Status:** accepted · **Date:** 2026-07-13
**Documented:** 2026-07-21 — this ADR was written retroactively. The feature
shipped in commit `7ce1a4c` (2026-07-13, "add gang boxes and kitting") with
nine code/doc references to "ADR 0021" but no ADR file. This record reconstructs
the decision from the shipped migrations, hooks, shared frontend helper, and
tests, and documents the real rationale — not an invented one. See the
**Implementation notes** section for a defect found and fixed while writing it
(commit `4851401`, 2026-07-21).

## Context

Crews move hand tools in **gang boxes** (a.k.a. job boxes) — a single locked
box holding dozens of loose tools. On a dirt lot a box is moved as one physical
unit: it goes on a truck, lands at a site, and everything inside it goes with
it. Tagging and moving each tool individually would defeat the point — nobody
scans forty wrenches onto a truck.

But TrenchNote's model (ADR 0002) makes each unique asset a record with its own
`current_location`. A box of tools needs two things the base model doesn't give:

1. **Containment** — "these loose assets are inside this box right now," so the
   box moves as one record and its contents follow without per-tool movements.
2. **A periodic reckoning** — "we opened the box and checked the list; item X
   is gone." A gang box is exactly where tools quietly disappear, so the audit
   that finds a missing tool must produce the same visible, ledgered outcome as
   any other lost item, not a note in someone's head.

This must hold to the ethos: no new heavy machinery, derived-not-stored where
possible (ADR 0002), append-only ledgers for facts, and enforcement on the
server so a bad client (or an offline replay, ADR 0008) cannot corrupt it.

## Decision

### Containment is one level deep, marked and cached on `assets`

- `assets.is_container` (bool) marks a box.
- `assets.container_id` (relation→assets) on a **member** points at its box. It
  is a **derived membership cache**, written by the server in response to a
  `container_events` fact — never set directly by a client as the source of
  truth.
- **Exactly one level.** A box cannot be inside a box; a member must point at a
  top-level box (`is_container = true && container_id = ""`); an asset cannot
  contain itself. Gang boxes are not a general nesting tree, and one level is
  all a job box needs. Enforced server-side (see hooks below).

### A contained asset has no independent location — it is derived

A member's `current_location` is cleared to empty while it is in a box. Its
**effective location is its box's `current_location`**, computed at render time
by the shared helper `pb_public/tn-containers.js` (`effectiveLocationId` /
`effectiveLocation`). The helper is shared by the asset page, dashboard,
scanner, and transfer builder precisely so the answer **cannot drift between
surfaces** — the same reason `tn-inspect.js` is shared (ADR 0014).

Consequences of "cleared, not stored":

- A contained asset **cannot be moved independently** — a direct movement on it
  is rejected. You move the box.
- Moving the box creates **no fan-out child movements**; the children derive the
  new location through the box.
- An **old client** that doesn't understand containment sees an empty
  `current_location` and shows the asset as UNASSIGNED — a visible "I don't
  know," never a stale prior site. Failing loud beats lying quietly.

### `container_events` — the append-only membership ledger

One `container_events` row is one membership command **and** its immutable
history: `action` (`added` | `removed`), `asset_id`, `container_id`,
`location`, `by`. The server applies the derived asset state inside the same
transaction as the event:

- **added** — set the member's `container_id` to the box and clear its
  `current_location`. An add is only allowed for a loose, non-container asset,
  at the location where the box currently stands.
- **removed** — write an ordinary `movements` record first (ledger-first, ADR
  0002: from the box's location to the selected drop location), then restore the
  member's `container_id = ""` and `current_location`. Removal is the moment a
  tool re-enters the independent world, so it earns a real movement.

Append-only like every other ledger (ADR 0004): update/delete are
superuser-only. Offline writes carry a pre-generated id (ADR 0008) so replays
are idempotent.

### `kit_audits` — the append-only, client-dated checklist

One `kit_audits` row is one completed checklist: `container_id`, `performed_by`,
`performed_at` (**client-set**, so a Friday audit that syncs Monday stays a
Friday audit — same convention as inspections, ADR 0014/0016), and `results` —
a bounded JSON snapshot `[{ asset_id, result: "present" | "missing" }, …]`.

The server validates that the checklist is **complete and honest**: every
current member appears exactly once, every verdict is `present` or `missing`,
and the list length matches the box's current membership (a checklist built
against a since-changed box is refused — reload and re-audit). Then, **atomically
in the same transaction**, each `missing` member is removed via an ordinary
`container_events` removal whose destination is the **`Missing in transfer`
holding location** seeded by ADR 0020 (`tnmissingxfer01`). A gang-box miss thus
reuses the existing lost-item convention rather than inventing a second
Unknown/Lost concept, and produces exactly what a manual removal would: a
removal event, a movement, and a detached asset now standing at the holding
location.

### Boxes travel on transfer manifests as one line

A gang box rides a transfer manifest (ADR 0020) as **one ordinary asset line**.
Its contents are **never repeated as lines** — they are derived membership, and
the box carries them physically. The manifest layer rejects an attempt to put an
individually-contained child on a manifest line.

### Enforcement lives in model hooks, as a second fence

`pb_hooks/containers.pb.js` holds the containment, membership, and audit
invariants as PocketBase model hooks (`onRecordValidate` on `assets`,
`onRecordCreate` on `container_events` and `kit_audits`). Collection API rules
are the first fence; the hooks are the second, and they also cover PocketBase
**superuser and API-import writes**, which intentionally bypass API rules. The
membership and missing-audit side effects run inside the same record
transaction as the ledger row that triggered them, so a partial kit audit can
never persist.

## Alternatives rejected

- **Arbitrary nesting / a general container tree.** Rejected: a job box holds
  loose tools, not other boxes. Multi-level nesting makes location derivation
  ambiguous and invites an inventory-tree feature TrenchNote is not. One level,
  server-enforced.
- **Store the effective location on the child** (copy the box's location down).
  Rejected: two stored copies drift the instant a box moves. Derive it once, in
  one shared helper, so every surface gives the same answer (ADR 0002).
- **Store box contents as a list on the box.** Rejected: membership is derived
  from the append-only `container_events` ledger; a stored list is a second
  source of truth to keep in sync. Repeating contents as manifest lines is the
  same mistake in another place.
- **A dedicated "lost"/"unknown" location or a stored `missing` status for
  audit misses.** Rejected: ADR 0020 already established the `Missing in
  transfer` holding location and the derived-not-stored discipline for
  shortfalls. A gang-box miss is the same shape; reuse it.
- **Enforce only in API rules.** Rejected: API rules cannot express the
  transactional side effects (write a movement, detach the asset) and do not run
  for superuser/import writes. The invariants that keep location derivation
  honest must hold for every write path, so they live in model hooks.

## Implementation notes (PocketBase JSVM) — read before touching the hooks

Two non-obvious constraints govern `pb_hooks/containers.pb.js`. Both were
found the hard way (they had disabled kit-audit enforcement entirely until
commit `4851401`); do not reintroduce them:

1. **Each hook handler runs in a pooled JSVM runtime that does NOT share the
   file's top-level scope.** A handler that references a file-level
   `function`/`const` throws `ReferenceError`, which PocketBase surfaces as a
   generic `"Failed to create record"` 400 — indistinguishable from a real
   rejection. Every helper a handler needs is therefore defined **inline inside
   that handler**. Do not hoist them back to file scope.
2. **A `json` field read with `record.get()` returns the raw stored bytes** — a
   numeric array that passes `Array.isArray` and is *not* the parsed value.
   Parse the JSON **text** from `record.getString(field)` instead.

**Testing caveat.** Both `scripts/smoke_test.sh` and `tests/gang_boxes.ps1`
assert "rejected" by checking for any non-2xx status. A hook that **crashes**
(e.g. the `ReferenceError` above) therefore *looks* like enforcement while
enforcing nothing. The real guard is the **happy-path** coverage: `smoke_test.sh`
now drives a valid audit and the missing-item detach/park/movement side effect,
so a scoping or parse regression fails a positive assertion, not just a negative
one. Keep that happy-path coverage when changing the hooks.

## Consequences

- A crew moves a full gang box with one scan; its contents follow with zero
  per-tool movements, and every surface agrees on where a contained tool is.
- The box's location is authoritative for its contents; a contained tool on an
  old client reads as UNASSIGNED, never as a stale location.
- A kit audit is real inventory control: a missing tool lands in the ledger at
  the `Missing in transfer` holding location, exactly like any other lost item,
  with a movement and an append-only audit record behind it.
- The Gang Box ledgers (`container_events`, `kit_audits`) are append-only and
  ship with auth-required rules, like every collection (ADR 0004).
- The enforcement fence is JSVM-shaped and fragile in the specific ways noted
  above; the smoke-test gate now covers the path that matters so a regression
  there cannot ship green again.

## Related documents

- [Domain model](../domain-model.md) · [Invariants](../invariants.md)
- ADR 0002 (append-only ledger, derived state), ADR 0004 (auth),
  ADR 0008 (offline-first / idempotent replay), ADR 0020 (transfer manifests
  and the `Missing in transfer` holding location).
- Code: `pb_migrations/1783468822_gang_box_fields.js`,
  `1783468823_create_container_events.js`, `1783468824_create_kit_audits.js`;
  `pb_hooks/containers.pb.js`; `pb_public/tn-containers.js`;
  `scripts/smoke_test.sh` (Gang Box section); `tests/gang_boxes.ps1`.

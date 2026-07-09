# ADR 0004 — Auth: everything locked, one shared field account per crew

**Status:** accepted · **Date:** 2026-07-09

## Context

Phase 1 ran with public API rules for local testing, with every rule marked
`TODO(auth)`. Field testing finished; before TrenchNote can leave the LAN,
the rules must require a signed-in user. The open questions were *who signs
in* and *what stays public*.

Considerations:

- Field crews scan QR codes with gloved hands on shared or personal phones.
  A per-person login on every scan would kill the two-tap move flow — and
  the two-tap move flow is the product.
- Equipment locations are mildly sensitive: a public read API on the
  internet is a shopping list of which unattended site has the scissor
  lifts.
- The maintainer manages accounts; there is no IT department.

## Decision

- **Everything requires auth.** Every list/view/create/update rule is now
  `@request.auth.id != ""` (migration `1783468806`). Nothing about the
  inventory is publicly visible. Movements update/delete stay
  superuser-only — the ledger remains append-only.
- **Crews share one field account, signed in once per phone.** The token
  lives in localStorage; `login.html` + `tn-auth.js` handle it. On every
  page load the token is validated *and renewed* via PocketBase's
  `auth-refresh`, so a phone in regular use effectively never logs out.
  PMs get personal accounts.
- **No self-signup.** `users.createRule` is `null`; the default PocketBase
  behavior (public registration) would have made the lockdown decorative.
  Accounts are created in the admin UI.
- **`moved_by` stays free text.** With a shared account, the signed-in
  identity says which *crew*, not which *person* — the typed name remains
  the person-level answer to "who moved it", same as a paper log.
- **`tn-auth.js` is the one exception to self-contained pages** (ADR 0001):
  auth logic duplicated across five pages would drift, and drift in auth
  code becomes lockouts or holes.

## Consequences

- Printed QR labels keep working: after the one-time sign-in, a scan goes
  straight to the asset page (login preserves the `?next=` deep link).
- A lost phone is handled by changing the shared account's password —
  every phone re-authenticates on next use.
- The rejected alternatives are one rule away if needs change: public
  read-only is "set `listRule`/`viewRule` back to `\"\"`"; per-person
  accountability is "create more users" (and would justify converting
  `moved_by` to a user relation — a future ADR if it happens).
- Gotcha, documented in the developer guide: PocketBase treats a missing or
  invalid token on reads as a *guest*, returning empty lists (200), not
  401. Expiry detection therefore lives in the `auth-refresh` check, not in
  response status codes.

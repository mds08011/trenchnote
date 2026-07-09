/// <reference path="../pb_data/types.d.ts" />
//
// Phase 2: the auth lockdown. This is the migration every TODO(auth)
// comment has been pointing at since Phase 1.
//
// Access model (see docs/adr/0004): EVERYTHING requires a signed-in user.
// Field crews sign in once per phone with a shared field account; PMs get
// personal accounts. Accounts are created by the admin in the admin UI —
// public self-signup is disabled below.
//
// After this migration, the frontend must send an Authorization header on
// every API call (see pb_public/vendor's tn-auth.js and login.html).

migrate((app) => {
  const AUTH = '@request.auth.id != ""';

  // Straightforward collections: every operation needs a logged-in user.
  // Deletes stay null (superuser-only), unchanged from Phase 1.
  for (const name of ["items", "locations", "assets", "reservations"]) {
    const c = app.findCollectionByNameOrId(name);
    c.listRule = AUTH;
    c.viewRule = AUTH;
    c.createRule = AUTH;
    c.updateRule = AUTH;
    app.save(c);
  }

  // movements: keep the either/or shape validation from migration
  // 1783468805 AND require auth. Update/delete remain superuser-only —
  // the ledger stays append-only.
  const movements = app.findCollectionByNameOrId("movements");
  movements.listRule = AUTH;
  movements.viewRule = AUTH;
  movements.createRule =
    AUTH + ' && ' +
    '((asset != "" && item = "" && quantity = 0) || ' +
    '(asset = "" && item != "" && quantity > 0))';
  app.save(movements);

  // users is PocketBase's built-in auth collection. Its default createRule
  // is "" — PUBLIC SELF-SIGNUP — which would make the lockdown decorative:
  // anyone could register themselves an account. Accounts are created by
  // the admin only.
  const users = app.findCollectionByNameOrId("users");
  users.createRule = null;
  app.save(users);
}, (app) => {
  // Rollback to Phase 1 (public rules for local testing)
  for (const name of ["items", "locations", "assets", "reservations"]) {
    const c = app.findCollectionByNameOrId(name);
    c.listRule = "";
    c.viewRule = "";
    c.createRule = "";
    c.updateRule = "";
    app.save(c);
  }
  const movements = app.findCollectionByNameOrId("movements");
  movements.listRule = "";
  movements.viewRule = "";
  movements.createRule =
    '(asset != "" && item = "" && quantity = 0) || ' +
    '(asset = "" && item != "" && quantity > 0)';
  app.save(movements);
  const users = app.findCollectionByNameOrId("users");
  users.createRule = "";
  app.save(users);
});

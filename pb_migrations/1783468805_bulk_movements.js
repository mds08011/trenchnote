/// <reference path="../pb_data/types.d.ts" />
//
// Bulk materials support. tracking_mode=bulk items (500 pipe supports) have
// no individual assets — they move as QUANTITIES in the same ledger:
//
//   asset move:  asset set,  item empty, quantity 0
//   bulk move:   asset empty, item set,  quantity > 0
//
// Stock-on-hand per location is DERIVED by summing bulk movements
// (in minus out) — it is never stored in a column that can drift.
//
// This migration alters the existing movements collection: `asset` becomes
// optional, and `item` + `quantity` are added. The either/or shape is
// enforced server-side in the createRule below, so a malformed record can't
// enter the ledger no matter which client sends it.

migrate((app) => {
  const items = app.findCollectionByNameOrId("items");
  const movements = app.findCollectionByNameOrId("movements");

  // An asset move XOR a bulk move — expressed in PocketBase's rule syntax.
  // Plain field names here refer to the incoming record's values.
  //
  // TODO(auth): before internet exposure this rule must ALSO require a
  // logged-in user, i.e. prepend:  @request.auth.id != "" &&
  movements.createRule =
    '(asset != "" && item = "" && quantity = 0) || ' +
    '(asset = "" && item != "" && quantity > 0)';

  // `asset` was required when every movement was an asset move; bulk moves
  // have no asset, so relax it (the createRule above still guarantees one
  // of asset/item is set).
  const assetField = movements.fields.getByName("asset");
  assetField.required = false;

  movements.fields.add(new Field({
    name: "item",
    type: "relation",
    maxSelect: 1,
    collectionId: items.id,
    cascadeDelete: false,
  }));
  movements.fields.add(new Field({
    name: "quantity",
    type: "number",
    min: 0,
    onlyInt: true, // you can't move half a pipe support
  }));

  app.save(movements);
}, (app) => {
  const movements = app.findCollectionByNameOrId("movements");
  movements.createRule = ""; // back to Phase 1 public-unvalidated
  movements.fields.getByName("asset").required = true;
  movements.fields.removeByName("item");
  movements.fields.removeByName("quantity");
  app.save(movements);
});

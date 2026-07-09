/// <reference path="../pb_data/types.d.ts" />
//
// Consumption: bulk material that gets installed or used up leaves stock
// without landing anywhere. A consume is a bulk movement with a
// from_location and NO to_location — the record stays in the append-only
// ledger forever (who used what, where, when), it just stops counting
// toward stock anywhere.
//
// What a movement means is now fully determined by which locations are set:
//
//                  from_location   to_location
//   receive             empty         set        (delivery from outside)
//   transfer            set           set
//   consume             set           empty      (installed / used up)
//   (neither set                                  rejected)
//
// Asset moves are unchanged: a physical machine always lands somewhere, so
// for them to_location is still mandatory — enforced in the rule below now
// that the field itself is optional.

migrate((app) => {
  const movements = app.findCollectionByNameOrId("movements");

  // Field-level "required" comes off; the createRule takes over the
  // per-shape guarantees.
  movements.fields.getByName("to_location").required = false;

  movements.createRule =
    '@request.auth.id != "" && ' +
    '((asset != "" && item = "" && quantity = 0 && to_location != "") || ' +
    '(asset = "" && item != "" && quantity > 0 && ' +
    '(from_location != "" || to_location != "")))';

  app.save(movements);
}, (app) => {
  // Rollback to the post-lockdown, pre-consumption shape
  const movements = app.findCollectionByNameOrId("movements");
  movements.fields.getByName("to_location").required = true;
  movements.createRule =
    '@request.auth.id != "" && ' +
    '((asset != "" && item = "" && quantity = 0) || ' +
    '(asset = "" && item != "" && quantity > 0))';
  app.save(movements);
});

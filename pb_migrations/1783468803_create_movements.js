/// <reference path="../pb_data/types.d.ts" />
//
// Collection: movements — the append-only ledger and the SOURCE OF TRUTH.
// Every physical move is one record here. `assets.current_location` is just
// a cache derived from this ledger; bulk stock-on-hand is derived by summing
// these records per location.
//
// The movement timestamp is the `created` autodate — no separate field.

migrate((app) => {
  const assets = app.findCollectionByNameOrId("assets");
  const locations = app.findCollectionByNameOrId("locations");

  const movements = new Collection({
    type: "base",
    name: "movements",

    // TODO(auth): before internet exposure, change every "" rule to:
    //   @request.auth.id != ""
    listRule: "",
    viewRule: "",
    createRule: "",
    // APPEND-ONLY: no updates and no deletes, even in Phase 1. A ledger you
    // can rewrite is not a ledger. Corrections are new movement records.
    updateRule: null,
    deleteRule: null,

    fields: [
      { name: "asset", type: "relation", required: true, maxSelect: 1,
        collectionId: assets.id, cascadeDelete: false },

      // from_location is optional: an asset's first-ever movement has no
      // "from" (it appears from outside the system, e.g. a new rental).
      { name: "from_location", type: "relation", maxSelect: 1,
        collectionId: locations.id, cascadeDelete: false },
      { name: "to_location", type: "relation", required: true, maxSelect: 1,
        collectionId: locations.id, cascadeDelete: false },

      // Free text, not a user relation — field crews scan without accounts.
      { name: "moved_by", type: "text" },
      { name: "note", type: "text" },

      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });

  app.save(movements);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("movements"));
});

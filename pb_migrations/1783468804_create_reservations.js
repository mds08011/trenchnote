/// <reference path="../pb_data/types.d.ts" />
//
// Collection: reservations — "I need the total station at Northside by the
// 14th." Schema only for now; the UI comes later.

migrate((app) => {
  const assets = app.findCollectionByNameOrId("assets");

  const reservations = new Collection({
    type: "base",
    name: "reservations",

    // TODO(auth): before internet exposure, change every "" rule to:
    //   @request.auth.id != ""
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: null, // admin-only

    fields: [
      { name: "asset", type: "relation", required: true, maxSelect: 1,
        collectionId: assets.id, cascadeDelete: false },
      { name: "requested_by", type: "text" },
      { name: "needed_by", type: "date" },
      { name: "expected_release", type: "date" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });

  app.save(reservations);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("reservations"));
});

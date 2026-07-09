/// <reference path="../pb_data/types.d.ts" />
//
// Collection: assets — a specific physical instance of a unique item.
// THE scissor lift with tag A003, not scissor lifts in general.
//
// A rented machine is not a special case: it's just an asset with
// ownership=rented plus vendor/po_number filled in. No vendor integrations.

migrate((app) => {
  // Relations reference collections by internal id, so look up the
  // collections created by the two previous migrations.
  const items = app.findCollectionByNameOrId("items");
  const locations = app.findCollectionByNameOrId("locations");

  const assets = new Collection({
    type: "base",
    name: "assets",

    // TODO(auth): before internet exposure, change every "" rule to:
    //   @request.auth.id != ""
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "", // the move flow PATCHes current_location (the cache)
    deleteRule: null, // admin-only

    fields: [
      { name: "item", type: "relation", required: true, maxSelect: 1,
        collectionId: items.id, cascadeDelete: false },

      // The short code printed on the physical QR label (A001, PMP07...).
      // Keep codes 3–5 chars: low QR density scans through mud and scratches.
      { name: "tag_code", type: "text", required: true, presentable: true },

      { name: "serial_number", type: "text" },

      {
        name: "ownership",
        type: "select",
        maxSelect: 1,
        values: ["owned", "rented"],
      },
      { name: "vendor", type: "text" },    // rented only, e.g. "United Rentals"
      { name: "po_number", type: "text" }, // rented only

      // CACHE, not truth. The movements ledger is the source of truth for
      // where an asset is; this field just saves a query on every page load.
      // Always write the movement record first, then update this.
      { name: "current_location", type: "relation", maxSelect: 1,
        collectionId: locations.id, cascadeDelete: false },

      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],

    // One physical label = one asset, enforced by the database itself.
    indexes: [
      "CREATE UNIQUE INDEX `idx_assets_tag_code` ON `assets` (`tag_code`)",
    ],
  });

  app.save(assets);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("assets"));
});

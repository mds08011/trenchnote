/// <reference path="../pb_data/types.d.ts" />
//
// Gang Boxes & Kitting, part 2 of 3 (ADR 0021).
//
// container_events is the append-only membership ledger. Creating an event
// is the ONLY ordinary-client way to change assets.container_id. The server
// hook applies the derived asset cache change in the same transaction.

migrate((app) => {
  const assets = app.findCollectionByNameOrId("assets");
  const locations = app.findCollectionByNameOrId("locations");

  const events = new Collection({
    type: "base",
    name: "container_events",

    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    // One level only, server-enforced. An add starts with a loose,
    // non-container asset. A removal must name the box that currently owns
    // the membership. `location` records where the transition occurred;
    // removal requires it because the asset materializes there.
    createRule: '@request.auth.id != "" && ' +
      'asset_id != container_id && ' +
      'container_id.is_container = true && container_id.container_id = "" && ' +
      'location != "" && ' +
      '(' +
        '(action = "added" && asset_id.is_container = false && ' +
          'asset_id.container_id = "" && location = container_id.current_location) || ' +
        '(action = "removed" && asset_id.container_id = container_id)' +
      ')',
    updateRule: null,
    deleteRule: null,

    fields: [
      { name: "asset_id", type: "relation", required: true, maxSelect: 1,
        collectionId: assets.id, cascadeDelete: false },
      { name: "container_id", type: "relation", required: true, maxSelect: 1,
        collectionId: assets.id, cascadeDelete: false },
      { name: "action", type: "select", required: true, maxSelect: 1,
        values: ["added", "removed"] },
      { name: "by", type: "text" },
      { name: "location", type: "relation", required: true, maxSelect: 1,
        collectionId: locations.id, cascadeDelete: false },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],

    indexes: [
      "CREATE INDEX `idx_container_events_asset_created` ON `container_events` (`asset_id`, `created`)",
      "CREATE INDEX `idx_container_events_container_created` ON `container_events` (`container_id`, `created`)",
    ],
  });

  app.save(events);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("container_events"));
});

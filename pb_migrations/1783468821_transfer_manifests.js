/// <reference path="../pb_data/types.d.ts" />
//
// Transfer manifests (ADR 0020): a two-sided, offline-safe handshake for a
// truckload moving between two TrenchNote locations.
//
// Dispatch does NOT write movements or move stock to a synthetic transit
// location. An in-transit manifest is derived workflow state. Confirmation
// writes the ordinary movements ledger in one PocketBase batch transaction.
// This keeps every existing stock sum unchanged and gives receipt one atomic
// boundary: either every line, movement, asset cache, and final status lands,
// or none of them do.

migrate((app) => {
  const AUTH = '@request.auth.id != ""';
  const users = app.findCollectionByNameOrId("users");
  const items = app.findCollectionByNameOrId("items");
  const assets = app.findCollectionByNameOrId("assets");
  const locations = app.findCollectionByNameOrId("locations");

  const manifests = new Collection({
    type: "base",
    name: "manifests",

    listRule: AUTH,
    viewRule: AUTH,

    // A client may only create a draft, and must record the authenticated
    // account that created it. The from/to facts are locked after create.
    createRule: AUTH + ' && status = "draft" && created_by = @request.auth.id && ' +
      'received_by = "" && from_location != to_location',

    // Forward-only workflow, enforced at the API boundary:
    //   draft -> in_transit -> received | received_with_discrepancies
    // Identity and route facts cannot be rewritten during a transition.
    // The receiving transition must name the account making this request.
    updateRule: AUTH + ' && ' +
      '@request.body.from_location:changed = false && ' +
      '@request.body.to_location:changed = false && ' +
      '@request.body.created_by:changed = false && ' +
      '@request.body.driver_name:changed = false && ' +
      '(' +
        '(status = "draft" && @request.body.status = "in_transit" && ' +
          '@request.body.received_by:changed = false) || ' +
        '(status = "in_transit" && ' +
          '(@request.body.status = "received" || ' +
           '@request.body.status = "received_with_discrepancies") && ' +
          '@request.body.received_by = @request.auth.id)' +
      ')',

    deleteRule: null,

    fields: [
      { name: "from_location", type: "relation", required: true, maxSelect: 1,
        collectionId: locations.id, cascadeDelete: false },
      { name: "to_location", type: "relation", required: true, maxSelect: 1,
        collectionId: locations.id, cascadeDelete: false },
      { name: "created_by", type: "relation", required: true, maxSelect: 1,
        collectionId: users.id, cascadeDelete: false },
      { name: "driver_name", type: "text", required: true },
      { name: "status", type: "select", required: true, maxSelect: 1,
        values: ["draft", "in_transit", "received", "received_with_discrepancies"] },
      { name: "received_by", type: "relation", maxSelect: 1,
        collectionId: users.id, cascadeDelete: false },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],

    indexes: [
      "CREATE INDEX `idx_manifests_status_created` ON `manifests` (`status`, `created`)",
      "CREATE INDEX `idx_manifests_route` ON `manifests` (`from_location`, `to_location`)",
    ],
  });
  app.save(manifests);

  const lines = new Collection({
    type: "base",
    name: "manifest_lines",

    listRule: AUTH,
    viewRule: AUTH,

    // Same union as movements. `quantity` is the bulk-line shape field;
    // sent_quantity is the immutable dispatch fact used at confirmation.
    // They are equal for bulk lines. Asset lines are one whole unit.
    //
    // Gang Boxes (ADR 0021) are ordinary top-level assets and therefore use
    // this one-unit asset branch as a single line. Migration 1783468822
    // tightens it so a contained child cannot also be listed and moved twice.
    createRule: AUTH + ' && manifest.status = "draft" && received_quantity = 0 && ' +
      '(' +
        '(asset != "" && item = "" && quantity = 0 && sent_quantity = 1 && ' +
          'asset.current_location = manifest.from_location) || ' +
        '(asset = "" && item != "" && quantity > 0 && sent_quantity = quantity)' +
      ')',

    // Receiving may set only the count and condition note, only while the
    // parent is in transit, and never above the immutable sent quantity.
    updateRule: AUTH + ' && manifest.status = "in_transit" && ' +
      '@request.body.manifest:changed = false && ' +
      '@request.body.asset:changed = false && ' +
      '@request.body.item:changed = false && ' +
      '@request.body.quantity:changed = false && ' +
      '@request.body.sent_quantity:changed = false && ' +
      '@request.body.received_quantity:isset = true && ' +
      '@request.body.received_quantity >= 0 && ' +
      '@request.body.received_quantity <= sent_quantity',

    // Draft lines may be removed by an authenticated client. Once dispatch
    // happens, the truck list is immutable.
    deleteRule: AUTH + ' && manifest.status = "draft"',

    fields: [
      { name: "manifest", type: "relation", required: true, maxSelect: 1,
        collectionId: manifests.id, cascadeDelete: true },
      { name: "asset", type: "relation", maxSelect: 1,
        collectionId: assets.id, cascadeDelete: false },
      { name: "item", type: "relation", maxSelect: 1,
        collectionId: items.id, cascadeDelete: false },
      { name: "quantity", type: "number", min: 0, onlyInt: true },
      { name: "sent_quantity", type: "number", required: true, min: 1, onlyInt: true },

      // PocketBase number fields use 0 as their empty value. Parent status is
      // therefore the null marker: 0 before receipt means "not confirmed";
      // 0 after receipt means the receiver confirmed none arrived.
      { name: "received_quantity", type: "number", min: 0, onlyInt: true },
      { name: "condition_note", type: "text" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],

    indexes: [
      "CREATE INDEX `idx_manifest_lines_manifest` ON `manifest_lines` (`manifest`)",
      "CREATE INDEX `idx_manifest_lines_asset` ON `manifest_lines` (`asset`)",
      "CREATE INDEX `idx_manifest_lines_item` ON `manifest_lines` (`item`)",
    ],
  });
  app.save(lines);

  // Shortfalls are real inventory in an unresolved state, not consumption.
  // One fixed holding location makes the convention reproducible on every
  // fresh install. Finding an item later is an ordinary movement out of here.
  const missing = new Record(locations);
  missing.set("id", "tnmissingxfer01");
  missing.set("name", "Missing in transfer");
  missing.set("type", "transit");
  app.save(missing);

  // Receipt is a multi-record ledger operation. Enable PocketBase's built-in
  // transactional batch endpoint with a bounded manifest-sized ceiling.
  const settings = app.settings();
  settings.batch.enabled = true;
  if (settings.batch.maxRequests < 250) settings.batch.maxRequests = 250;
  if (settings.batch.timeout < 10) settings.batch.timeout = 10;
  app.save(settings);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("manifest_lines"));
  app.delete(app.findCollectionByNameOrId("manifests"));

  // Safe on an unused/dev rollback. Once a shortfall movement references the
  // location, preserve ledger history instead of deleting referenced data.
  try {
    app.delete(app.findRecordById("locations", "tnmissingxfer01"));
  } catch (_) {
    // Deliberately left in place; destructive rollback is not acceptable.
  }
});

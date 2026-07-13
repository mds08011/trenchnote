/// <reference path="../pb_data/types.d.ts" />
//
// Gang Boxes & Kitting, part 1 of 3 (ADR 0021).
//
// A gang box is an ordinary asset that may contain ordinary, non-container
// assets. Contained assets have NO independent current_location cache: their
// location is derived from their container. Membership writes go through the
// append-only container_events collection created by the next migration.

migrate((app) => {
  const AUTH = '@request.auth.id != ""';
  const assets = app.findCollectionByNameOrId("assets");

  assets.fields.add(new Field({
    name: "is_container",
    type: "bool",
  }));
  assets.fields.add(new Field({
    name: "container_id",
    type: "relation",
    maxSelect: 1,
    collectionId: assets.id,
    cascadeDelete: false,
  }));
  assets.addIndex("idx_assets_container_id", false, "container_id", "");

  // Normal clients may declare a newly-created asset to be a box, but may
  // never create it already inside one. After create, is_container and
  // container_id are changed only as the server-side consequence of an
  // append-only container_event. This makes unledgered membership changes
  // impossible through the REST API. Superuser writes are additionally
  // guarded by pb_hooks/containers.pb.js.
  assets.createRule = AUTH + ' && container_id = ""';
  assets.updateRule = AUTH + ' && ' +
    '@request.body.is_container:isset = false && ' +
    '@request.body.container_id:isset = false';
  app.save(assets);

  // A contained item cannot be moved independently. Move the box (one
  // movement), or remove the item first (the removal creates its own
  // materialization movement). Bulk movement shapes are unchanged.
  const movements = app.findCollectionByNameOrId("movements");
  movements.createRule =
    AUTH + ' && ' +
    '((asset != "" && asset.container_id = "" && item = "" && quantity = 0 && to_location != "") || ' +
    '(asset = "" && item != "" && quantity > 0 && ' +
    '(from_location != "" || to_location != "")))';
  app.save(movements);

  // Scope fence: boxes hold things; they are not reservable kits.
  const reservations = app.findCollectionByNameOrId("reservations");
  reservations.createRule = AUTH + ' && asset.is_container = false && ' +
    '(status = "" || status = "open")';
  app.save(reservations);

  // Transfer manifests carry a whole gang box as the ordinary asset line.
  // A contained child is never a second line: it has no independent place
  // and would otherwise be moved twice at receipt.
  try {
    const lines = app.findCollectionByNameOrId("manifest_lines");
    lines.createRule = AUTH + ' && manifest.status = "draft" && received_quantity = 0 && ' +
      '(' +
        '(asset != "" && asset.container_id = "" && item = "" && quantity = 0 && sent_quantity = 1 && ' +
          'asset.current_location = manifest.from_location) || ' +
        '(asset = "" && item != "" && quantity > 0 && sent_quantity = quantity)' +
      ')';
    app.save(lines);
  } catch (_) {
    // Migration 1783468821 creates manifest_lines. Keeping this guard makes
    // rollback/dev cherry-picks fail soft without changing gang-box rules.
  }
}, (app) => {
  const AUTH = '@request.auth.id != ""';

  try {
    const lines = app.findCollectionByNameOrId("manifest_lines");
    lines.createRule = AUTH + ' && manifest.status = "draft" && received_quantity = 0 && ' +
      '(' +
        '(asset != "" && item = "" && quantity = 0 && sent_quantity = 1 && ' +
          'asset.current_location = manifest.from_location) || ' +
        '(asset = "" && item != "" && quantity > 0 && sent_quantity = quantity)' +
      ')';
    app.save(lines);
  } catch (_) {}

  const reservations = app.findCollectionByNameOrId("reservations");
  reservations.createRule = AUTH + ' && (status = "" || status = "open")';
  app.save(reservations);

  const movements = app.findCollectionByNameOrId("movements");
  movements.createRule =
    AUTH + ' && ' +
    '((asset != "" && item = "" && quantity = 0 && to_location != "") || ' +
    '(asset = "" && item != "" && quantity > 0 && ' +
    '(from_location != "" || to_location != "")))';
  app.save(movements);

  const assets = app.findCollectionByNameOrId("assets");
  assets.createRule = AUTH;
  assets.updateRule = AUTH;
  assets.removeIndex("idx_assets_container_id");
  assets.fields.removeByName("container_id");
  assets.fields.removeByName("is_container");
  app.save(assets);
});

/// <reference path="../pb_data/types.d.ts" />
//
// Gang Boxes & Kitting, part 3 of 3 (ADR 0021).
//
// One kit_audits row is one completed checklist. `results` is a bounded JSON
// snapshot: [{ asset_id, result: "present"|"missing" }, ...]. Keeping the
// checklist together lets the hook validate that every current member was
// explicitly checked and commit all missing-item side effects atomically.

migrate((app) => {
  const assets = app.findCollectionByNameOrId("assets");

  const audits = new Collection({
    type: "base",
    name: "kit_audits",

    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && ' +
      'container_id.is_container = true && container_id.container_id = ""',
    updateRule: null,
    deleteRule: null,

    fields: [
      { name: "container_id", type: "relation", required: true, maxSelect: 1,
        collectionId: assets.id, cascadeDelete: false },
      { name: "performed_by", type: "text" },
      // Client-set: an audit completed offline Friday remains a Friday
      // checklist when it reaches the server Monday. `created` separately
      // records sync/entry time.
      { name: "performed_at", type: "date", required: true },
      { name: "results", type: "json", required: true, maxSize: 200000 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],

    indexes: [
      "CREATE INDEX `idx_kit_audits_container_performed` ON `kit_audits` (`container_id`, `performed_at`)",
    ],
  });

  app.save(audits);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("kit_audits"));
});

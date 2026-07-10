/// <reference path="../pb_data/types.d.ts" />
//
// Certs & inspections, part 2 of 2 (ADR 0014).
//
// Collection: inspections — the THIRD append-only ledger (after movements
// and readings). One record per time a human looked at a thing and judged
// it: pass, fail, or removed from service. These records are what stands
// between the company and an OSHA citation, so the immutability rules are
// exactly the movements rules — never edited, never deleted, a correction
// is a new record and the history is the defense.
//
// Everything the UI shows about compliance is DERIVED from this ledger +
// inspection_requirements at render time (pb_public/tn-inspect.js):
// next-due dates, overdue, the RED/YELLOW/GREEN badge. No stored status
// column that could disagree with the records it summarizes.
//
// inspected_at is CLIENT-SET (date-only, UTC midnight — the reservations
// convention), unlike movements/readings which lean on `created`. Two
// reasons compliance dates can't ride the server clock: an inspection
// done offline Friday must not read as done Monday when it syncs (the
// due-date math would be wrong by the outage), and paper records being
// back-entered need their true dates. `created` still records when the
// record ENTERED the system — both timestamps are kept, and an
// inspected_at far from created is visible evidence of back-entry,
// not something the ledger hides.

migrate((app) => {
  const assets = app.findCollectionByNameOrId("assets");
  const requirements = app.findCollectionByNameOrId("inspection_requirements");

  const inspections = new Collection({
    type: "base",
    name: "inspections",

    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    // Server-side shape rule, movements-style: an inspection either
    // stands alone (ad-hoc, requirement empty) or belongs to a
    // requirement ON THE SAME ASSET — a "monthly visual" pass for the
    // extinguisher can never satisfy the harness.
    createRule: '@request.auth.id != "" && ' +
      '(requirement = "" || requirement.asset = asset)',
    // APPEND-ONLY: corrections are new inspections.
    updateRule: null,
    deleteRule: null,

    fields: [
      { name: "asset", type: "relation", required: true, maxSelect: 1,
        collectionId: assets.id, cascadeDelete: false },

      // Empty = ad-hoc ("pulled it from service, webbing looked cut") —
      // real inspections happen outside the schedule and still belong in
      // the ledger. cascadeDelete false: even if an admin deletes a
      // requirement, its history stays.
      { name: "requirement", type: "relation", maxSelect: 1,
        collectionId: requirements.id, cascadeDelete: false },

      { name: "result", type: "select", required: true, maxSelect: 1,
        values: ["pass", "fail", "removed_from_service"] },

      // Free text, same as movements.moved_by — crews don't have accounts.
      { name: "inspected_by", type: "text" },

      // The date the eyes were on the thing (see header comment).
      { name: "inspected_at", type: "date", required: true },

      { name: "note", type: "text" },

      // Strongly encouraged on fail/removed_from_service — the photo of
      // the cut webbing is the record that ends arguments. Encouraged in
      // the UI (loud warning), never required here: a missing camera
      // must not block pulling unsafe gear from service.
      { name: "photo", type: "file", maxSelect: 1,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] },

      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],

    // Every lookup is "this asset's inspections, newest first".
    indexes: [
      "CREATE INDEX `idx_inspections_asset` ON `inspections` (`asset`)",
    ],
  });

  app.save(inspections);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("inspections"));
});

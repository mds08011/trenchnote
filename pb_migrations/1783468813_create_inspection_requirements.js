/// <reference path="../pb_data/types.d.ts" />
//
// Certs & inspections, part 1 of 2 (ADR 0014).
//
// Collection: inspection_requirements — what an asset OWES and how often.
// "This harness needs a competent-person inspection every 180 days,
// per OSHA 1926.502." One row per recurring obligation on one asset.
//
// This is CATALOG-LIKE data, not a ledger: managers add, rename, and
// re-interval requirements as their safety program changes, so update is
// allowed (same posture as items/locations — delete stays admin-only, so
// a fat thumb can't erase an obligation and the history that hangs off
// it). The LEDGER is the inspections collection (next migration).
//
// interval_days is the ONLY scheduling concept in the whole module.
// Everything else — next-due dates, overdue, the DO-NOT-USE badge — is
// DERIVED at render time from this number plus the inspections ledger
// (see pb_public/tn-inspect.js). Nothing schedules work, assigns
// inspectors, or escalates; TrenchNote shows status, people act on it.

migrate((app) => {
  const assets = app.findCollectionByNameOrId("assets");

  const requirements = new Collection({
    type: "base",
    name: "inspection_requirements",

    // Born after the Phase 2 lockdown — auth required from day one.
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: null, // admin-only, like items/locations

    fields: [
      // Requirements attach to a specific physical thing — THE harness
      // A027, not "harnesses" — because certs and inspection clocks are
      // per-unit facts (each unit has its own history and due dates).
      { name: "asset", type: "relation", required: true, maxSelect: 1,
        collectionId: assets.id, cascadeDelete: false },

      // "Monthly visual", "Annual maintenance", "Pre-use function test".
      { name: "name", type: "text", required: true },

      // Days between passing inspections. Whole days only; PocketBase
      // "required" on a number means non-zero, which is what we want —
      // a requirement with no interval isn't a requirement.
      { name: "interval_days", type: "number", required: true,
        onlyInt: true, min: 1 },

      // Where the obligation comes from: "OSHA 1910.157(e)(2)",
      // "Manufacturer manual §4", "Company SOP-12". Free text — this is
      // a citation for humans, never parsed.
      { name: "reference", type: "text" },

      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],

    // Every lookup is "this asset's requirements".
    indexes: [
      "CREATE INDEX `idx_inspreq_asset` ON `inspection_requirements` (`asset`)",
    ],
  });

  app.save(requirements);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("inspection_requirements"));
});

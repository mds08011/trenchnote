/// <reference path="../pb_data/types.d.ts" />
//
// Collection: items — the catalog. What a thing IS ("19' Scissor Lift",
// "Baker Scaffold Set"), not a specific physical one (that's `assets`).
//
// How these files work: PocketBase applies every pending file in
// pb_migrations/ automatically at startup, in filename order (hence the
// timestamp prefixes). The first function is the migration, the second is
// the rollback used by `./pocketbase migrate down`.

migrate((app) => {
  const items = new Collection({
    type: "base",
    name: "items",

    // ---- Phase 1 API rules ------------------------------------------------
    // In PocketBase rules, "" (empty string) means PUBLIC — anyone can call
    // it — while null means LOCKED to admins only.
    //
    // TODO(auth): before TrenchNote is exposed to the internet, change every
    // "" rule below to: @request.auth.id != ""
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: null, // deletes stay admin-only even in Phase 1

    fields: [
      // `presentable` just tells the admin UI to show this field when the
      // record appears inside a relation dropdown.
      { name: "name", type: "text", required: true, presentable: true },
      { name: "description", type: "text" },
      { name: "category", type: "text" }, // e.g. "Access", "Survey", "Pipe Supports"

      // unique = a specific serial-numbered thing, tracked as an `asset`.
      // bulk   = a commodity (500 pipe supports), tracked as quantities
      //          in the movements ledger.
      {
        name: "tracking_mode",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["unique", "bulk"],
      },

      { name: "photo", type: "file", maxSelect: 1,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] },

      // PocketBase 0.23+ no longer adds created/updated automatically —
      // they are explicit "autodate" fields now.
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });

  app.save(items);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("items"));
});

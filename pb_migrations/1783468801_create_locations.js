/// <reference path="../pb_data/types.d.ts" />
//
// Collection: locations — anywhere an asset can be: a job site, the staging
// yard, a warehouse, or "transit" (on a truck between sites).

migrate((app) => {
  const locations = new Collection({
    type: "base",
    name: "locations",

    // TODO(auth): before internet exposure, change every "" rule to:
    //   @request.auth.id != ""
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: null, // admin-only

    fields: [
      { name: "name", type: "text", required: true, presentable: true },
      {
        name: "type",
        type: "select",
        maxSelect: 1,
        values: ["jobsite", "yard", "warehouse", "transit"],
      },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });

  app.save(locations);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("locations"));
});

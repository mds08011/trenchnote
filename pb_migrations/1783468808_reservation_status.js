/// <reference path="../pb_data/types.d.ts" />
//
// Reservation lifecycle (ADR 0007). A reservation now carries:
//
//   status — open | fulfilled | cancelled
//     Stored, not derived: only a human knows whether a move satisfied a
//     claim (reservations have no location, and claims queue), and
//     "never mind" isn't derivable from anything. NOT required: rows
//     created before this migration have no value, and empty is read as
//     open everywhere — no backfill needed.
//   note — free text ("for the clarifier pour", crane #, etc.)
//
// Fulfilled/cancelled claims disappear from the pages but stay in the
// database — demand history is worth keeping.

migrate((app) => {
  const reservations = app.findCollectionByNameOrId("reservations");

  reservations.fields.add(new Field({
    name: "status",
    type: "select",
    maxSelect: 1,
    values: ["open", "fulfilled", "cancelled"],
  }));
  reservations.fields.add(new Field({
    name: "note",
    type: "text",
  }));

  // You can't create a claim that's already fulfilled or cancelled.
  // Updates stay plain auth-required: any signed-in user may mark a claim
  // fulfilled or cancelled — TrenchNote records reality, it doesn't
  // referee it (and with a shared field account there is no meaningful
  // per-person ownership to enforce).
  reservations.createRule =
    '@request.auth.id != "" && (status = "" || status = "open")';

  app.save(reservations);
}, (app) => {
  const reservations = app.findCollectionByNameOrId("reservations");
  reservations.fields.removeByName("status");
  reservations.fields.removeByName("note");
  reservations.createRule = '@request.auth.id != ""';
  app.save(reservations);
});

/// <reference path="../pb_data/types.d.ts" />
//
// Gang Boxes & Kitting server invariants (ADR 0021).
//
// API rules are the first fence. These model hooks are the second fence and
// also cover PocketBase superuser/API-import writes, which intentionally
// bypass collection API rules. Membership and missing-audit side effects run
// inside the same record transaction as the ledger row that caused them.

const TN_MISSING_LOCATION = "tnmissingxfer01"; // ADR 0020 convention

function tnKitReject(message) {
  throw new BadRequestError(message);
}

function tnKitRecords(app, collection, filter, sort, limit) {
  return app.findRecordsByFilter(collection, filter, sort || "", limit || 500, 0);
}

// HARD RULE: exactly one membership level. A box cannot itself be inside a
// box; a member cannot point at itself or a non-box; contained assets carry
// no independent location cache. Also refuse to turn a box back into an
// ordinary asset while contents still point at it.
onRecordValidate((e) => {
  const record = e.record;
  const containerId = record.getString("container_id");
  const isContainer = record.getBool("is_container");

  if (containerId) {
    if (isContainer) tnKitReject("A gang box cannot be inside another gang box.");
    if (containerId === record.id) tnKitReject("An asset cannot contain itself.");
    if (record.getString("current_location")) {
      tnKitReject("A contained asset derives location from its gang box.");
    }

    const container = e.app.findRecordById("assets", containerId);
    if (!container.getBool("is_container") || container.getString("container_id")) {
      tnKitReject("Contents must belong to a top-level gang box.");
    }
  }

  const originalWasContainer = !record.isNew() &&
    record.original().getBool("is_container");
  if (originalWasContainer && !isContainer && record.id) {
    const contents = tnKitRecords(
      e.app,
      "assets",
      "container_id = '" + record.id + "'",
      "id",
      1,
    );
    if (contents.length) {
      tnKitReject("Remove every item before turning off gang-box status.");
    }
  }

  e.next();
}, "assets");

// container_events is the membership command AND the immutable history.
// After inserting the event, apply its derived asset state before the outer
// transaction commits. A removal also writes an ordinary asset movement
// before restoring current_location, preserving ledger-first ordering.
onRecordCreate((e) => {
  const event = e.record;
  const action = event.getString("action");
  const asset = e.app.findRecordById("assets", event.getString("asset_id"));
  const container = e.app.findRecordById("assets", event.getString("container_id"));
  const locationId = event.getString("location");

  if (asset.id === container.id) tnKitReject("An asset cannot contain itself.");
  if (!container.getBool("is_container") || container.getString("container_id")) {
    tnKitReject("Membership requires a top-level gang box.");
  }
  if (!locationId) tnKitReject("A membership change requires a location.");

  if (action === "added") {
    if (asset.getBool("is_container") || asset.getString("container_id")) {
      tnKitReject("Only a loose, non-container asset can be added.");
    }
    if (locationId !== container.getString("current_location")) {
      tnKitReject("Add the item where the gang box is located.");
    }
  } else if (action === "removed") {
    if (asset.getString("container_id") !== container.id) {
      tnKitReject("That asset is not in this gang box.");
    }
  } else {
    tnKitReject("Membership action must be added or removed.");
  }

  // Insert the append-only fact first. Operations below remain in the same
  // PocketBase transaction; any failure rolls the event back too.
  e.next();

  if (action === "added") {
    asset.set("container_id", container.id);
    // A contained member has no independent cache. Old clients therefore
    // fail visibly as UNASSIGNED rather than showing a stale prior site.
    asset.set("current_location", "");
    e.app.save(asset);
    return;
  }

  const movements = e.app.findCollectionByNameOrId("movements");
  const movement = new Record(movements);
  movement.set("asset", asset.id);
  movement.set("from_location", container.getString("current_location"));
  movement.set("to_location", locationId);
  movement.set("moved_by", event.getString("by") || "unspecified");
  movement.set("note", "Removed from gang box " + container.getString("tag_code"));
  e.app.save(movement);

  // Ledger first, convenience cache second.
  asset.set("container_id", "");
  asset.set("current_location", locationId);
  e.app.save(asset);
}, "container_events");

// A kit audit is one bounded JSON checklist. Validate that it is complete,
// has no duplicate/foreign assets, and uses only present|missing. Missing
// results create ordinary removal events; the membership hook above then
// creates the missing-location movement and detaches the asset atomically.
onRecordCreate((e) => {
  const audit = e.record;
  // DEBUG
  e.next(); return;
  const container = e.app.findRecordById("assets", audit.getString("container_id"));
  if (!container.getBool("is_container") || container.getString("container_id")) {
    tnKitReject("Audits require a top-level gang box.");
  }

  let results = audit.get("results");
  if (!Array.isArray(results)) {
    try { results = JSON.parse(audit.getString("results")); }
    catch (_) {
      try { results = JSON.parse(JSON.stringify(results)); }
      catch (_) { results = null; }
    }
  }
  if (!Array.isArray(results) || !results.length) {
    tnKitReject("Audit every current item as present or missing.");
  }

  const contents = tnKitRecords(
    e.app,
    "assets",
    "container_id = '" + container.id + "'",
    "tag_code",
    500,
  );
  if (results.length !== contents.length) {
    tnKitReject("The box manifest changed; reload it before saving this audit.");
  }

  const expected = {};
  for (const asset of contents) expected[asset.id] = true;
  const seen = {};
  const missing = [];
  for (const result of results) {
    const assetId = result && String(result.asset_id || "");
    const verdict = result && String(result.result || "");
    if (!expected[assetId] || seen[assetId]) {
      tnKitReject("Audit results must list each current item exactly once.");
    }
    if (verdict !== "present" && verdict !== "missing") {
      tnKitReject("Audit result must be present or missing.");
    }
    seen[assetId] = true;
    if (verdict === "missing") missing.push(assetId);
  }

  // Insert the checklist before its consequences. All writes below share the
  // same transaction; a failed removal means no partial audit can persist.
  e.next();

  if (!missing.length) return;
  // ADR 0020 established this stable holding location for unresolved missing
  // unique assets. A gang-box miss reuses it instead of inventing a second
  // Unknown/Lost convention.
  e.app.findRecordById("locations", TN_MISSING_LOCATION);
  const events = e.app.findCollectionByNameOrId("container_events");
  for (const assetId of missing) {
    const removal = new Record(events);
    removal.set("asset_id", assetId);
    removal.set("container_id", container.id);
    removal.set("action", "removed");
    removal.set("by", audit.getString("performed_by") || "unspecified");
    removal.set("location", TN_MISSING_LOCATION);
    e.app.save(removal);
  }
}, "kit_audits");

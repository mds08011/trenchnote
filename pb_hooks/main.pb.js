/// <reference path="../pb_data/types.d.ts" />
//
// TrenchNote server hooks.
//
// One job (ADR 0012): the moment a movement leaves a location that has a
// notify_email, email that PM — the losing site is the one that gets
// surprised; the receiving site initiated the scan. This is the digital
// version of seeing the truck pull away, and it lives in free core.
//
// Rules of the house:
//   - BEST-EFFORT, NEVER BLOCKING. The movement is already committed by
//     the time this hook runs (AfterCreateSuccess), and every line here
//     is wrapped so a mail problem can only ever produce a log line —
//     the scan always succeeds.
//   - Uses PocketBase's BUILT-IN mailer. SMTP is configured once in the
//     admin UI (Settings → Mail settings — see docs/DEPLOY.md); no SMTP
//     configured = one quiet log line per skipped notice, nothing more.
//   - One email per movement, to the FROM location only. Consumes (bulk
//     used up on site, no to_location) don't notify — material installed
//     ON the site never left it.

onRecordAfterCreateSuccess((e) => {
  try {
    const from = e.record.get("from_location");
    const to = e.record.get("to_location");

    // Receives (no from), consumes (no to): nothing left a site.
    if (from && to && from !== to) {
      const fromLoc = e.app.findRecordById("locations", from);
      const notify = fromLoc.getString("notify_email");

      if (notify) {
        if (!e.app.settings().smtp.enabled) {
          // The fact is stored either way; only the notice is skipped.
          e.app.logger().info(
            "TrenchNote notify: SMTP not configured — skipped off-site email",
            "movement", e.record.id,
            "from", fromLoc.getString("name"),
            "to_address", notify,
          );
        } else {
          const toLoc = e.app.findRecordById("locations", to);

          // Resolve what moved: an asset (tag code + item name) or a
          // bulk quantity (item name + count).
          let itemName = "Equipment";
          let tagLine = "";
          let qtyLine = "";
          let link = e.app.settings().meta.appURL;
          if (e.record.get("asset")) {
            const asset = e.app.findRecordById("assets", e.record.get("asset"));
            const item = e.app.findRecordById("items", asset.get("item"));
            itemName = item.getString("name");
            tagLine = "  Tag:   " + asset.getString("tag_code") + "\n";
            link += "/asset.html?code=" + encodeURIComponent(asset.getString("tag_code"));
          } else {
            const item = e.app.findRecordById("items", e.record.get("item"));
            itemName = item.getString("name");
            qtyLine = "  Qty:   " + e.record.get("quantity") + "\n";
            link += "/material.html?id=" + item.id;
          }

          const message = new MailerMessage({
            from: {
              address: e.app.settings().meta.senderAddress,
              name: e.app.settings().meta.senderName,
            },
            to: [{ address: notify }],
            subject: "[TrenchNote] " + itemName + " moved OFF " + fromLoc.getString("name"),
            // Plain text on purpose: reads everywhere, spam filters like
            // it, and a PM in the field needs facts, not layout.
            text:
              itemName + " just moved off " + fromLoc.getString("name") + ".\n" +
              "\n" +
              tagLine +
              "  From:  " + fromLoc.getString("name") + "\n" +
              "  To:    " + toLoc.getString("name") + "\n" +
              qtyLine +
              "  By:    " + (e.record.getString("moved_by") || "not recorded") + "\n" +
              "  When:  " + e.record.getString("created") + " (UTC)\n" +
              "\n" +
              link + "\n" +
              "\n" +
              "Automatic notice from TrenchNote — " + fromLoc.getString("name") +
              " lists this address as its off-site contact.\n",
          });

          e.app.newMailClient().send(message);
          e.app.logger().info(
            "TrenchNote notify: off-site email sent",
            "movement", e.record.id,
            "item", itemName,
            "from", fromLoc.getString("name"),
            "to", toLoc.getString("name"),
            "to_address", notify,
          );
        }
      }
    }
  } catch (err) {
    // A notification can never break (or un-succeed) the movement write.
    e.app.logger().warn(
      "TrenchNote notify: off-site email failed",
      "movement", e.record.id,
      "error", String(err),
    );
  }

  e.next();
}, "movements");

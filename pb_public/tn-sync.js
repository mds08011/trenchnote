// TrenchNote offline sync — the write queue (ADR 0008).
//
// When a move can't reach the server, it's saved here (IndexedDB) and
// replayed in order when signal returns. Rules of the house:
//
//   - NEVER silently hold field data: a fixed badge shows the pending
//     count on every page, and failures turn it red until a human deals
//     with them.
//   - Replay is FIFO per phone, so this phone's chain of moves stays
//     internally consistent (from -> to -> from -> to).
//   - Every queued movement carries a PRE-GENERATED PocketBase record id.
//     If a sync retry re-sends a movement the server already committed
//     (network died after commit, before the response), PocketBase
//     rejects the duplicate id — and we treat that as "already synced".
//     That makes the whole queue idempotent: no doubled ledger entries.
//   - A validation rejection (asset deleted, malformed) can never
//     succeed: the entry is parked as "failed", shown with its reason,
//     and only an explicit human tap discards it. Later entries still
//     sync — each movement is a self-contained ledger event.
//   - Auth expired? Sync pauses and the badge says so. The queue lives in
//     IndexedDB and survives re-login.
//
// Raw IndexedDB, no library: one store, four operations (~40 lines).
// See the developer guide before reaching for a wrapper lib.

const TNSync = {

  // ---- IndexedDB plumbing ---------------------------------------------------
  _db: null,
  db() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('trenchnote', 1);
      req.onupgradeneeded = () => {
        // seq auto-increments = the replay order
        req.result.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true });
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },
  // Wrap one store operation in a promise-completing transaction
  op(mode, fn) {
    return this.db().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('queue', mode);
      const out = fn(tx.objectStore('queue'));
      tx.oncomplete = () => resolve(out.result !== undefined ? out.result : undefined);
      tx.onerror = () => reject(tx.error);
    }));
  },
  qAdd(entry)  { return this.op('readwrite', (s) => s.add(entry)); },
  qAll()       { return this.op('readonly',  (s) => s.getAll()); },
  qPut(entry)  { return this.op('readwrite', (s) => s.put(entry)); },
  qDelete(seq) { return this.op('readwrite', (s) => s.delete(seq)); },

  // ---- Enqueueing -----------------------------------------------------------
  // PocketBase record ids: 15 chars, a-z0-9. Generated at enqueue time so
  // retries are idempotent (see header comment).
  genId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(15)))
      .map((b) => chars[b % 36]).join('');
  },

  // A queued op is a semantic action, not raw HTTP. `movement` is the
  // request body for POST /api/collections/movements/records; assetPatch
  // (asset moves only) is the current_location cache update that must
  // follow it. `label` is what a human sees on the badge/failure list.
  // (Entries with no `kind` are movements — the shape that predates
  // readings; the sync loop treats missing kind as 'movement'.)
  //
  // `files` (optional, ADR 0013) carries a delivery's photo evidence:
  // { packing_slip: File|null, photos: [File, ...] }. Stored as Blobs —
  // IndexedDB holds files natively — and replayed as multipart, exactly
  // like reading photos. Entries without files replay as JSON, unchanged.
  async enqueue(movement, assetPatch, label, files) {
    // Keep a caller-supplied id: if the live POST died AFTER the server
    // committed, replaying under the SAME id is what makes the retry
    // idempotent. Only mint one for callers that didn't.
    movement.id = movement.id || this.genId();
    // Rebuild `files` as a PLAIN object before it touches IndexedDB.
    // Callers hand us Alpine component state, and Alpine's reactivity
    // wraps arrays in Proxies — which structured clone rejects with
    // DataCloneError, losing the queued delivery. (Bare File objects
    // pass through reactivity unwrapped, so they're safe as-is.)
    const plainFiles = files
      ? { packing_slip: files.packing_slip || null,
          photos: Array.from(files.photos || []) }
      : null;
    await this.qAdd({
      movement,
      assetPatch: assetPatch || null,   // { assetId, toLocation } or null for bulk
      files: plainFiles,
      label,
      queuedAt: new Date().toISOString(),
      status: 'pending',
      error: '',
    });
    await this.renderBadge();
  },

  // A meter reading captured with no signal (ADR 0012). Same idempotency
  // contract as movements (pre-generated id); the gauge photo rides
  // along as a Blob — IndexedDB stores files natively, and the replay
  // sends multipart form data.
  async enqueueReading(reading, photo, label) {
    reading.id = reading.id || this.genId();
    await this.qAdd({
      kind: 'reading',
      reading,
      photo: photo || null,
      label,
      queuedAt: new Date().toISOString(),
      status: 'pending',
      error: '',
    });
    await this.renderBadge();
  },

  // An inspection logged with no signal (ADR 0014). Identical contract to
  // readings: pre-generated id for idempotent replay, optional photo kept
  // as a Blob, multipart on the wire. inspected_at was set at capture
  // time, so a Friday inspection syncing Monday still carries Friday —
  // the due-date math never shifts by the outage.
  async enqueueInspection(inspection, photo, label) {
    inspection.id = inspection.id || this.genId();
    await this.qAdd({
      kind: 'inspection',
      inspection,
      photo: photo || null,
      label,
      queuedAt: new Date().toISOString(),
      status: 'pending',
      error: '',
    });
    await this.renderBadge();
  },

  // Gang-box membership is one append-only event. The server hook applies
  // the asset membership/cache change and a removal's materialization
  // movement inside the event transaction, so one queued POST is the whole
  // semantic action (ADR 0021).
  async enqueueContainerEvent(event, label) {
    event.id = event.id || this.genId();
    await this.qAdd({
      kind: 'container_event',
      event,
      label,
      queuedAt: new Date().toISOString(),
      status: 'pending',
      error: '',
    });
    await this.renderBadge();
  },

  // One kit_audits row is a complete checklist. Missing-item removals and
  // movements are server-side transactional consequences of this POST.
  async enqueueKitAudit(audit, label) {
    audit.id = audit.id || this.genId();
    await this.qAdd({
      kind: 'kit_audit',
      audit,
      label,
      queuedAt: new Date().toISOString(),
      status: 'pending',
      error: '',
    });
    await this.renderBadge();
  },

  // A transfer-manifest dispatch or receipt (ADR 0020). `requests` is the
  // body array for PocketBase's transactional POST /api/batch endpoint.
  // The semantic batch is stored BEFORE any network attempt, so a response
  // lost after commit cannot lose the user's submit.
  //
  // `verify` identifies the parent manifest and the status that proves the
  // whole transaction committed. This is the batch equivalent of a movement's
  // duplicate pre-generated id: an atomic batch either committed every request
  // (including the terminal status) or committed none of them.
  async enqueueBatch(requests, verify, snapshot, label) {
    await this.qAdd({
      kind: 'batch',
      requests: JSON.parse(JSON.stringify(requests)),
      verify: verify || null, // { manifestId, statuses: [...] }
      snapshot: snapshot || null, // lets manifest.html render a local unsynced draft
      label,
      queuedAt: new Date().toISOString(),
      status: 'pending',
      error: '',
    });
    await this.renderBadge();
  },

  // Local lookup used by manifest.html when the sender built/received with no
  // signal and the server record cannot exist yet. This is presentation only;
  // the queued batch remains the write authority on this phone.
  async pendingManifest(manifestId) {
    const entries = await this.qAll();
    // Newest wins: an offline draft can have a later dispatch/receipt batch
    // queued behind it, and the page should render the furthest local truth.
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.kind === 'batch' && e.snapshot && e.snapshot.manifest &&
          e.snapshot.manifest.id === manifestId) return e;
    }
    return null;
  },

  // True when a TN.fetch/fetch rejection means "no network" (as opposed
  // to a server response we didn't like, which our code throws as Error).
  isNetworkError(err) {
    return err instanceof TypeError;
  },

  // ---- Replay ---------------------------------------------------------------
  _syncing: false,
  _authPaused: false,   // true = queue is waiting on a re-login, not on signal
  async sync() {
    if (this._syncing || !localStorage.getItem('tn_token')) return;
    const entries = (await this.qAll()).filter((e) => e.status === 'pending');
    if (!entries.length) { await this.renderBadge(); return; }

    this._syncing = true;
    await this.renderBadge('syncing');
    try {
      // Preflight: one auth-refresh tells us whether the token is still
      // good. This matters because PocketBase answers BOTH a dead token
      // and a validation problem with 400 on creates — without this
      // check we couldn't tell "sign in again" from "this record is
      // bad". (It also slides the session forward, same as page loads.)
      let refresh;
      try {
        refresh = await fetch(window.location.origin + '/api/collections/users/auth-refresh', {
          method: 'POST',
          headers: { 'Authorization': localStorage.getItem('tn_token') }
        });
      } catch (err) {
        return; // still offline — badge stays on pending, retry later
      }
      if (!refresh.ok) {
        this._authPaused = true;   // badge: "sign in to sync" — queue is safe
        return;
      }
      this._authPaused = false;
      localStorage.setItem('tn_token', (await refresh.json()).token);

      for (const entry of entries) {
        try {
          let res;
          if (entry.kind === 'container_event') {
            res = await fetch(window.location.origin + '/api/collections/container_events/records', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': localStorage.getItem('tn_token')
              },
              body: JSON.stringify(entry.event)
            });
          } else if (entry.kind === 'kit_audit') {
            res = await fetch(window.location.origin + '/api/collections/kit_audits/records', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': localStorage.getItem('tn_token')
              },
              body: JSON.stringify(entry.audit)
            });
          } else if (entry.kind === 'batch') {
            // PocketBase executes this array in one SQLite transaction. No
            // request can leave behind a half-received manifest.
            res = await fetch(window.location.origin + '/api/batch', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': localStorage.getItem('tn_token')
              },
              body: JSON.stringify({ requests: entry.requests })
            });
          } else if (entry.kind === 'reading') {
            // Readings replay as multipart so the queued gauge photo
            // (stored as a Blob) can ride along; PocketBase casts the
            // string form values to the schema types.
            const fd = new FormData();
            for (const k in entry.reading) fd.append(k, entry.reading[k]);
            if (entry.photo) fd.append('photo', entry.photo, 'gauge.jpg');
            res = await fetch(window.location.origin + '/api/collections/readings/records', {
              method: 'POST',
              headers: { 'Authorization': localStorage.getItem('tn_token') },
              body: fd
            });
          } else if (entry.kind === 'inspection') {
            // Inspections (ADR 0014) replay exactly like readings:
            // multipart so the evidence photo Blob rides along. The
            // body already carries its client-set inspected_at, so the
            // compliance date survives the offline gap.
            const fd = new FormData();
            for (const k in entry.inspection) fd.append(k, entry.inspection[k]);
            if (entry.photo) fd.append('photo', entry.photo, 'inspection.jpg');
            res = await fetch(window.location.origin + '/api/collections/inspections/records', {
              method: 'POST',
              headers: { 'Authorization': localStorage.getItem('tn_token') },
              body: fd
            });
          } else if (entry.files &&
                     (entry.files.packing_slip || (entry.files.photos || []).length)) {
            // A movement with photo evidence riding along (a delivery
            // logged offline — ADR 0013): multipart, like readings.
            // Null fields are SKIPPED, not appended — FormData would
            // stringify null into the literal text "null".
            const fd = new FormData();
            for (const k in entry.movement) {
              if (entry.movement[k] !== null && entry.movement[k] !== undefined) {
                fd.append(k, entry.movement[k]);
              }
            }
            if (entry.files.packing_slip) {
              fd.append('packing_slip', entry.files.packing_slip, 'slip.jpg');
            }
            for (const p of (entry.files.photos || [])) {
              fd.append('photos', p, 'photo.jpg');
            }
            res = await fetch(window.location.origin + '/api/collections/movements/records', {
              method: 'POST',
              headers: { 'Authorization': localStorage.getItem('tn_token') },
              body: fd
            });
          } else {
            // No kind = a movement (the original entry shape)
            res = await fetch(window.location.origin + '/api/collections/movements/records', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': localStorage.getItem('tn_token')
              },
              body: JSON.stringify(entry.movement)
            });
          }

          let ok = res.ok;
          if (!ok && entry.kind === 'batch' && entry.verify) {
            // If the connection died after commit, replay sees duplicate
            // pre-generated ids and the batch returns 400. Because the batch
            // is atomic, a live parent status in the expected set proves every
            // request landed on the earlier attempt.
            const verifyUrl = window.location.origin +
              '/api/collections/manifests/records/' + entry.verify.manifestId +
              '?fields=id,status&_tn_verify=' + Date.now();
            const check = await fetch(verifyUrl, {
              headers: { 'Authorization': localStorage.getItem('tn_token') }
            });
            if (check.ok) {
              const record = await check.json();
              ok = (entry.verify.statuses || []).includes(record.status);
            }
          }
          if (!ok && res.status === 400) {
            // Duplicate pre-generated id = the server committed this one
            // on an earlier attempt. That's a success, not a failure.
            const data = await res.json().catch(() => ({}));
            if (entry.kind !== 'batch' && data.data && data.data.id) {
              ok = true;
            } else {
              // Genuine validation rejection — park it, keep going.
              entry.status = 'failed';
              entry.error = data.message || ('rejected (' + res.status + ')');
              await this.qPut(entry);
              continue;
            }
          } else if (!ok) {
            entry.status = 'failed';
            entry.error = 'rejected (' + res.status + ')';
            await this.qPut(entry);
            continue;
          }

          // Asset moves: update the current_location cache, ledger-first
          // order preserved. If THIS network call dies, the entry stays
          // pending and the retry's duplicate-id path lands us right
          // back here to re-attempt the patch.
          if (entry.assetPatch) {
            const patch = await fetch(
              window.location.origin + '/api/collections/assets/records/' + entry.assetPatch.assetId, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': localStorage.getItem('tn_token')
                },
                body: JSON.stringify({ current_location: entry.assetPatch.toLocation })
              });
            // A 404 means the asset was deleted server-side; the ledger
            // entry above still stands. Don't fail the queue over the cache.
            void patch;
          }

          await this.qDelete(entry.seq);
        } catch (err) {
          if (this.isNetworkError(err)) return;  // connection dropped mid-replay: stop, keep order
          throw err;
        }
      }
    } finally {
      this._syncing = false;
      await this.renderBadge();
    }
  },

  // ---- Badge + stale banner (injected on every page) ------------------------
  ensureUi() {
    if (document.getElementById('tn-sync-badge')) return;
    const style = document.createElement('style');
    style.textContent = `
      #tn-sync-badge {
        position: fixed; bottom: 12px; right: 12px; z-index: 9999;
        font: 700 13px system-ui, sans-serif; letter-spacing: .02em;
        padding: 10px 14px; min-height: 44px;
        background: #14161a; color: #fff; border: none; cursor: pointer;
        display: none;
      }
      #tn-sync-badge.failed { background: #a1160a; }
      #tn-stale-banner {
        display: none; padding: 10px 12px;
        font: 600 13px system-ui, sans-serif;
        background: #fff4e5; color: #8a5a00; border: 2px solid #8a5a00;
        margin: 0 0 12px;
      }`;
    document.head.appendChild(style);

    const banner = document.createElement('div');
    banner.id = 'tn-stale-banner';
    document.body.prepend(banner);

    const badge = document.createElement('button');
    badge.id = 'tn-sync-badge';
    badge.addEventListener('click', () => this.badgeTapped());
    document.body.appendChild(badge);
  },

  async renderBadge(state) {
    this.ensureUi();
    const badge = document.getElementById('tn-sync-badge');
    const entries = await this.qAll();
    const pending = entries.filter((e) => e.status === 'pending').length;
    const failed = entries.filter((e) => e.status === 'failed').length;

    badge.classList.toggle('failed', failed > 0);
    if (state === 'syncing') {
      badge.textContent = '… syncing';
      badge.style.display = 'block';
    } else if (this._authPaused && pending) {
      badge.textContent = '⚠ sign in to sync ' + pending + (pending === 1 ? ' record' : ' records');
      badge.style.display = 'block';
    } else if (failed) {
      badge.textContent = '⚠ ' + failed + ' failed · tap to review' + (pending ? ' (' + pending + ' waiting)' : '');
      badge.style.display = 'block';
    } else if (pending) {
      badge.textContent = '⏳ ' + pending + ' to sync · tap to retry';
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  },

  // Failures are reviewed one by one — the reason and the human label are
  // shown, and discarding takes an explicit OK. Native dialogs on
  // purpose: zero UI code, big OS buttons, works everywhere.
  async badgeTapped() {
    const failed = (await this.qAll()).filter((e) => e.status === 'failed');
    for (const entry of failed) {
      const discard = confirm(
        'Could not sync: ' + entry.label + '\n' +
        'Queued ' + new Date(entry.queuedAt).toLocaleString() + '\n' +
        'Server said: ' + entry.error + '\n\n' +
        'OK = discard this record permanently.\n' +
        'Cancel = keep it and ask your PM.'
      );
      if (discard) await this.qDelete(entry.seq);
    }
    await this.sync();
  },

  // Called by TN.fetch when a response carries the service worker's
  // X-TN-Cached-At stamp — i.e. the network is gone and this is old data.
  showStale(cachedAt) {
    this.ensureUi();
    const el = document.getElementById('tn-stale-banner');
    el.textContent = '⚠ No connection — showing saved data from ' +
      new Date(cachedAt).toLocaleString();
    el.style.display = 'block';
  },
};

// `const` at top level does NOT create a window property, and tn-auth.js
// (loaded first) reaches us via window.TNSync guards — make it explicit.
window.TNSync = TNSync;

// ---- Bootstrap on every page ------------------------------------------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
window.addEventListener('online', () => TNSync.sync());
document.addEventListener('DOMContentLoaded', () => {
  TNSync.renderBadge();
  TNSync.sync();          // every page load is a sync opportunity
});

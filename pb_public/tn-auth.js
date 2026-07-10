// TrenchNote auth helper — the one deliberate exception to "every page is
// self-contained" (see docs/adr/0001): token handling duplicated across
// four pages would drift, and drift in auth code is how lockouts and holes
// happen. ~40 lines, no dependencies.
//
// How auth works here:
// - login.html POSTs email+password to PocketBase's auth-with-password
//   endpoint and stores the returned token in localStorage. One sign-in
//   per phone; the token rides along on every request after that.
// - Every page calls TN.requireLogin() first thing, and uses TN.fetch()
//   instead of fetch() so the Authorization header is always attached.
// - When the token expires or is revoked, the first failing request clears
//   it and bounces the user to login.html, which sends them back to the
//   page they were on afterwards (?next=).

const TN = {
  token() {
    return localStorage.getItem('tn_token') || '';
  },

  // The signed-in user record (id, email, name) saved at login. Display
  // only — the server trusts the token, never this.
  user() {
    try { return JSON.parse(localStorage.getItem('tn_user') || 'null'); }
    catch { return null; }
  },

  // Call at the top of every page script. No token = straight to login,
  // remembering where the user was headed (so a scanned QR still lands on
  // the right asset after signing in).
  //
  // If a token exists, it's validated in the background via PocketBase's
  // auth-refresh endpoint. That matters for two reasons:
  // 1. PocketBase does NOT 401 stale tokens on reads — it just treats the
  //    caller as a guest and returns empty lists. Without this check, an
  //    expired token would look like "everything vanished" instead of
  //    "please sign in again".
  // 2. auth-refresh returns a NEW token, so the session slides forward on
  //    every visit — a field phone used weekly effectively stays signed in.
  requireLogin() {
    if (!this.token()) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.replace('login.html?next=' + next);
      return;
    }
    fetch(window.location.origin + '/api/collections/users/auth-refresh', {
      method: 'POST',
      headers: { 'Authorization': this.token() }
    }).then(async res => {
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('tn_token', data.token);
      } else {
        localStorage.removeItem('tn_token');
        localStorage.removeItem('tn_user');
        const next = encodeURIComponent(location.pathname + location.search);
        location.replace('login.html?next=' + next);
      }
    }).catch(() => { /* offline/unreachable — the page's own error handling covers it */ });
  },

  async signOut() {
    // Unsynced field data can't sync while signed out — make sure the
    // person knows it's parked, not lost.
    if (window.TNSync) {
      const waiting = (await TNSync.qAll()).length;
      if (waiting && !confirm(
        waiting + ' unsynced record(s) are saved on this phone. They stay ' +
        'saved, but cannot sync until someone signs in again. Sign out anyway?')) {
        return;
      }
    }
    // Cached inventory data shouldn't outlive the session on a shared
    // phone. The shell cache (pages, no data) stays.
    if (window.caches) {
      for (const key of await caches.keys()) {
        if (key.startsWith('tn-api-')) await caches.delete(key);
      }
    }
    localStorage.removeItem('tn_token');
    localStorage.removeItem('tn_user');
    location.href = 'login.html';
  },

  // Drop-in replacement for fetch(): attaches the PocketBase token.
  // 401 = bad/expired token, so clear it and re-login. (403 is NOT
  // treated as expiry — it means "signed in but not allowed".)
  async fetch(url, opts = {}) {
    opts.headers = Object.assign({ 'Authorization': this.token() }, opts.headers);
    const res = await fetch(url, opts);
    // The service worker stamps X-TN-Cached-At on responses it serves
    // from cache (= the network is gone). Tell the user the data is old.
    const cachedAt = res.headers.get('X-TN-Cached-At');
    if (cachedAt && window.TNSync) TNSync.showStale(cachedAt);
    if (res.status === 401) {
      localStorage.removeItem('tn_token');
      localStorage.removeItem('tn_user');
      this.requireLogin();
      // Halt the caller quietly; the redirect above is already happening.
      await new Promise(() => {});
    }
    return res;
  }
};

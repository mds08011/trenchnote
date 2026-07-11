#!/bin/sh
# Verify a LIVE TrenchNote deployment is up, healthy, and running CURRENT code.
#
# Read-only and safe against production: it only GETs public endpoints. Under
# the auth lockdown (ADR 0004) a guest read returns an empty list, so no data
# is exposed — these are the same checks preflight.sh runs, pointed at a real
# URL instead of a throwaway instance.
#
# Usage — run it from a checkout of the version you EXPECT to be live, so it
# can compare the deployed service-worker VERSION against this repo's:
#   sh deploy/verify-live.sh https://app.trenchnote.com
#
# Exit 0 = up and current. Non-zero = something is behind (it says what).

set -eu
URL="${1:-}"
[ -n "$URL" ] || { echo "usage: sh deploy/verify-live.sh https://your-host" >&2; exit 2; }
URL="${URL%/}"                      # strip any trailing slash

RC=0
note() { echo "  $1"; }
bad()  { echo "  FAIL: $1"; RC=1; }

echo "== verifying $URL =="

# 1. Health + TLS (curl -s returns 0 on HTTP errors, nonzero only on network
#    failure, so the || catches an unreachable host).
code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$URL/api/health") || bad "could not reach $URL"
[ "${code:-}" = "200" ] && note "health: 200 OK (TLS valid)" || bad "health returned ${code:-none}"

# 2. Schema — every contract collection must exist (200). A 404 means that
#    migration hasn't been applied on the box. (The API genuinely 404s a
#    missing collection; it does NOT catch-all the way the static server does.)
for c in items locations assets movements reservations readings inspection_requirements inspections; do
  code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$URL/api/collections/$c/records?perPage=1") || true
  case "${code:-}" in
    200) note "collection $c: OK" ;;
    404) bad "collection $c MISSING — a migration hasn't been applied (box is behind)" ;;
    *)   bad "collection $c: unexpected ${code:-none}" ;;
  esac
done

# 3. Static pages current AND not masked by the SPA catch-all. The live server
#    serves the dashboard for unknown paths, so a 200 is not proof — the real
#    receiving.html must actually be the receiving report.
title=$(curl -s -m 15 "$URL/receiving.html" | grep -m1 -o '<title>[^<]*</title>' || true)
case "$title" in
  *Receiving*) note "receiving.html: real page served ($title)" ;;
  *)           bad "receiving.html not deployed — got '${title:-no title}' (catch-all served the dashboard)" ;;
esac

# 4. Shell version — compare the DEPLOYED sw.js VERSION to this checkout's.
live_v=$(curl -s -m 15 "$URL/sw.js" | sed -n "s/.*const VERSION = '\([^']*\)'.*/\1/p" | head -1)
if [ -f pb_public/sw.js ]; then
  repo_v=$(sed -n "s/.*const VERSION = '\([^']*\)'.*/\1/p" pb_public/sw.js | head -1)
  if [ "${live_v:-}" = "$repo_v" ]; then
    note "service worker: live=$live_v matches this checkout"
  else
    bad "service worker: live=${live_v:-none} but this checkout is $repo_v (pull + restart on the box)"
  fi
else
  note "service worker: live=${live_v:-none} (run from a checkout to compare)"
fi

echo ""
if [ "$RC" = 0 ]; then
  echo "LIVE VERIFY PASS — $URL is up and current."
else
  echo "LIVE VERIFY: issues above — the box is NOT running this version. See deploy/UPDATE.md."
fi
exit "$RC"

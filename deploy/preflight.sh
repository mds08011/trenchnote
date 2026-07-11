#!/bin/sh
# TrenchNote pre-deploy preflight — run ON THE BOX after cloning + setup.sh,
# BEFORE you point DNS at it. Proves a fresh checkout applies every migration
# and serves all collections, using a THROWAWAY database on a temp port — it
# never touches your real pb_data/ or the running service.
#
# Usage (from the app dir, e.g. /opt/trenchnote/app):
#   sh deploy/preflight.sh
#
# Exit 0 = ready to deploy. Non-zero = something to fix first (it says what).

set -eu

PORT=8399                       # temp, unlikely to collide with the real 8090
MIG=./pb_migrations
TESTDIR="$(mktemp -d)"
# Kill the server FIRST, let it release the SQLite file handles, THEN remove
# the temp dir — and preserve the real exit status so cleanup can't turn a
# pass into a failure (on Windows the open .db files are briefly "busy").
cleanup() { _st=$?; set +e; [ -n "${PBPID:-}" ] && kill "$PBPID" 2>/dev/null; sleep 1; rm -rf "$TESTDIR" 2>/dev/null; exit "$_st"; }
trap cleanup EXIT

fail() { echo "PREFLIGHT FAIL: $1" >&2; exit 1; }

echo "== TrenchNote preflight =="

# 1. Tools the app + setup need
for t in curl; do command -v "$t" >/dev/null 2>&1 || fail "missing '$t' (install it: apt install $t)"; done

# 2. The binary must be present (scripts/setup.sh downloads it; not committed).
#    Linux/macOS -> ./pocketbase ; Windows/Git Bash -> ./pocketbase.exe
if [ -x ./pocketbase ]; then BIN=./pocketbase
elif [ -x ./pocketbase.exe ]; then BIN=./pocketbase.exe
else fail "no pocketbase binary here — run ./scripts/setup.sh first"; fi
[ -d "$MIG" ] || fail "no pb_migrations/ — are you in the app directory?"
echo "  binary + migrations present ($(ls "$MIG" | wc -l) migration files)"

# 3. Boot a throwaway instance and apply every migration to a blank DB
echo "  booting a throwaway instance on :$PORT (temp dir, real data untouched)..."
"$BIN" serve --http="127.0.0.1:$PORT" --dir="$TESTDIR" --migrationsDir="$MIG" >"$TESTDIR/serve.log" 2>&1 &
PBPID=$!

# wait for health (up to ~15s)
i=0
until curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 30 ] && { cat "$TESTDIR/serve.log" >&2; fail "server did not come up (see log above)"; }
  sleep 0.5
done
echo "  health OK"

# 4. Every contract collection must exist. Under the auth lockdown a guest read
#    returns 200 with an empty list for an EXISTING collection, and 404 for a
#    missing one — so non-404 proves the migration ran. (No auth needed.)
for c in items locations assets movements reservations readings inspection_requirements inspections; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/collections/$c/records?perPage=1")
  case "$code" in
    404) fail "collection '$c' missing — a migration did not apply" ;;
    000) fail "could not reach the test server for '$c'" ;;
    *)   echo "  collection '$c': OK ($code)" ;;
  esac
done

echo ""
echo "PREFLIGHT PASS — fresh checkout applies all migrations and serves every"
echo "collection. Safe to start the real service and point DNS at it."

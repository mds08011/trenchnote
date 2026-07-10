#!/bin/sh
# TrenchNote demo seed — fills a LOCAL instance with realistic fake data
# for sidecar/premium development and demos, so they run against the real
# API instead of mock JSON.
#
# This script is a living exercise of the public API contract
# (docs/API.md): it writes ONLY through the documented REST endpoints,
# authenticated as an ORDINARY user — exactly as a sidecar would
# (ADR 0011). No superuser calls, no pb_data/ access.
#
# Usage:
#   TN_EMAIL=demo@example.com TN_PASSWORD=demopass1234 ./scripts/seed_demo.sh
#   TN_URL=http://192.168.1.50:8090 TN_EMAIL=... TN_PASSWORD=... ./scripts/seed_demo.sh
#
# The demo user must exist first (self-signup is off by design): create it
# in the admin UI — collections -> users -> new record. The script prints
# these instructions again if auth fails.
#
# Idempotence: aborts if the sentinel location ("Millbrook Staging Yard")
# already exists, so re-running can't duplicate data. To reseed, start
# from a fresh pb_data/ (or delete the demo records in the admin UI).
#
# HONEST LIMITATION — timestamps: the ledger's `created` field is
# server-assigned (an append-only ledger you could backdate wouldn't be
# much of a ledger), so every seeded movement is stamped "now" no matter
# what this script does. The 90-day story lives in the *sequences* (chains
# of moves, materials received then partially consumed, rentals parked in
# the yard) and in reservation dates, which ARE client-set. "Days here"
# on freshly seeded data reads "less than a day" everywhere.
#
# Needs: curl, and GNU date for the reservation-date arithmetic
# (Linux and Git Bash have it; on macOS: brew install coreutils -> gdate).

set -eu

TN_URL="${TN_URL:-http://127.0.0.1:8090}"
TN_EMAIL="${TN_EMAIL:-}"
TN_PASSWORD="${TN_PASSWORD:-}"

# GNU date on Linux/Git Bash, gdate on macOS
DATE=date
date -d "+1 day" +%F >/dev/null 2>&1 || DATE=gdate

if [ -z "$TN_EMAIL" ] || [ -z "$TN_PASSWORD" ]; then
  echo "Set TN_EMAIL and TN_PASSWORD to a normal user account." >&2
  echo "No account yet? Self-signup is disabled on purpose — create one:" >&2
  echo "  1. Open $TN_URL/_/  (admin UI)" >&2
  echo "  2. Collections -> users -> New record (email + password)" >&2
  echo "  3. Re-run:  TN_EMAIL=... TN_PASSWORD=... $0" >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# ---- API helpers ------------------------------------------------------------
# api METHOD path [json]  -> response body in $TMP; aborts loudly on non-2xx.
api() {
  _code=$(curl -s -o "$TMP" -w '%{http_code}' -X "$1" "$TN_URL/api/$2" \
    -H "Content-Type: application/json" \
    -H "Authorization: ${TOKEN:-}" \
    ${3:+-d "$3"})
  case "$_code" in
    2*) ;;
    *) echo "API $1 $2 failed (HTTP $_code):" >&2
       cat "$TMP" >&2; echo >&2
       exit 1 ;;
  esac
}

# Record id out of the last response. Key match is case-sensitive, so
# "collectionId" can't false-positive.
rid() { sed -n 's/.*"id":"\([a-z0-9]\{15\}\)".*/\1/p' "$TMP" | head -1; }

# ---- Sign in (exactly as a sidecar would: auth-with-password) ---------------
TOKEN=""
api POST "collections/users/auth-with-password" \
  "{\"identity\":\"$TN_EMAIL\",\"password\":\"$TN_PASSWORD\"}" || true
TOKEN=$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' "$TMP")
if [ -z "$TOKEN" ]; then
  echo "Could not sign in as $TN_EMAIL — check the credentials, or create" >&2
  echo "the account in the admin UI ($TN_URL/_/ -> collections -> users)." >&2
  exit 1
fi
echo "Signed in as $TN_EMAIL"

# ---- Idempotence sentinel ---------------------------------------------------
api GET "collections/locations/records?filter=(name='Millbrook%20Staging%20Yard')&perPage=1"
if grep -q '"Millbrook Staging Yard"' "$TMP"; then
  echo "ABORT: demo data already present (found the sentinel location" >&2
  echo "'Millbrook Staging Yard'). Re-running would duplicate records." >&2
  echo "Reseed against a fresh pb_data/, or delete the demo records first." >&2
  exit 1
fi

echo "Seeding demo data into $TN_URL ..."

# ---- Locations (6) ----------------------------------------------------------
loc() { api POST "collections/locations/records" "{\"name\":\"$1\",\"type\":\"$2\"}"; rid; }
YARD=$(loc "Millbrook Staging Yard" yard)            # the sentinel
SHOP=$(loc "Shop & Warehouse" warehouse)
WWTP=$(loc "Bear Creek WWTP Expansion" jobsite)
LS4=$(loc "Millbrook Lift Station 4" jobsite)
FM12=$(loc "Hwy 12 Force Main" jobsite)
WTP=$(loc "Cedar Falls WTP Clearwell" jobsite)
echo "  6 locations"

# ---- Items: unique (assets hang off these) + bulk ---------------------------
item() { api POST "collections/items/records" \
  "{\"name\":\"$1\",\"category\":\"$2\",\"tracking_mode\":\"$3\"}"; rid; }

SCAF=$(item "Baker Scaffold Set" Access unique)
LIFT19=$(item "19ft Scissor Lift" Access unique)
LIFT26=$(item "26ft Scissor Lift" Access unique)
GEN=$(item "Towable Generator 25kW" Power unique)
PUMP6=$(item "Trash Pump 6in" Dewatering unique)
PUMP3=$(item "Trash Pump 3in" Dewatering unique)
TSTA=$(item "Total Station" Survey unique)
COMP=$(item "Plate Compactor" Earthwork unique)
LTOW=$(item "Light Tower" Power unique)
WELD=$(item "Welder 250A" Fabrication unique)

B_SUP=$(item "Pipe Supports" Pipe bulk)
B_BOLT=$(item "Anchor Bolts 3/4in" Hardware bulk)
B_C900=$(item "6in C900 Pipe (sticks)" Pipe bulk)
B_MJ=$(item "8in MJ Fittings" Pipe bulk)
B_TIES=$(item "Form Ties" Concrete bulk)
B_REBAR=$(item "Rebar #5 (sticks)" Concrete bulk)
B_SILT=$(item "Silt Fence (rolls)" Erosion bulk)
B_HOSE=$(item "Dewatering Hose 4in (sections)" Dewatering bulk)
B_MH=$(item "Precast Manhole Sections" Structures bulk)
B_GRAV=$(item "Bedding Gravel (tons)" Earthwork bulk)
echo "  10 unique item types + 10 bulk materials"

# ---- Assets (25) — created unplaced; placement is a LEDGER EVENT ------------
# asset TAG item ownership [vendor] [po] [serial]
asset() {
  _body="{\"item\":\"$2\",\"tag_code\":\"$1\",\"ownership\":\"$3\""
  [ -n "${4:-}" ] && _body="$_body,\"vendor\":\"$4\",\"po_number\":\"$5\""
  [ -n "${6:-}" ] && _body="$_body,\"serial_number\":\"$6\""
  api POST "collections/assets/records" "$_body}"
  rid
}
# place ASSET_ID FROM TO WHO — the contract write order: movement (the
# ledger, the truth) FIRST, then PATCH the current_location cache.
place() {
  _from=${2:+\"$2\"}; _from=${_from:-null}
  api POST "collections/movements/records" \
    "{\"asset\":\"$1\",\"from_location\":$_from,\"to_location\":\"$3\",\"moved_by\":\"$4\"}"
  api PATCH "collections/assets/records/$1" "{\"current_location\":\"$3\"}"
  MOVES=$((MOVES + 1))
}
MOVES=0

A01=$(asset A001 "$SCAF"   owned);  A02=$(asset A002 "$SCAF" owned)
A03=$(asset A003 "$SCAF"   owned);  A04=$(asset A004 "$SCAF" owned)
A05=$(asset A005 "$LIFT19" rented "United Rentals" PO-4118 SN-7741)
A06=$(asset A006 "$LIFT19" owned "" "" SN-2209)
A07=$(asset A007 "$LIFT26" rented "Sunbelt Rentals" PO-4136 SN-9910)
A08=$(asset A008 "$GEN"    owned "" "" GEN-081)
A09=$(asset A009 "$GEN"    rented "Herc Rentals" PO-4102 GEN-HR-77)
A10=$(asset A010 "$GEN"    owned "" "" GEN-082)
A11=$(asset A011 "$PUMP6"  owned "" "" TP6-11)
A12=$(asset A012 "$PUMP6"  rented "United Rentals" PO-4090 TP6-UR-3)
A13=$(asset A013 "$PUMP3"  owned "" "" TP3-02)
A14=$(asset A014 "$PUMP3"  owned "" "" TP3-05)
A15=$(asset A015 "$TSTA"   owned "" "" TS-0917)
A16=$(asset A016 "$TSTA"   owned "" "" TS-0921)
A17=$(asset A017 "$COMP"   owned)
A18=$(asset A018 "$COMP"   owned)
A19=$(asset A019 "$LTOW"   rented "United Rentals" PO-4141 LT-UR-19)
A20=$(asset A020 "$LTOW"   owned "" "" LT-04)
A21=$(asset A021 "$WELD"   owned "" "" W250-1)
A22=$(asset A022 "$WELD"   owned "" "" W250-2)
A23=$(asset A023 "$LIFT19" owned "" "" SN-2216)
A24=$(asset A024 "$SCAF"   owned)
A25=$(asset A025 "$PUMP3"  rented "Sunbelt Rentals" PO-4152 TP3-SB-8)
echo "  25 assets (5 rented)"

# Initial placements — everything arrives from outside the system
for a in $A01 $A02 $A03 $A24; do place "$a" "" "$YARD" "R. Alvarez"; done
place "$A04" "" "$WWTP" "D. Okafor"
place "$A05" "" "$WWTP" "D. Okafor"     # rental, delivered to site
place "$A06" "" "$YARD" "R. Alvarez"
place "$A07" "" "$WTP"  "T. Nguyen"     # rental
place "$A08" "" "$LS4"  "M. Castillo"
place "$A09" "" "$YARD" "R. Alvarez"    # rental sitting idle in the yard
place "$A10" "" "$SHOP" "J. Whitfield"
place "$A11" "" "$FM12" "M. Castillo"
place "$A12" "" "$FM12" "M. Castillo"   # rental
place "$A13" "" "$SHOP" "J. Whitfield"
place "$A14" "" "$YARD" "R. Alvarez"
place "$A15" "" "$WWTP" "D. Okafor"
place "$A16" "" "$SHOP" "J. Whitfield"
place "$A17" "" "$FM12" "M. Castillo"
place "$A18" "" "$YARD" "R. Alvarez"
place "$A19" "" "$WWTP" "D. Okafor"     # rental
place "$A20" "" "$SHOP" "J. Whitfield"
place "$A21" "" "$SHOP" "J. Whitfield"
place "$A22" "" "$WWTP" "D. Okafor"
place "$A23" "" "$LS4"  "M. Castillo"
place "$A25" "" "$LS4"  "M. Castillo"   # rental

# The bartering pattern: shared gear bouncing between sites
place "$A01" "$YARD" "$WWTP" "D. Okafor"
place "$A02" "$YARD" "$LS4"  "M. Castillo"
place "$A06" "$YARD" "$FM12" "M. Castillo"
place "$A14" "$YARD" "$WWTP" "D. Okafor"
place "$A01" "$WWTP" "$LS4"  "M. Castillo"     # grabbed unannounced, classic
place "$A18" "$YARD" "$WTP"  "T. Nguyen"
place "$A16" "$SHOP" "$WTP"  "T. Nguyen"
place "$A13" "$SHOP" "$FM12" "M. Castillo"
place "$A10" "$SHOP" "$WWTP" "D. Okafor"
place "$A22" "$WWTP" "$SHOP" "J. Whitfield"    # back for repair
place "$A22" "$SHOP" "$WWTP" "D. Okafor"       # ...and out again
place "$A02" "$LS4"  "$WWTP" "D. Okafor"
place "$A14" "$WWTP" "$YARD" "R. Alvarez"      # returned to the yard
place "$A17" "$FM12" "$LS4"  "M. Castillo"
place "$A11" "$FM12" "$YARD" "R. Alvarez"      # pump back after dewatering
place "$A03" "$YARD" "$WTP"  "T. Nguyen"
place "$A20" "$SHOP" "$FM12" "M. Castillo"
place "$A15" "$WWTP" "$WTP"  "T. Nguyen"       # survey gear follows the work
echo "  $MOVES asset movements (placements + transfers)"

# ---- Bulk movements: all three contract shapes -------------------------------
# receive ITEM QTY TO WHO NOTE          (from empty  = delivery)
# xfer    ITEM QTY FROM TO WHO          (both set    = transfer)
# consume ITEM QTY FROM WHO NOTE        (to empty    = installed/used)
receive() { api POST "collections/movements/records" \
  "{\"item\":\"$1\",\"quantity\":$2,\"to_location\":\"$3\",\"moved_by\":\"$4\",\"note\":\"$5\"}"; MOVES=$((MOVES+1)); }
xfer() { api POST "collections/movements/records" \
  "{\"item\":\"$1\",\"quantity\":$2,\"from_location\":\"$3\",\"to_location\":\"$4\",\"moved_by\":\"$5\"}"; MOVES=$((MOVES+1)); }
consume() { api POST "collections/movements/records" \
  "{\"item\":\"$1\",\"quantity\":$2,\"from_location\":\"$3\",\"moved_by\":\"$4\",\"note\":\"$5\"}"; MOVES=$((MOVES+1)); }

# Deliveries into the yard/warehouse (the staging-yard black hole begins)
receive "$B_SUP"   500 "$YARD" "R. Alvarez"  "PO-1877, packing slip 40021"
receive "$B_BOLT"  800 "$SHOP" "J. Whitfield" "PO-1902"
receive "$B_C900"  240 "$YARD" "R. Alvarez"  "PO-1888, 40ft sticks"
receive "$B_MJ"     36 "$YARD" "R. Alvarez"  "PO-1888"
receive "$B_TIES" 1200 "$SHOP" "J. Whitfield" "PO-1910"
receive "$B_REBAR" 600 "$YARD" "R. Alvarez"  "PO-1895"
receive "$B_SILT"   40 "$YARD" "R. Alvarez"  "PO-1881"
receive "$B_HOSE"   60 "$SHOP" "J. Whitfield" "PO-1899"
receive "$B_MH"     14 "$YARD" "R. Alvarez"  "PO-1871, precast delivery"
receive "$B_GRAV"  120 "$YARD" "R. Alvarez"  "ticket 55810"
receive "$B_SUP"   200 "$YARD" "R. Alvarez"  "PO-1877 backorder"

# Transfers out to the jobs
xfer "$B_SUP"   120 "$YARD" "$WWTP" "D. Okafor"
xfer "$B_SUP"    80 "$YARD" "$LS4"  "M. Castillo"
xfer "$B_C900"   90 "$YARD" "$FM12" "M. Castillo"
xfer "$B_MJ"     12 "$YARD" "$FM12" "M. Castillo"
xfer "$B_REBAR" 250 "$YARD" "$WWTP" "D. Okafor"
xfer "$B_TIES"  400 "$SHOP" "$WWTP" "D. Okafor"
xfer "$B_SILT"   15 "$YARD" "$FM12" "M. Castillo"
xfer "$B_HOSE"   24 "$SHOP" "$LS4"  "M. Castillo"
xfer "$B_MH"      6 "$YARD" "$LS4"  "M. Castillo"
xfer "$B_GRAV"   45 "$YARD" "$FM12" "M. Castillo"
xfer "$B_BOLT"  200 "$SHOP" "$WWTP" "D. Okafor"
xfer "$B_SUP"    40 "$WWTP" "$LS4"  "M. Castillo"   # site-to-site borrow
xfer "$B_HOSE"   10 "$LS4"  "$FM12" "M. Castillo"
xfer "$B_GRAV"   20 "$YARD" "$LS4"  "M. Castillo"
receive "$B_GRAV" 60 "$YARD" "R. Alvarez" "ticket 55977"

# Consumed / installed — leaves stock, stays in the ledger
consume "$B_SUP"    95 "$WWTP" "D. Okafor"   "installed, digester 3 gallery"
consume "$B_C900"   72 "$FM12" "M. Castillo" "laid sta 14+00 to 41+00"
consume "$B_MJ"      9 "$FM12" "M. Castillo" "set at valve clusters"
consume "$B_REBAR" 210 "$WWTP" "D. Okafor"   "clearwell base mat pour"
consume "$B_TIES"  350 "$WWTP" "D. Okafor"   "wall pours 1-4"
consume "$B_SILT"   12 "$FM12" "M. Castillo" "perimeter install"
consume "$B_MH"      5 "$LS4"  "M. Castillo" "set MH 4-1 through 4-5"
consume "$B_GRAV"   40 "$FM12" "M. Castillo" "pipe bedding"
consume "$B_SUP"    30 "$LS4"  "M. Castillo" "wet well piping"
consume "$B_BOLT"  140 "$WWTP" "D. Okafor"   "equipment anchor pattern"
echo "  $MOVES total movements (receives, transfers, consumes included)"

# ---- Reservations (8): mixed lifecycle --------------------------------------
d() { "$DATE" -d "$1" +%F; }   # relative date -> YYYY-MM-DD
resv() { # ASSET WHO NEEDED_BY RELEASE NOTE [STATUS_OMITTED_IF_EMPTY]
  _rel=${4:+\"$4 00:00:00\"}; _rel=${_rel:-null}
  api POST "collections/reservations/records" \
    "{\"asset\":\"$1\",\"requested_by\":\"$2\",\"needed_by\":\"$3 00:00:00\",\"expected_release\":$_rel,\"note\":\"$5\",\"status\":\"open\"}"
  rid
}

# Open, future — the normal queue
resv "$A05" "D. Okafor"   "$(d '+4 days')"  "$(d '+11 days')" "digester wall pour"        >/dev/null
resv "$A15" "T. Nguyen"   "$(d '+6 days')"  "$(d '+8 days')"  "clearwell layout"          >/dev/null
resv "$A08" "M. Castillo" "$(d '+13 days')" ""                "bypass pumping, LS4"       >/dev/null

# Open, release date already passed — shows the red flag
resv "$A07" "D. Okafor"   "$(d '-9 days')"  "$(d '-2 days')"  "held over from shutdown"   >/dev/null

# Legacy-style: created WITHOUT a status field (empty = open, per API.md)
api POST "collections/reservations/records" \
  "{\"asset\":\"$A11\",\"requested_by\":\"J. Whitfield\",\"needed_by\":\"$(d '+3 days') 00:00:00\",\"note\":\"pre-status row exercise\"}"

# Fulfilled and cancelled — created open, then closed via the lifecycle
# update, the same two-step every client uses (create rule forbids being
# born closed)
R6=$(resv "$A02" "M. Castillo" "$(d '-14 days')" "$(d '-7 days')" "shored MH excavation")
api PATCH "collections/reservations/records/$R6" '{"status":"fulfilled"}'
R7=$(resv "$A19" "D. Okafor"   "$(d '-6 days')"  "$(d '-1 days')" "night pour lighting")
api PATCH "collections/reservations/records/$R7" '{"status":"fulfilled"}'
R8=$(resv "$A12" "T. Nguyen"   "$(d '+2 days')"  ""               "never mind, renting one")
api PATCH "collections/reservations/records/$R8" '{"status":"cancelled"}'
echo "  8 reservations (4 open incl. 1 expired + 1 legacy empty-status, 2 fulfilled, 1 cancelled)"

echo ""
echo "Done. Open $TN_URL and sign in — the dashboard should show 6"
echo "locations, 25 assets, 10 materials with derived stock, a spoken-for"
echo "queue, and a busy recently-moved feed."
echo ""
echo "Note: all movement timestamps read 'now' — the public API cannot"
echo "backdate an append-only ledger (that's a feature). Sequences and"
echo "reservation dates carry the demo's history instead."

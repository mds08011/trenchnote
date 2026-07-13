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
SLIP="$TMP.slip.png"           # a real 1x1 PNG standing in for a photographed
                               # packing slip (ADR 0013); generated below
trap 'rm -f "$TMP" "$SLIP"' EXIT

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
USER_ID=$(rid) # created_by/received_by are the signed-in account (ADR 0020)
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
# loc NAME TYPE [JOB_CODE] [NOTIFY_EMAIL] — job_code is what the office
# bills equipment time against; notify_email is the PM who hears when
# something scans OFF the site (ADR 0012).
loc() {
  _body="{\"name\":\"$1\",\"type\":\"$2\""
  [ -n "${3:-}" ] && _body="$_body,\"job_code\":\"$3\""
  [ -n "${4:-}" ] && _body="$_body,\"notify_email\":\"$4\""
  api POST "collections/locations/records" "$_body}"
  rid
}
YARD=$(loc "Millbrook Staging Yard" yard)            # the sentinel
SHOP=$(loc "Shop & Warehouse" warehouse)
WWTP=$(loc "Bear Creek WWTP Expansion" jobsite 6054.2 pm.bearcreek@example.com)
LS4=$(loc "Millbrook Lift Station 4" jobsite 6101 pm.millbrook@example.com)
FM12=$(loc "Hwy 12 Force Main" jobsite 6088)
WTP=$(loc "Cedar Falls WTP Clearwell" jobsite 6042.1 pm.cedarfalls@example.com)
echo "  6 locations (4 with job codes, 3 with off-site notify emails)"

# ---- Items: unique (assets hang off these) + bulk ---------------------------
# item NAME CATEGORY MODE [METER] — meter (hours|odometer) marks the whole
# KIND of thing as having a gauge; asset.html then offers a reading at the
# scan moment (ADR 0012).
item() {
  _body="{\"name\":\"$1\",\"category\":\"$2\",\"tracking_mode\":\"$3\""
  [ -n "${4:-}" ] && _body="$_body,\"meter\":\"$4\""
  api POST "collections/items/records" "$_body}"
  rid
}

SCAF=$(item "Baker Scaffold Set" Access unique)
LIFT19=$(item "19ft Scissor Lift" Access unique hours)
LIFT26=$(item "26ft Scissor Lift" Access unique hours)
GEN=$(item "Towable Generator 25kW" Power unique hours)
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
TRUCK=$(item "Crew Truck F-350" Vehicles unique odometer)
echo "  11 unique item types (4 metered) + 10 bulk materials"

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
# A truck is custodianship, not bartering: assigned to a person (ADR 0012)
api POST "collections/assets/records" \
  "{\"item\":\"$TRUCK\",\"tag_code\":\"A026\",\"ownership\":\"owned\",\"serial_number\":\"F350-2019-07\",\"assigned_to\":\"M. Castillo\"}"
A26=$(rid)
echo "  26 assets (6 rented, 1 assigned to a person)"

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
place "$A26" ""      "$FM12" "M. Castillo"     # the truck lives with its person
echo "  $MOVES asset movements (placements + transfers)"

# ---- Meter readings (ADR 0012) — the append-only readings ledger ------------
# reading ASSET VALUE TYPE WHO. Note A026's second odometer entry is LOWER
# than its first: legal data (typo or replaced gauge), rendered flagged.
reading() { api POST "collections/readings/records" \
  "{\"asset\":\"$1\",\"value\":$2,\"reading_type\":\"$3\",\"recorded_by\":\"$4\"}"; }
reading "$A06" 612.4  hours    "R. Alvarez"     # month-end walkdown
reading "$A06" 619.8  hours    "M. Castillo"    # captured at a scan-move
reading "$A08" 1204.0 hours    "M. Castillo"
reading "$A26" 52810  odometer "M. Castillo"
reading "$A26" 52240  odometer "M. Castillo"    # lower than previous -> flagged in UI
echo "  5 meter readings (1 flagged lower-than-previous)"

# ---- Bulk movements: all three contract shapes -------------------------------
# deliver  ITEM QTY TO WHO VENDOR PO [OSD]   (from empty = delivery/receive)
# deliverf … same, plus a photographed packing slip (multipart upload)
# xfer     ITEM QTY FROM TO WHO             (both set   = transfer)
# consume  ITEM QTY FROM WHO NOTE           (to empty   = installed/used)
#
# Deliveries carry the receiving log (ADR 0013): vendor_name + po_number on
# every one, an osd_note where something arrived short or damaged, and — on
# the two that matter — a packing_slip photo, which IS the vendor-dispute
# evidence. po_number is free text a human typed; TrenchNote never models a
# purchase order. receiving.html prints all of this per item or per PO
# (PO-1888 below spans two items; PO-1877 spans two deliveries).
xfer() { api POST "collections/movements/records" \
  "{\"item\":\"$1\",\"quantity\":$2,\"from_location\":\"$3\",\"to_location\":\"$4\",\"moved_by\":\"$5\"}"; MOVES=$((MOVES+1)); }
consume() { api POST "collections/movements/records" \
  "{\"item\":\"$1\",\"quantity\":$2,\"from_location\":\"$3\",\"moved_by\":\"$4\",\"note\":\"$5\"}"; MOVES=$((MOVES+1)); }
deliver() { api POST "collections/movements/records" \
  "{\"item\":\"$1\",\"quantity\":$2,\"to_location\":\"$3\",\"moved_by\":\"$4\",\"vendor_name\":\"$5\",\"po_number\":\"$6\",\"osd_note\":\"${7:-}\"}"; MOVES=$((MOVES+1)); }
# A file rides along, so this one is multipart (curl -F) rather than the
# JSON api() helper — exactly the request material.html sends for a
# delivery with a photo. $SLIP_ARG (not $SLIP) is what curl reads: see the
# cygpath note below.
deliverf() {
  _code=$(curl -s -o "$TMP" -w '%{http_code}' -X POST "$TN_URL/api/collections/movements/records" \
    -H "Authorization: ${TOKEN:-}" \
    -F "item=$1" -F "quantity=$2" -F "to_location=$3" -F "moved_by=$4" \
    -F "vendor_name=$5" -F "po_number=$6" -F "osd_note=${7:-}" \
    -F "packing_slip=@$SLIP_ARG;type=image/png")
  case "$_code" in 2*) ;; *) echo "deliverf $1 failed (HTTP $_code):" >&2; cat "$TMP" >&2; echo >&2; exit 1 ;; esac
  MOVES=$((MOVES+1))
}

# The stand-in packing slip: a valid (tiny) PNG, because PocketBase
# content-sniffs uploaded files and rejects anything that isn't an image.
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d > "$SLIP"
# The shell wrote $SLIP as an MSYS path (/tmp/...); on Git Bash, curl is
# native Windows curl and can't open that path when it's buried in a
# -F @file argument (it fails with exit 26). cygpath hands it a Windows
# path instead. Everywhere else cygpath is absent and the /tmp path is
# read natively — so this line is a no-op off Windows.
SLIP_ARG="$SLIP"
command -v cygpath >/dev/null 2>&1 && SLIP_ARG="$(cygpath -m "$SLIP")"

# Deliveries into the yard/warehouse (the staging-yard black hole begins).
# Two carry photographed slips + damage notes — the dispute evidence.
deliverf "$B_SUP"  500 "$YARD" "R. Alvarez"   "Ferguson Waterworks" "PO-1877"
deliver  "$B_BOLT" 800 "$SHOP" "J. Whitfield" "Fastenal"            "PO-1902"
deliver  "$B_C900" 240 "$YARD" "R. Alvarez"   "Core & Main"         "PO-1888" "240 sticks per slip; 3 cracked at the bell, set aside for return"
deliver  "$B_MJ"    36 "$YARD" "R. Alvarez"   "Core & Main"         "PO-1888"
deliver  "$B_TIES" 1200 "$SHOP" "J. Whitfield" "White Cap"          "PO-1910"
deliver  "$B_REBAR" 600 "$YARD" "R. Alvarez"  "CMC Rebar"           "PO-1895"
deliver  "$B_SILT"  40 "$YARD" "R. Alvarez"   "SiteOne"             "PO-1881"
deliver  "$B_HOSE"  60 "$SHOP" "J. Whitfield" "United Rentals"      "PO-1899"
deliverf "$B_MH"    14 "$YARD" "R. Alvarez"   "Oldcastle Precast"   "PO-1871" "14 sections per slip; MH-4-3 spalled at the joint — photographed, flagged to vendor"
deliver  "$B_GRAV" 120 "$YARD" "R. Alvarez"   "Martin Marietta"     "ticket 55810"
deliver  "$B_SUP"  200 "$YARD" "R. Alvarez"   "Ferguson Waterworks" "PO-1877" "second release against PO-1877"

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
deliver "$B_GRAV" 60 "$YARD" "R. Alvarez" "Martin Marietta" "ticket 55977"

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

# ---- Transfer manifests (ADR 0020) -----------------------------------------
# One completed short receipt exercises the stock invariant: all 50 leave the
# source, 48 reach the destination, and 2 remain visible at the seeded
# "Missing in transfer" holding location. A second manifest stays in transit
# so the dashboard and asset/material overlays have honest demo data.
manifest() { # FROM TO DRIVER -> id
  api POST "collections/manifests/records" \
    "{\"from_location\":\"$1\",\"to_location\":\"$2\",\"created_by\":\"$USER_ID\",\"driver_name\":\"$3\",\"status\":\"draft\"}"
  rid
}
manifest_bulk_line() { # MANIFEST ITEM QTY -> id
  api POST "collections/manifest_lines/records" \
    "{\"manifest\":\"$1\",\"item\":\"$2\",\"quantity\":$3,\"sent_quantity\":$3,\"received_quantity\":0}"
  rid
}
manifest_asset_line() { # MANIFEST ASSET -> id
  api POST "collections/manifest_lines/records" \
    "{\"manifest\":\"$1\",\"asset\":\"$2\",\"quantity\":0,\"sent_quantity\":1,\"received_quantity\":0}"
  rid
}

# Sent 50, received 48: two ordinary transfer movements preserve every stock
# sum without mislabeling the shortfall as consumption.
MF_DONE=$(manifest "$YARD" "$WWTP" "L. Brooks")
ML_DONE=$(manifest_bulk_line "$MF_DONE" "$B_SUP" 50)
api PATCH "collections/manifests/records/$MF_DONE" '{"status":"in_transit"}'
api PATCH "collections/manifest_lines/records/$ML_DONE" \
  '{"received_quantity":48,"condition_note":"Two bundles not on truck at unload"}'
api POST "collections/movements/records" \
  "{\"item\":\"$B_SUP\",\"quantity\":48,\"from_location\":\"$YARD\",\"to_location\":\"$WWTP\",\"moved_by\":\"D. Okafor\",\"note\":\"Manifest $MF_DONE\"}"
api POST "collections/movements/records" \
  "{\"item\":\"$B_SUP\",\"quantity\":2,\"from_location\":\"$YARD\",\"to_location\":\"tnmissingxfer01\",\"moved_by\":\"D. Okafor\",\"note\":\"Manifest $MF_DONE shortfall\"}"
MOVES=$((MOVES+2))
api PATCH "collections/manifests/records/$MF_DONE" \
  "{\"status\":\"received_with_discrepancies\",\"received_by\":\"$USER_ID\"}"

# Still on the road: source ledger/cache stay unchanged while the manifest
# overlay names the committed asset and bulk quantity.
MF_OPEN=$(manifest "$YARD" "$WTP" "S. Patel")
manifest_asset_line "$MF_OPEN" "$A09" >/dev/null
manifest_bulk_line "$MF_OPEN" "$B_REBAR" 25 >/dev/null
api PATCH "collections/manifests/records/$MF_OPEN" '{"status":"in_transit"}'
echo "  2 transfer manifests (1 in transit, 1 received short by 2)"

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

# ---- Rental on/off dates (ADR 0015) — dates in core, rates stay premium ------
# on_rent_date = when the unit went on rent; off_rent_date = when it's due
# back (empty = open-ended, nobody set a return). Date-only at UTC midnight,
# the reservations convention. Owned gear leaves both empty. asset.html shows
# the off-rent date on a rented asset, so a foreman scanning a lift sees when
# it's due back — the demo covers the cases worth seeing: due-soon, PAST-DUE
# (still on site, bleeding cost), and an idle open-ended rental with no
# return date at all. Rates stay in the premium sidecar's terms file, never
# here.
rental() { # ASSET ON_RENT OFF_RENT("" = open-ended)
  _off=${3:+\"$3 00:00:00\"}; _off=${_off:-null}
  api PATCH "collections/assets/records/$1" \
    "{\"on_rent_date\":\"$2 00:00:00\",\"off_rent_date\":$_off}"
}
rental "$A05" "$(d '-45 days')" "$(d '+9 days')"    # due back in 9 days; also reserved +4..+11
rental "$A07" "$(d '-75 days')" "$(d '-5 days')"    # PAST DUE — still at WTP, held over from shutdown
rental "$A09" "$(d '-60 days')" ""                  # open-ended, sitting idle in the yard
rental "$A12" "$(d '-20 days')" "$(d '+14 days')"
rental "$A19" "$(d '-30 days')" "$(d '+3 days')"    # comes off rent in 3 days
rental "$A25" "$(d '-12 days')" "$(d '+25 days')"
echo "  6 rentals dated (1 past-due A007, 1 open-ended A009); rates stay premium"

# ---- Damage & condition reports (ADR 0019) ----------------------------------
# A report always carries one required photo, so these writes use multipart.
# The same tiny valid PNG used for receiving-demo evidence stands in for a
# camera photo. `created` remains server-assigned and append-only.
condition_report() { # ASSET TYPE WHO DESCRIPTION -> id
  _code=$(curl -s -o "$TMP" -w '%{http_code}' -X POST "$TN_URL/api/collections/condition_reports/records" \
    -H "Authorization: ${TOKEN:-}" \
    -F "asset=$1" -F "report_type=$2" -F "reported_by=$3" \
    -F "description=$4" -F "photo=@$SLIP_ARG;type=image/png")
  case "$_code" in
    2*) ;;
    *) echo "condition report $1 failed (HTTP $_code):" >&2
       cat "$TMP" >&2; echo >&2; exit 1 ;;
  esac
  rid
}
resolve_condition() { # REPORT RESOLUTION WHO NOTE
  api POST "collections/condition_resolutions/records" \
    "{\"report\":\"$1\",\"resolution\":\"$2\",\"resolved_by\":\"$3\",\"note\":\"$4\"}"
}

# One open damage report drives the dashboard and DAMAGED badge.
condition_report "$A10" damage "D. Okafor" \
  "Generator receptacle cover cracked and will not stay closed" >/dev/null

# One resolved damage report remains visible in both append-only ledgers.
RESOLVED_DAMAGE=$(condition_report "$A11" damage "M. Castillo" \
  "Pull cord frayed after dewatering shift")
resolve_condition "$RESOLVED_DAMAGE" repaired "J. Whitfield" \
  "Replaced cord and test-started at the shop"

# Rental delivery evidence: two angles, each its own timestamped report.
condition_report "$A05" condition_note "D. Okafor" \
  "Rental delivery: front and left side clean; no visible panel damage" >/dev/null
condition_report "$A05" condition_note "D. Okafor" \
  "Rental delivery: platform controls and hour meter photographed" >/dev/null
echo "  4 condition reports (1 open damage, 1 resolved, 2 rental delivery photos)"

# ---- Certs & inspections (ADR 0014) ------------------------------------------
# Safety gear plus the three badge states the docs promise: RED (failed
# harness), YELLOW (extinguisher due in 10 days), GREEN (freshly
# calibrated gas monitor). Unlike `created`, inspected_at is CLIENT-SET
# by design (compliance math keys on the day eyes were on the thing), so
# the demo can honestly backdate the inspection story.
# References here are EXAMPLES — real intervals come from your own
# safety program (see docs/inspection-seeds.md).
req() { # ASSET NAME INTERVAL_DAYS REF -> id
  api POST "collections/inspection_requirements/records" \
    "{\"asset\":\"$1\",\"name\":\"$2\",\"interval_days\":$3,\"reference\":\"$4\"}"
  rid
}
insp() { # ASSET REQ_ID RESULT WHO DATE [NOTE] — REQ_ID "" = ad-hoc
  _req=${2:+\"$2\"}; _req=${_req:-null}
  api POST "collections/inspections/records" \
    "{\"asset\":\"$1\",\"requirement\":$_req,\"result\":\"$3\",\"inspected_by\":\"$4\",\"inspected_at\":\"$5 00:00:00\",\"note\":\"${6:-}\"}"
}

HARN=$(item "Full-Body Harness" Safety unique)
EXT=$(item "Fire Extinguisher 10lb ABC" Safety unique)
GAS=$(item "4-Gas Monitor" Safety unique)
A27=$(asset A027 "$HARN" owned "" "" H-2231)
A28=$(asset A028 "$EXT"  owned "" "" FE-118)
A29=$(asset A029 "$GAS"  owned "" "" GM-77)
place "$A27" "" "$WWTP" "D. Okafor"
place "$A28" "" "$YARD" "R. Alvarez"
place "$A29" "" "$LS4"  "M. Castillo"

R_H=$(req "$A27" "Competent-person inspection" 180 "OSHA 1926.502 - example, set from your program")
R_EM=$(req "$A28" "Monthly visual" 30 "NFPA 10 / OSHA 1910.157(e)(2) - example")
R_EA=$(req "$A28" "Annual maintenance" 365 "NFPA 10 - example")
R_G=$(req "$A29" "Bump test / calibration" 180 "Manufacturer manual - example")

# RED: passed four months ago, failed yesterday — the latest word wins
insp "$A27" "$R_H"  pass "S. Barnes"  "$(d '-120 days')"
insp "$A27" "$R_H"  fail "S. Barnes"  "$(d '-1 day')" "cut webbing at dorsal D-ring"
# YELLOW: monthly visual passed 20 days ago -> due again in 10
insp "$A28" "$R_EM" pass "R. Alvarez" "$(d '-20 days')"
insp "$A28" "$R_EA" pass "FireCo service" "$(d '-100 days')" "6-year teardown current"
# GREEN: calibrated 10 days ago -> due in 170
insp "$A29" "$R_G"  pass "M. Castillo" "$(d '-10 days')" "bump test ok"
echo "  3 safety assets, 4 requirements, 5 inspections (1 RED, 1 YELLOW, 1 GREEN badge)"

echo ""
echo "Done. Open $TN_URL and sign in — the dashboard should show 6"
echo "locations (job codes + notify emails on the jobsites), 29 assets,"
echo "10 materials with derived stock, a spoken-for queue, a busy"
echo "recently-moved feed, and meter readings on A006/A008/A026 (A026's"
echo "odometer history includes a flagged lower-than-previous entry)."
echo "The Inspections panel should flag A027 (RED, failed harness) and"
echo "A028 (YELLOW, extinguisher visual due in 10 days); A029 is green."
echo ""
echo "Deliveries carry the receiving log: open receiving.html?item=<id> for"
echo "any bulk material (or receiving.html?po=PO-1888 to see one PO span two"
echo "items) — vendor, PO, over/short/damaged notes, and two photographed"
echo "packing slips (Pipe Supports and Precast Manhole Sections) in the"
echo "photo appendix. po_number is free text a human typed; TrenchNote"
echo "knows what arrived, never what was ordered."
echo ""
echo "The 6 rented assets carry on/off-rent dates (ADR 0015): scan A007 for"
echo "a PAST-DUE rental or A019 (off rent in 3 days) — asset.html shows the"
echo "countdown. A009 is deliberately open-ended (no return date), so it"
echo "shows none. Dates live in core; rental RATES stay in the premium sidecar."
echo ""
echo "Note: all movement timestamps read 'now' — the public API cannot"
echo "backdate an append-only ledger (that's a feature). Sequences and"
echo "reservation dates carry the demo's history instead."
echo ""
echo "Transfer manifests (ADR 0020): one Yard-to-WTP truck is in transit;"
echo "one 50-support transfer arrived with 48 at Bear Creek and 2 recorded"
echo "at Missing in transfer. Open either from the dashboard."
echo ""
echo "Condition evidence (ADR 0019): A010 has one open damage report; A011"
echo "has a damage report resolved as repaired; rented A005 has two delivery-"
echo "condition photos. Report and resolution rows are both append-only."

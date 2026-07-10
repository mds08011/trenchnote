#!/bin/sh
# TrenchNote setup — download the right PocketBase binary for this machine.
#
# Usage:
#   ./scripts/setup.sh              # latest release
#   PB_VERSION=0.28.4 ./scripts/setup.sh   # pin a specific version
#
# PocketBase is a single Go binary with an embedded SQLite database.
# We download it instead of committing it: it's ~40 MB and differs per
# OS/architecture. Everything else TrenchNote needs is already in the repo —
# on first run PocketBase auto-applies the schema from pb_migrations/.
#
# POSIX sh on purpose: must work on a bare Raspberry Pi, a $5 VPS, macOS,
# and Git Bash on Windows.

set -eu

# Work from the repo root (this script lives in scripts/), so the binary
# lands next to pb_migrations/ and pb_public/ where PocketBase expects them.
cd "$(dirname "$0")/.."

# ---- 1. Detect OS ----------------------------------------------------------
case "$(uname -s)" in
  Linux*)                     OS="linux"   ;;
  Darwin*)                    OS="darwin"  ;;
  MINGW*|MSYS*|CYGWIN*)       OS="windows" ;;
  *)
    echo "Unsupported OS: $(uname -s)" >&2
    echo "Download PocketBase manually from https://github.com/pocketbase/pocketbase/releases" >&2
    exit 1
    ;;
esac

# ---- 2. Detect CPU architecture --------------------------------------------
case "$(uname -m)" in
  x86_64|amd64)   ARCH="amd64" ;;
  aarch64|arm64)  ARCH="arm64" ;;
  armv7*|armv6*)  ARCH="armv7" ;;   # older Raspberry Pis
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    echo "Download PocketBase manually from https://github.com/pocketbase/pocketbase/releases" >&2
    exit 1
    ;;
esac

BIN="pocketbase"
[ "$OS" = "windows" ] && BIN="pocketbase.exe"

if [ -f "$BIN" ]; then
  echo "$BIN already exists — delete it first if you want to re-download."
  exit 0
fi

# ---- 3. Resolve the version -------------------------------------------------
# Default to the latest GitHub release; override with PB_VERSION=x.y.z.
if [ "${PB_VERSION:-}" = "" ]; then
  echo "Looking up latest PocketBase release..."
  # The GitHub API returns JSON; grab the tag_name line (e.g. "v0.28.4")
  # without needing jq installed.
  PB_VERSION=$(curl -fsSL https://api.github.com/repos/pocketbase/pocketbase/releases/latest \
    | grep '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/')
  if [ "$PB_VERSION" = "" ]; then
    echo "Could not detect the latest version (GitHub API unreachable?)." >&2
    echo "Retry with a pinned version, e.g.: PB_VERSION=0.28.4 ./scripts/setup.sh" >&2
    exit 1
  fi
fi

# ---- 4. Download and unzip ---------------------------------------------------
ZIP="pocketbase_${PB_VERSION}_${OS}_${ARCH}.zip"
URL="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${ZIP}"

echo "Downloading PocketBase v${PB_VERSION} for ${OS}/${ARCH}..."
curl -fL -o "$ZIP" "$URL"

# Extract only the binary — the zip also has LICENSE/CHANGELOG we don't need.
unzip -o "$ZIP" "$BIN" >/dev/null
rm "$ZIP"
chmod +x "$BIN" 2>/dev/null || true   # no-op on Windows, required elsewhere

echo ""
echo "Done. Start TrenchNote with:"
echo "    ./$BIN serve"
echo ""
echo "Then open http://127.0.0.1:8090/_/ to create your admin account."
echo "To reach it from phones on the same network:"
echo "    ./$BIN serve --http=0.0.0.0:8090"

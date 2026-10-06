#!/usr/bin/env bash
# Encanto before/after screenshots and frame times.
#   scripts/shots.sh [OUT_DIR] [TIERS]
#     OUT_DIR  where the PNGs go (default: a fresh temp dir; never put them inside the repo)
#     TIERS    comma list of high,low,phone (default: high,phone)
# Serves the repo over HTTP the same way scripts/check.sh does, loads index.html?debug in headless Chromium
# (Playwright), enters the forest, places the camera at five fixed viewpoints through window.__enc, saves one PNG
# per viewpoint and tier, and prints frame times per tier.
#
# The numbers are for before/after comparison on the same machine only. Headless Chromium may render through
# SwiftShader (software GL) off macOS, and even on a real GPU it is not a browser tab on a phone. See scripts/shots.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-$(mktemp -d "${TMPDIR:-/tmp}/encanto-shots.XXXXXX")}"
TIERS="${2:-high,phone}"
mkdir -p "$OUT"
case "$(cd "$OUT" && pwd -P)/" in "$(pwd -P)/"*) echo "shots: write the PNGs outside the repo" >&2; exit 1;; esac
node -e "require.resolve('playwright')" >/dev/null 2>&1 || { echo "shots: needs Playwright (npm i --no-save playwright && npx playwright install chromium)" >&2; exit 1; }
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
trap '{ kill "$SERVER_PID"; wait "$SERVER_PID"; } 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do curl -s "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.1; done
PORT="$PORT" node scripts/shots.mjs "$OUT" "$TIERS"

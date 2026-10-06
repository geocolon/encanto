#!/usr/bin/env bash
# Encanto pre-commit check.
#   1. Syntax-checks every inline script in index.html with Node: classic <script> blocks as scripts,
#      <script type="module"> blocks as ES modules (imports are parsed, not resolved).
#   2. If Playwright is available, serves the repo over HTTP (modules, the import map and assets/ need it),
#      loads the page in headless Chromium and fails on page errors, console errors (e.g. shader compile
#      failures) or assets that fail to load.
# Usage: scripts/check.sh            (from the repo root)
set -euo pipefail
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
SERVER_PID=""
cleanup(){ if [ -n "$SERVER_PID" ]; then { kill "$SERVER_PID"; wait "$SERVER_PID"; } 2>/dev/null || true; fi; rm -rf "$TMP"; }
trap cleanup EXIT

# 1. Syntax check
python3 - "$TMP" <<'PY'
import re, sys, os, json
html = open("index.html", encoding="utf-8").read()
classic = re.findall(r"<script>(.*?)</script>", html, re.S)
modules = re.findall(r'<script type="module">(.*?)</script>', html, re.S)
maps = re.findall(r'<script type="importmap">(.*?)</script>', html, re.S)
if not classic and not modules:
    sys.exit("check: no inline <script> found in index.html")
open(os.path.join(sys.argv[1], "classic.js"), "w", encoding="utf-8").write("\n;\n".join(classic))
for i, m in enumerate(modules):
    open(os.path.join(sys.argv[1], f"module{i}.mjs"), "w", encoding="utf-8").write(m)
for m in maps:
    try: json.loads(m)
    except Exception as e: sys.exit(f"check: import map is not valid JSON: {e}")
PY
node --check "$TMP/classic.js"
for f in "$TMP"/module*.mjs; do [ -e "$f" ] && node --check "$f"; done
echo "check: script syntax OK"

# 2. Runtime smoke test (optional): needs Node + the playwright package
if node -e "require.resolve('playwright')" >/dev/null 2>&1; then
  PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
  python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 50); do curl -s "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.1; done
  PORT="$PORT" node - <<'JS'
const { chromium } = require('playwright');
(async () => {
  // macOS: use the real GPU through ANGLE/Metal (seconds). Elsewhere: SwiftShader software GL, which compiles
  // shaders without KHR_parallel_shader_compile and can take several minutes to reach the Enter button.
  const gpu = process.platform === 'darwin';
  const browser = await chromium.launch({ args: gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], blocked = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 400)); else if (m.type() === 'warning' && /THREE\.|Encanto/.test(m.text()) && !/KHR_parallel_shader_compile/.test(m.text())) console.log('check: warning: ' + m.text().slice(0, 300)); });
  page.on('requestfailed', r => { if (/cdnjs|jsdelivr|unpkg/.test(r.url())) blocked.push(r.url()); else if (/\/assets\//.test(r.url())) errors.push('asset failed: ' + r.url()); });
  page.on('response', r => { if (r.status() >= 400 && /\/assets\/|jsdelivr/.test(r.url())) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.goto(`http://127.0.0.1:${process.env.PORT}/`, { waitUntil: 'commit' });
  // the Enter button appears once the forest is built and every asset has loaded
  await page.waitForSelector('#enter:not([hidden])', { state: 'attached', timeout: gpu ? 120000 : 420000 }).catch(() => errors.push('forest never finished loading (Enter button stayed hidden)'));
  await browser.close();
  if (blocked.length) { console.log('check: skipped the browser test, this machine cannot reach the three.js CDN:\n  ' + blocked[0]); process.exit(0); }
  if (errors.length) { console.error('check: runtime errors:\n  ' + errors.join('\n  ')); process.exit(1); }
  console.log('check: page loads, assets arrive and the scene builds without errors');
})();
JS
else
  echo "check: playwright not installed, skipped the browser test (npm i --no-save playwright && npx playwright install chromium to enable)"
fi

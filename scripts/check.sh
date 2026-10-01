#!/usr/bin/env bash
# Encanto pre-commit check.
#   1. Syntax-checks the inline game script in index.html with Node.
#   2. If Playwright is available, loads the page in headless Chromium and fails on any page error.
# Usage: scripts/check.sh            (from the repo root)
set -euo pipefail
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. Syntax check: pull out the inline <script> (the one with no src) and parse it
python3 - "$TMP/game.js" <<'PY'
import re, sys
html = open("index.html", encoding="utf-8").read()
blocks = re.findall(r"<script>(.*?)</script>", html, re.S)
if not blocks:
    sys.exit("check: no inline <script> found in index.html")
open(sys.argv[1], "w", encoding="utf-8").write("\n".join(blocks))
PY
node --check "$TMP/game.js"
echo "check: script syntax OK"

# 2. Runtime smoke test (optional): needs Node + the playwright package
if node -e "require.resolve('playwright')" >/dev/null 2>&1; then
  node - <<'JS'
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], blocked = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', r => { if (/cdnjs|jsdelivr|unpkg/.test(r.url())) blocked.push(r.url()); });
  await page.goto('file://' + path.resolve('index.html'));
  // the Enter button appears once the forest has finished building
  await page.waitForSelector('#enter:not([hidden])', { timeout: 90000 }).catch(() => errors.push('forest never finished loading (Enter button stayed hidden)'));
  await browser.close();
  if (blocked.length) { console.log('check: skipped the browser test, this machine cannot reach the three.js CDN:\n  ' + blocked[0]); process.exit(0); }
  if (errors.length) { console.error('check: runtime errors:\n  ' + errors.join('\n  ')); process.exit(1); }
  console.log('check: page loads and builds the scene without errors');
})();
JS
else
  echo "check: playwright not installed, skipped the browser test (npm i -D playwright to enable)"
fi

# Encanto by Paloma

A first-person 3D rainforest valley that runs in the browser. The site is `index.html` plus CC0 assets in `assets/` (three.js 0.186.1 as ES modules from cdn.jsdelivr.net via an import map), published by GitHub Pages from the `main` branch root at https://geocolon.github.io/encanto/.

- To change the site, use the `encanto-builder` subagent (`.claude/agents/encanto-builder.md`). It edits, runs `scripts/check.sh`, commits with Conventional Commit messages, and pushes.
- Always run `scripts/check.sh` before committing. Its browser test needs Playwright (`npm i --no-save playwright && npx playwright install chromium`); never commit `node_modules`.
- The site is being given a staged realism overhaul (aim: looks like a real Amazon rainforest, not a game). Stage 1 (engine upgrade, HDR lighting, PBR forest floor) shipped 2026-10-06; stage 2 is scanned plants and trees; stage 3 is atmosphere (light shafts, mist).
- Preview locally with `python3 -m http.server 8000` and open http://localhost:8000.

# Encanto by Paloma

A first-person 3D rainforest valley that runs in the browser. The whole site is `index.html` (three.js r128 from cdnjs), published by GitHub Pages from the `main` branch root at https://geocolon.github.io/encanto/.

- To change the site, use the `encanto-builder` subagent (`.claude/agents/encanto-builder.md`). It edits, runs `scripts/check.sh`, commits with Conventional Commit messages, and pushes.
- Always run `scripts/check.sh` before committing.
- Preview locally with `python3 -m http.server 8000` and open http://localhost:8000.

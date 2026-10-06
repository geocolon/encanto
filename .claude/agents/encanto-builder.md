---
name: encanto-builder
description: Makes changes to the Encanto by Paloma 3D rainforest site (index.html), checks them, and commits and pushes them to GitHub so GitHub Pages redeploys. Use for any request to change the forest, animals, lighting, rain, sound, HUD, controls or performance of the site, e.g. "add more toucans" or "make the rain heavier".
tools: Read, Edit, Write, Grep, Glob, Bash
model: inherit
---

You maintain **Encanto by Paloma**, a first-person 3D rainforest that runs from `index.html` plus CC0 assets in `assets/` (HDRIs, textures, models), and is served by GitHub Pages from the `main` branch.

Work like a careful engineer at a terminal: small change, check, commit, push, report.

## Workflow for every request

1. **Sync first.** Run `git pull --rebase origin main` so you build on the latest version.
2. **Find the right place.** Use Grep on `index.html` before editing. The file is organised in labelled sections (see the map below); change the existing section rather than adding a parallel one.
3. **Make the smallest change that does what was asked.** Prefer changing a number in the `Q` quality presets or an existing function over new code. Keep the phone preset (first object in `Q`) lighter than the desktop preset (second object); when you raise a count, raise both proportionally.
4. **Check.** Run `scripts/check.sh`. It must print `script syntax OK`. If it reports runtime errors, fix them before committing. It should also print `page loads, assets arrive and the scene builds without errors`; if it says it skipped the browser test, mention that in your report.
5. **Commit** with a Conventional Commit message, one logical change per commit:
   - `feat(birds): add a flock of toucans over the trail`
   - `fix(trees): give clearing-edge trees full crowns`
   - `perf(grass): halve mid-layer blades on phones`
   - `style(hud): enlarge the compass on mobile`
   Use `git add index.html` (plus `assets/...` and any other files you deliberately changed), never `git add -A`.
6. **Push** with `git push origin main`. If the push is rejected, `git pull --rebase origin main`, re-run the check, and push again. Never force-push.
7. **Report** in a few lines: what changed, the commit hash (`git log -1 --oneline`), and that the live site updates at https://geocolon.github.io/encanto/ within a minute or two.

If a request is ambiguous or would remove something large (a whole animal, the rain, the mountains), say what you plan to do and ask before committing.

## Map of index.html

- `Q` quality presets (phone vs desktop): counts of trees, grass, rocks, birds, rain, fog density, bloom, shadow size. Most "more / less / denser" requests are a change here.
- `height(x,z)` terrain shape, `pathX(z)` the trail line, `GAPS` the sky window, `POND`, `WAYSTONE`.
- Import map and module imports at the top of the game script (three 0.186.1 and `three/addons/`). The splash and details-menu scripts are classic scripts so they work even if the CDN fails.
- Asset loading: `THREE.LoadingManager` drives the "Loading the forest…" progress on the start card; Enter appears only once assets have loaded and shaders have compiled.
- Quality tiers: phone / low-end / desktop detection, overridable with `?quality=high` or `?quality=low`.
- Procedural textures: `makeTex(...)` calls for leaf litter, grass, bark, stone, leaves, fronds, monstera, vine curtains, flowers, morpho wings.
- Sky and light: `SUN_DIR`, HDRI environment (PMREM) and HDRI sky, `sun` (directional light, shadow box that follows the player), hemisphere light. Light intensities are in physical units.
- Forest floor: Poly Haven PBR ground textures blended by noise, wetter near the pond.
- `addWind(mat, mode, strength, glow)`: shared wind and backlit-leaf shader.
- Mountain ring (360° horizon) with aerial-perspective haze.
- Rainforest layers: `giant`, `canopyTree`, `sapling`, `palm`, `fern`, `treeFern`, `bigLeafPlant`, `monsteraPlant`, `climbingMonstera`, `vineCurtains`, `hangVines`, `orchidSpray`, `bloomClump`, `boulder`, `fallenTree`.
- `grassLayer(N, half, inner, wMul, hMul)`: GPU grass that wraps around the player (near and mid layers). Its shader has its own copy of the terrain formula in `terrainH`; if you change `height()` or `pathX()`, change `terrainH`/`gPathX` to match.
- Sun shower: `rainU` uniforms (speed, wind, opacity) and pond `ripples`.
- Animals: `SPECIES` table and `makeBird`, `trailFlight` flight plans, hummingbirds, morphos, toucans, capybaras.
- Audio: `startAudio()` (cicadas, rain hiss, leaf patter, drips) and `call()` (bird calls).
- Camera pipeline: RenderPass, GTAO (desktop only), god rays + lens flare (`raysPass`), bloom, film grade (`gradePass`), OutputPass last. Tone mapping is ACES Filmic.
- Player, input (keyboard, mouse, touch joystick, Run/Jump buttons), HUD compass.

## Rules

- Code lives in `index.html`; binary assets live in `assets/`. three.js is **0.186.1**, loaded as ES modules through the import map from cdn.jsdelivr.net; add-ons come from `three/addons/` at the same pinned version. Never mix versions or go back to r128 / `examples/js` globals. Use current APIs: `colorSpace` (not `encoding`), physical light units, `THREE.Timer`.
- Colour management is on: diffuse/colour textures use `SRGBColorSpace`, normal/roughness/ARM maps stay linear.
- The world is generated from a seeded random (`mulberry32(20260930)`). Changing the order of generation changes the whole layout; add new generation steps after existing ones when you can.
- Respect performance: the desktop scene is already heavy. When you add something big, consider trimming something less visible, and say so in the commit body.
- Assets: only CC0 or similarly free-to-redistribute sources (Poly Haven preferred), downloaded into `assets/` (not hot-linked), at the smallest resolution that looks right (1k textures by default), compressed JPEG/KTX2 for textures and GLB (Draco/meshopt) for models. Credit each new source in the details menu Credits and the README. Keep a running size budget and report the total size of `assets/` in your report.
- Do not commit secrets, API keys or `node_modules`.

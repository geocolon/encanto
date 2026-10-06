# Encanto by Paloma

A first-person 3D rainforest valley that runs in the browser. The site is `index.html` plus CC0 assets in `assets/` (three.js 0.186.1 as ES modules from cdn.jsdelivr.net via an import map), published by GitHub Pages from the `main` branch root at https://geocolon.github.io/encanto/.

- To change the site, use the `encanto-builder` subagent (`.claude/agents/encanto-builder.md`). It edits, runs `scripts/check.sh`, commits with Conventional Commit messages, and pushes.
- Always run `scripts/check.sh` before committing. Its browser test needs Playwright (`npm i --no-save playwright && npx playwright install chromium`); never commit `node_modules`.
- The site is being given a staged realism overhaul (aim: looks like a real Amazon rainforest, not a game). Stage 1 (engine upgrade, HDR lighting, PBR forest floor) shipped 2026-10-06; stage 2 (scanned bark and foliage from Poly Haven, built by `scripts/build-foliage.py`) shipped 2026-10-06; stage 3, next, is atmosphere (light shafts, mist).
- Preview locally with `python3 -m http.server 8000` and open http://localhost:8000.

---

# Realism log (read this first each session; keep it terse, update it when a stage moves)

Goal: photorealism. It should feel like standing in a real Amazon rainforest, not like a game. Desktop is the "photographic" tier; phones get the same look with lower counts. Judge every change against reference photos of real understory, not against the last version.

## Done (2026-10-06)
- S1 `0fa72e9`: three 0.186.1 import map, ACES tone mapping, physical light units, HDRI env (`rainforest_trail_1k.hdr`) and sky (`kloofendal_38d…`), PBR floor (3 Poly Haven sets blended by noise).
- S2 `166e6f6` assets + `522e43e` code: `barkMaterial()` (Poly Haven bark/moss/palm PBR, world-scaled UVs, per-vertex `aMoss` with noise), foliage atlases from `scripts/build-foliage.py` (`LEAF_CELLS`/`CARD_CELLS`, per-instance `aCell`), crown-volume normals (`aCrownN`), mip-aware alpha (`mipAlpha`), warmer translucency. Grass cut about 5× (desktop 14k+9k, phone 5k+3.5k).
- Seed rule: retired canvas textures run through `burnTex()` (a no-op canvas) so `rand()` order and the layout don't change. Appearance-only randomness goes through `rand2`/`pick2`.

## Still fake (where it looks like a game), ranked by visual cost
1. Plants are flat alpha cards (crowns, fronds, big leaves). They read as cards up close and shimmer with alphaTest; there's no TAA.
2. Light under the canopy is too even. A real understory is dark with bright sun flecks. Nothing models how open the canopy is.
3. Atmosphere: mist is `dotTex` sprites; god rays are a screen-space pass plus `rayTex` planes. Nothing is volumetric.
4. Surfaces are dry: no wet darkening or lower roughness under rain, no puddles, the pond has no SSR.
5. Still procedural: `stoneTex`, flowers, `morphoTex`, the mountain ring (vertex colours), birds and animals (sphere/cone primitives).
6. Audio is synthesized, not field recordings.
7. Too much grass and lawn for an Amazon floor. A real floor is leaf litter, seedlings and roots.

## Way forward (proposed; S3 was agreed, S4 onward still need the user's OK)
- S3 Atmosphere and light: (a) a baked canopy-openness map (top-down render of the leaf instances to a texture) that drives sun dappling, env intensity and a dark understory; (b) a ray-marched volumetric fog pass that samples the sun shadow map for real shafts, replacing the mist sprites and ray planes; (c) TRAA/TAA to stop foliage shimmer; (d) a wet-material uniform tied to the rain.
- S4 Real plant geometry: GLB scanned plants (Poly Haven models first: fern_02, anthurium, calathea…) with meshopt + KTX2 (`GLTFLoader`, `KTX2Loader`, `MeshoptDecoder` from three/addons); LOD near, octahedral impostors far; replace most grass with litter, seedlings and root meshes.
- S5 Life and sound: CC0 field-recording ambience loops (credit each); rigged GLB birds/animals, or keep primitives far away as silhouettes.
- Decision point: move to WebGPURenderer + TSL (compute foliage, built-in TRAA/GTAO/SSR/volumetrics) vs stay on WebGL2 with custom passes. Decide before S3b if the custom volumetric pass gets heavy.
- Tooling to add: `scripts/shots.sh` (Playwright + `?debug` fixed camera spots → PNGs) to compare before/after each change; log FPS and draw calls per tier.

## Open housekeeping
- Budgets: `assets/` 11 MB (2026-10-06). Keep an eye on the phone frame rate after S2. It hasn't been checked on a device.

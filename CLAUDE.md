# Encanto by Paloma

A first-person 3D rainforest valley that runs in the browser. The site is `index.html` plus CC0 assets in `assets/` (three.js 0.186.1 as ES modules from cdn.jsdelivr.net via an import map), published by GitHub Pages from the `main` branch root at https://geocolon.github.io/encanto/.

- To change the site, use the `encanto-builder` subagent (`.claude/agents/encanto-builder.md`). It edits, runs `scripts/check.sh`, commits with Conventional Commit messages, and pushes.
- Always run `scripts/check.sh` before committing. Its browser test needs Playwright (`npm i --no-save playwright && npx playwright install chromium`); never commit `node_modules`.
- The site is being given a staged realism overhaul (aim: looks like a real Amazon rainforest, not a game). Stage 1 (engine upgrade, HDR lighting, PBR forest floor) shipped 2026-10-06; stage 2 (scanned bark and foliage from Poly Haven, built by `scripts/build-foliage.py`) shipped 2026-10-06; stage 3 (canopy light, MSAA, wet surfaces, volumetric light and haze) shipped 2026-10-06; stage 4, next (needs the user's OK), is real plant geometry.
- Preview locally with `python3 -m http.server 8000` and open http://localhost:8000.

---

# Realism log (read this first each session; keep it terse, update it when a stage moves)

Goal: photorealism. It should feel like standing in a real Amazon rainforest, not like a game. Desktop is the "photographic" tier; phones get the same look with lower counts. Judge every change against reference photos of real understory, not against the last version.

## Done (2026-10-06)
- S1 `0fa72e9`: three 0.186.1 import map, ACES tone mapping, physical light units, HDRI env (`rainforest_trail_1k.hdr`) and sky (`kloofendal_38d…`), PBR floor (3 Poly Haven sets blended by noise).
- S2 `166e6f6` assets + `522e43e` code: `barkMaterial()` (Poly Haven bark/moss/palm PBR, world-scaled UVs, per-vertex `aMoss` with noise), foliage atlases from `scripts/build-foliage.py` (`LEAF_CELLS`/`CARD_CELLS`, per-instance `aCell`), crown-volume normals (`aCrownN`), mip-aware alpha (`mipAlpha`), warmer translucency. Grass cut about 5× (desktop 14k+9k, phone 5k+3.5k).
- S3 (`scripts/shots.sh` `17f63f0`): (a) `6f4a763` canopy light: baked canopy-openness maps (top-down + sun view of crown leaves/palm fronds), ShaderChunk patch dims/greens indirect light under closed canopy and cuts the sun beyond the shadow box; exposure 1.35, fog colour x0.72. Q `canopyLight`, `canopyRes`. (b) `23674fd` MSAA: canvas antialias did nothing (composer target had no samples); now a 4x MSAA scene target + `alphaToCoverage` foliage. Q `msaa` (desktop 4, phone 0, low-end 0). (c) `4403b16` wet surfaces: `uWet` (follows the constant rain, 0.7), ShaderChunk patch by `wetKind` (soil/porous/leaf). Q `wet`. (d) `b676e82` volumetric light/haze pass (shadow map + canopy map, HG g 0.7, half res 24 steps desktop, quarter res 12 steps phone, depth-aware upsample); mist sprites, ray planes and screen-space rays retired (loops kept for the seed), FogExp2 at half density. Q `vol`, `volScale`, `volSteps`; tuning in `VOL`.
- S3 frame cost (median forced-sync render ms, alternating A/B runs, headless Chromium on the dev Mac's Intel Iris Plus; noise about +-25% run to run, so read as rough): (a) desktop 106->115 (+5-9%), phone 40.7->41.8 (+3%); (b) desktop 121->130 (+8%; multisampling the whole composer was +29% and was dropped), low-end would be +11% so it is off there, phone would be +21% so off; (c) no measurable cost; (d) desktop 128->127, low-end 80.5->82.8 (+3%), phone 41.4->40.0 (the pass costs what the old god rays and mist sprites did). Net S3: desktop roughly +15%, low-end +5%, phone +3%. Absolute: desktop ~90-130 ms, phone preset ~40 ms at 1055x487 on this iGPU.
- S3 follow-up: `be63224` trail colour and sun flecks. Cause of the dark trail, measured: mostly the canopy indirect floor (0.4), then wet-soil darkening and the volumetric sky haze; GTAO and exposure were not the problem. Now `uCanopyK` = (0.5 floor, 0.04, 0.8, 0.35 trail-corridor openness), wet clay darkens 10% (not 35%) and glosses to 0.42, `SUN_GAP` crown holes lined up along `SUN_DIR` (cards in a hole skipped, edge cards shrunk, rand() untouched; ~21% fewer crown cards), sun canopy map blurred half as far. `3cb91ec` shafts: `VOL.sun` 0.5->1.4, `VOL.ambI` 0.6->0.5. Trail clay patch (sRGB) 26,23,14 -> 50,40,30 desktop. Render ms (alternating A/B): desktop 138->133, low-end 101->95, phone 45.6->45.4. Layout hash unchanged.
- Seed rule: retired canvas textures run through `burnTex()` (a no-op canvas) so `rand()` order and the layout don't change. Appearance-only randomness goes through `rand2`/`pick2`.

## Still fake (where it looks like a game), ranked by visual cost
1. Plants are flat alpha cards (crowns, fronds, big leaves). They read as cards up close. Desktop edges are now MSAA + alpha-to-coverage; phones still use a hard alpha cut and shimmer (no MSAA there, no TAA anywhere).
2. Sun flecks now come from `SUN_GAP` holes, but they are soft blobs (PCF radius 2.5, cards 4-6 m) rather than sharp coin-sized flecks, and many spots (e.g. the trail-view foreground) still get none. Sharper flecks need smaller leaves (S4) or a sharper shadow filter.
3. Shafts read toward the sun since the follow-up, but beyond the 40 m shadow box they come from the canopy map (blurred ~1 m), so distant shafts are soft. The volumetric jitter is static per pixel (per-frame jitter would flicker without temporal accumulation). The trail is still less red than before S3 (r/g 1.25 vs 1.46): the green-tinted indirect and the blue-grey haze.
4. Wet surfaces have no puddles and the pond has no SSR; wet soil is held at roughness >= 0.62 because glossier ground reflected the HDRI as a white, snow-like sheen at grazing angles (that was also the old pond margin). The rain never varies, so `uWet` is effectively constant.
5. Still procedural: `stoneTex`, flowers, `morphoTex`, the mountain ring (vertex colours), birds and animals (sphere/cone primitives).
6. Audio is synthesized, not field recordings.
7. Too much grass and lawn for an Amazon floor. A real floor is leaf litter, seedlings and roots.

## Way forward (proposed; S4 onward still need the user's OK)
- S4 Real plant geometry: GLB scanned plants (Poly Haven models first: fern_02, anthurium, calathea…) with meshopt + KTX2 (`GLTFLoader`, `KTX2Loader`, `MeshoptDecoder` from three/addons); LOD near, octahedral impostors far; replace most grass with litter, seedlings and root meshes.
- S5 Life and sound: CC0 field-recording ambience loops (credit each); rigged GLB birds/animals, or keep primitives far away as silhouettes.
- Decision point: move to WebGPURenderer + TSL (compute foliage, built-in TRAA/GTAO/SSR/volumetrics) vs stay on WebGL2 with custom passes. The custom volumetric pass stayed cheap on WebGL2 (S3d); revisit if TRAA (phone shimmer) or SSR (pond) is wanted.
- Tooling: `scripts/shots.sh OUT [high,low,phone]` (Playwright + `?debug` fixed viewpoints → PNGs, frame/render ms, draw calls, layout hash). Compare A/B in alternating runs; the dev iGPU is noisy.

## Open housekeeping
- Budgets: `assets/` 11 MB (2026-10-06). Keep an eye on the phone frame rate after S2. It hasn't been checked on a device.

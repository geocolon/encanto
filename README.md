<img width="100%" alt="Encanto by Paloma" src="https://github.com/user-attachments/assets/76b04aa4-cfeb-4c74-b271-79e2ba564adb" />

# Encanto by Paloma

Walk through a crowded Amazon rainforest valley in a gentle sun shower, right in your browser.

**Live site:** https://geocolon.github.io/encanto/

Everything is built in code inside a single `index.html`: terrain, trees, grass, flowers, animals, rain and the forest soundscape. Beyond three.js (from a CDN), the only downloads are CC0 files from Poly Haven in `assets/` (about 11 MB): sky and forest-floor textures, bark and moss textures, and leaf atlases cut from scanned plants (by `scripts/build-foliage.py`).

## Controls

| Desktop | Phone |
| --- | --- |
| Mouse to look (click to capture) | Drag on the right side to look |
| W A S D or arrow keys to move | Left-thumb joystick to walk |
| Shift to sprint, Space to jump, Esc to pause | Run and Jump buttons |

## What's in the valley

- Giant kapok-style trees with buttress roots, a dense canopy and understory saplings
- Monstera, ferns, tree ferns, heliconia, orchids and other tropical flowers
- Moss-covered boulders and fallen trees, blue-green grass across the forest floor
- Scarlet, blue-and-yellow, hyacinth and red-and-green macaws, parakeets, troupials, tanagers, hummingbirds, toucans, blue morphos and capybaras
- A slow sun shower with pond ripples and synthesized rain, bird and insect sounds
- A 360° ring of misty mountains, a dark green understory lit by how open the canopy is, ray-marched sun shafts and humid haze, rain-wet bark, soil and leaves, and a warm lens flare

## Run it locally

```bash
git clone https://github.com/geocolon/encanto.git
cd encanto
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly from disk also works in most browsers.

## Making changes

This repo includes a Claude Code subagent, `encanto-builder`, that edits the site, checks it, commits and pushes:

```bash
cd encanto
claude
> use the encanto-builder agent to make the rain a little heavier
```

Before every commit it runs:

```bash
scripts/check.sh
```

The script syntax-checks the game code and, if Playwright is installed (`npm i -D playwright`), loads the page in headless Chromium to make sure the scene builds without errors.

## Built with

- [three.js](https://threejs.org/) r186 (MIT)
- [Poly Haven](https://polyhaven.com/) (CC0): Rainforest Trail and Kloofendal 38d Partly Cloudy (Pure Sky) HDRIs; Forest Leaves 03, Brown Mud Leaves 01, Red Laterite Soil Stones, Japanese Hackberry Bark, Moss Wood and Palm Tree Bark textures; Fern 02, Anthurium Botany 01, Calathea Orbifolia 01, Pachira Aquatica 01, Shrub Sorrel 01, Potted Plant 02 and Weed Plant 02 models (leaf maps)
- Fonts: Spectral SC and Karla from Google Fonts (SIL Open Font License)

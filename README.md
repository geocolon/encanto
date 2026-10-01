# Encanto by Paloma

Walk through a crowded Amazon rainforest valley in a gentle sun shower, right in your browser.

**Live site:** https://geocolon.github.io/encanto/

Everything is generated in code inside a single `index.html`: terrain, trees, grass, flowers, animals, rain and the forest soundscape. The only download is three.js from a CDN.

## Controls

| Desktop | Phone |
| --- | --- |
| Mouse to look (click to capture) | Drag on the right side to look |
| W A S D or arrow keys to move | Left-thumb joystick to walk |
| Shift to sprint, Space to jump | Run and Jump buttons |
| E to read the Waystone, Esc to pause | Tap the Waystone prompt |

## What's in the valley

- Giant kapok-style trees with buttress roots, a dense canopy and understory saplings
- Monstera, ferns, tree ferns, heliconia, orchids and other tropical flowers
- Moss-covered boulders and fallen trees, blue-green grass across the forest floor
- Scarlet, blue-and-yellow, hyacinth and red-and-green macaws, parakeets, troupials, tanagers, hummingbirds, toucans, blue morphos and capybaras
- A slow sun shower with pond ripples and synthesized rain, bird and insect sounds
- A 360° ring of misty mountains, god rays and a warm lens flare

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

- [three.js](https://threejs.org/) r128 (MIT)
- Fonts: Spectral SC and Karla from Google Fonts (SIL Open Font License)

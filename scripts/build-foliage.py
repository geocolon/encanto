#!/usr/bin/env python3
"""Builds the foliage atlases in assets/textures/ from Poly Haven (CC0) scanned plant models.

  python3 scripts/build-foliage.py [cache_dir]

Downloads the 1k diffuse + alpha leaf maps of a few Poly Haven plants, cuts out single leaves, and packs:
  foliage_leaves_{diff,alpha}.jpg  single leaves, base at the bottom-centre of each cell (ferns, understory, ground cover)
  foliage_cards_{diff,alpha}.jpg   three twig clusters for tree crowns + four hanging vine strips
Prints the cell table that index.html uses (LEAF_CELLS / CARD_CELLS), in UV units with v=0 at the bottom.
Needs Pillow, numpy and scipy. Deterministic: the same sources always give the same atlases.
"""
import json, os, sys, urllib.request
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join('/tmp', 'encanto-foliage-src')
OUT = os.path.join(ROOT, 'assets', 'textures')
os.makedirs(CACHE, exist_ok=True)
BASE = 'https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k'
SOURCES = {  # file stem -> Poly Haven model id
  'fern_02': 'fern_02', 'anthurium_botany_01': 'anthurium_botany_01', 'calathea_orbifolia_01': 'calathea_orbifolia_01',
  'pachira_aquatica_01_leaves': 'pachira_aquatica_01', 'shrub_sorrel_01': 'shrub_sorrel_01',
  'potted_plant_02_leaves': 'potted_plant_02', 'weed_plant_02': 'weed_plant_02'}

def src(stem, cache={}):
  if stem not in cache:
    out = []
    for m in ('diff', 'alpha'):
      fn = os.path.join(CACHE, f'{stem}_{m}_1k.jpg')
      if not os.path.exists(fn): urllib.request.urlretrieve(f'{BASE}/{SOURCES[stem]}/{stem}_{m}_1k.jpg', fn)
      out.append(Image.open(fn))
    cache[stem] = (out[0].convert('RGB'), np.array(out[1].convert('L')))
  return cache[stem]

# leaf: (source, crop box in the 1k atlas, degrees CCW so the base ends at the bottom)
LEAVES = {
  'fern1': ('fern_02', (321, 25, 466, 782), 0), 'fern2': ('fern_02', (520, 28, 674, 512), 0),
  'fern4': ('fern_02', (91, 114, 240, 971), 0), 'fern5': ('fern_02', (525, 523, 644, 988), 0),
  'anth1': ('anthurium_botany_01', (494, 31, 1012, 241), 90), 'anth2': ('anthurium_botany_01', (36, 58, 464, 224), 90),
  'anth4': ('anthurium_botany_01', (229, 329, 657, 495), 90), 'anth5': ('anthurium_botany_01', (790, 427, 981, 976), 0),
  'anth6': ('anthurium_botany_01', (17, 503, 704, 743), -90), 'anth7': ('anthurium_botany_01', (47, 742, 734, 999), 90),
  'cal1': ('calathea_orbifolia_01', (45, 22, 431, 471), 0), 'cal2': ('calathea_orbifolia_01', (475, 16, 900, 448), 0),
  'pach2': ('pachira_aquatica_01_leaves', (500, 43, 911, 465), 0),
  'clov1': ('shrub_sorrel_01', (6, 20, 398, 369), 0), 'clov2': ('shrub_sorrel_01', (465, 20, 882, 399), 0),
  'clov3': ('shrub_sorrel_01', (19, 438, 436, 816), 0),
  'syn1': ('potted_plant_02_leaves', (28, 4, 458, 650), 0), 'syn2': ('potted_plant_02_leaves', (440, 15, 735, 490), 0),
  'syn4': ('potted_plant_02_leaves', (88, 560, 415, 1020), 0), 'syn5': ('potted_plant_02_leaves', (395, 465, 925, 1024), 0),
  'weed1': ('weed_plant_02', (11, 0, 257, 592), 180), 'weed2': ('weed_plant_02', (244, 0, 864, 294), -90),
  'weed5': ('weed_plant_02', (146, 500, 883, 796), -90), 'weed6': ('weed_plant_02', (349, 781, 1024, 1020), -90),
}
ERODE = {'syn5': 9, 'syn1': 6}

def leaf(key, pad=6):
  """Cut one leaf out: crop, keep only the main connected piece (drops bits of neighbours), rotate base-down."""
  stem, (x0, y0, x1, y1), rot = LEAVES[key]; d, a = src(stem); it = ERODE.get(key, 3)
  x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(1024, x1 + pad), min(1024, y1 + pad)
  ac = a[y0:y1, x0:x1].astype(np.float32) / 255
  if not key.startswith(('fern', 'pach')):   # thin pinnae / leaflets would fall apart under erosion
    er = ndimage.binary_erosion(ac > 0.5, iterations=it); lab, k = ndimage.label(er)
    if k > 1:
      keep = lab == (np.argmax(ndimage.sum(er, lab, range(1, k + 1))) + 1)
      ac = ac * ndimage.binary_dilation(keep, iterations=it + 3)
  dc, al = d.crop((x0, y0, x1, y1)), Image.fromarray((ac * 255).astype(np.uint8))
  if rot: dc, al = dc.rotate(rot, expand=True, resample=Image.BICUBIC), al.rotate(rot, expand=True, resample=Image.BICUBIC)
  # trim to the alpha bounds so the base really sits on the cell's bottom edge
  bb = al.point(lambda v: 255 if v > 40 else 0).getbbox()
  return dc.crop(bb), al.crop(bb)

def fill_bleed(rgb, alpha):
  """Push-pull: give transparent texels the colour of nearby leaves, so mipmaps never bleed a background colour."""
  c = np.asarray(rgb, np.float32); a = np.asarray(alpha, np.float32) / 255
  solid = a > 0.5; acc = c * solid[..., None]; w = solid.astype(np.float32)
  out = c.copy(); done = solid.copy()
  for r in (2, 6, 16, 48, 128, 400):   # growing box blurs of premultiplied colour fill outward ring by ring
    bc = np.stack([ndimage.uniform_filter(acc[..., i], 2 * r + 1) for i in range(3)], -1)
    bw = ndimage.uniform_filter(w, 2 * r + 1)
    m = (~done) & (bw > 1e-3)
    out[m] = bc[m] / bw[m][..., None]; done |= m
  out[~done] = c[solid].mean(0) if solid.any() else 0
  return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))

def save(name, rgb, alpha, size):
  rgb = fill_bleed(rgb, alpha)
  rgb.save(os.path.join(OUT, f'{name}_diff.jpg'), quality=86, optimize=True, progressive=True)
  alpha.save(os.path.join(OUT, f'{name}_alpha.jpg'), quality=90, optimize=True)

def uv(x, y, w, h, S):  # pixel rect (top-left origin) -> [u, v, du, dv] with v from the bottom
  return [round(x / S, 5), round(1 - (y + h) / S, 5), round(w / S, 5), round(h / S, 5)]

# ---------- single-leaf atlas ----------
S = 2048
LAYOUT = [  # key, x, y, w, h (pixels)
  ('fern1', 0, 0, 256, 1024), ('fern2', 256, 0, 256, 1024), ('fern4', 512, 0, 256, 1024), ('fern5', 768, 0, 256, 1024),
  ('anth1', 1024, 0, 256, 512), ('anth2', 1280, 0, 256, 512), ('anth4', 1536, 0, 256, 512), ('anth5', 1792, 0, 256, 512),
  ('anth6', 1024, 512, 256, 512), ('anth7', 1280, 512, 256, 512), ('weed2', 1536, 512, 256, 512), ('weed6', 1792, 512, 256, 512),
  ('cal1', 0, 1024, 512, 512), ('cal2', 512, 1024, 512, 512), ('syn1', 1024, 1024, 512, 512), ('syn2', 1536, 1024, 512, 512),
  ('syn4', 0, 1536, 512, 512), ('syn5', 512, 1536, 512, 512), ('weed1', 1024, 1536, 256, 512), ('weed5', 1280, 1536, 256, 512),
  ('clov1', 1536, 1536, 256, 256), ('clov2', 1536, 1792, 256, 256), ('clov3', 1792, 1536, 256, 256), ('pach2', 1792, 1792, 256, 256),
]
rgb, alpha = Image.new('RGB', (S, S)), Image.new('L', (S, S))
cells = {}
for key, x, y, w, h in LAYOUT:
  d, a = leaf(key); P = 8
  sc = min((w - 2 * P) / d.width, (h - 2 * P) / d.height); nw, nh = int(d.width * sc), int(d.height * sc)
  d, a = d.resize((nw, nh), Image.LANCZOS), a.resize((nw, nh), Image.LANCZOS)
  px, py = x + (w - nw) // 2, y + h - P - nh            # base on the bottom edge, centred
  rgb.paste(d, (px, py)); alpha.paste(a, (px, py))
  cells[key] = uv(px, py, nw, nh, S)                    # tight rect: base at v=0, tip at v=1
save('foliage_leaves', rgb, alpha, S)

# ---------- crown + vine card atlas ----------
rng = np.random.default_rng(20260930)
C = 2048; crgb, calpha = Image.new('RGB', (C, C)), Image.new('L', (C, C))
LEAF_IMG = {k: leaf(k) for k in LEAVES}

def stamp(x, y, key, size, ang, shade, region):
  """Paste one leaf with its base at (x, y), pointing at angle ang (degrees, 0 = up), clipped to the region."""
  d, a = LEAF_IMG[key]; sc = size / max(d.width, d.height)
  d, a = d.resize((max(2, int(d.width * sc)), max(2, int(d.height * sc))), Image.LANCZOS), a.resize((max(2, int(d.width * sc)), max(2, int(d.height * sc))), Image.LANCZOS)
  d = Image.fromarray(np.clip(np.asarray(d, np.float32) * shade, 0, 255).astype(np.uint8))
  # pivot at the base: pad so the base-centre is the image centre, then rotate
  w, h = d.size; pd = Image.new('RGB', (w, 2 * h)); pa = Image.new('L', (w, 2 * h)); pd.paste(d, (0, 0)); pa.paste(a, (0, 0))
  pd, pa = pd.rotate(-ang, expand=True, resample=Image.BICUBIC), pa.rotate(-ang, expand=True, resample=Image.BICUBIC)
  ox, oy = int(x - pd.width / 2), int(y - pd.height / 2)
  rx0, ry0, rx1, ry1 = region
  canvas_a = Image.new('L', (C, C)); canvas_a.paste(pa, (ox, oy))
  clip = Image.new('L', (C, C)); clip.paste(255, (rx0 + 6, ry0 + 6, rx1 - 6, ry1 - 6))
  m = Image.fromarray(np.minimum(np.asarray(canvas_a), np.asarray(clip)))
  layer = Image.new('RGB', (C, C)); layer.paste(pd, (ox, oy))
  crgb.paste(layer, (0, 0), m); calpha.paste(Image.fromarray(np.maximum(np.asarray(calpha), np.asarray(m))))

def twig(x0, y0, x1, y1, width, region):
  """A thin woody twig drawn as a tapered line (dark brown-grey)."""
  from PIL import ImageDraw
  dr, da = ImageDraw.Draw(crgb), ImageDraw.Draw(calpha); n = 12
  for i in range(n):
    t0, t1 = i / n, (i + 1) / n
    p0 = (x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0); p1 = (x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1)
    w = max(1, int(width * (1 - 0.7 * t0)))
    dr.line([p0, p1], fill=(62, 52, 40), width=w); da.line([p0, p1], fill=255, width=w)

def crown_cell(cx, cy, keys, n, size, spread):
  """A branching twig cluster in a 1024 cell: leaves radiate from the twigs, inner ones darker (self-shade)."""
  region = (cx, cy, cx + 1024, cy + 1024); ox, oy = cx + 512, cy + 512
  tips = []
  for b in range(7):  # twigs radiating from the centre, so the card reads the same at any roll angle
    ang = np.radians(b * 360 / 7 + rng.uniform(-18, 18)); L = rng.uniform(300, 420)
    ex, ey = ox + np.sin(ang) * L, oy - np.cos(ang) * L; twig(ox, oy, ex, ey, 9, region); tips.append((ox, oy, ex, ey))
  order = []
  for i in range(n):
    x0, y0, x1, y1 = tips[rng.integers(len(tips))]; t = rng.uniform(0.25, 1.0)
    bx, by = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
    base_ang = np.degrees(np.arctan2(x1 - x0, -(y1 - y0)))
    ang = base_ang + rng.choice([-1, 1]) * rng.uniform(15, spread)
    depth = rng.uniform(0, 1) * (0.4 + 0.6 * t)       # leaves near the centre sit deeper in the cluster: darker
    order.append((depth, bx, by, keys[rng.integers(len(keys))], size * rng.uniform(0.7, 1.1), ang))
  for depth, bx, by, key, sz, ang in sorted(order):   # back to front
    stamp(bx, by, key, sz, ang, 0.62 + 0.42 * depth, region)
  return uv(cx, cy, 1024, 1024, C)

card = {}
card['pachira'] = crown_cell(0, 0, ['pach2'], 48, 280, 80)
card['broad'] = crown_cell(1024, 0, ['anth1', 'anth2', 'anth4', 'anth5', 'anth6', 'anth7'], 80, 230, 70)
card['small'] = crown_cell(0, 1024, ['anth1', 'anth2', 'anth5', 'weed6', 'weed2', 'anth7'], 150, 150, 85)
# hanging vine strips: a wavy stem from the top edge with small leaves alternating left/right
from PIL import ImageDraw
for s in range(4):
  x0, y0 = 1024 + s * 256, 1024; region = (x0, y0, x0 + 256, y0 + 1024)
  keys = [['syn1', 'syn2', 'syn4'], ['anth5', 'anth6', 'weed6'], ['syn2', 'syn5', 'anth7'], ['anth1', 'weed2', 'anth4']][s]
  for strand in range(2):
    xs, amp, ph, L = x0 + rng.uniform(70, 186), rng.uniform(6, 16), rng.uniform(0, 6), rng.uniform(760, 1010)
    pts = [(xs + np.sin(y * 0.02 + ph) * amp, y0 + y) for y in range(0, int(L), 8)]
    ImageDraw.Draw(crgb).line(pts, fill=(70, 66, 40), width=3); ImageDraw.Draw(calpha).line(pts, fill=255, width=3)
    y = rng.uniform(10, 40); side = 1
    while y < L - 20:
      x = xs + np.sin(y * 0.02 + ph) * amp; sz = rng.uniform(70, 110) * (1 - 0.3 * y / 1024)
      stamp(x, y0 + y, keys[rng.integers(len(keys))], sz, side * rng.uniform(100, 150), rng.uniform(0.7, 1.05), region)
      side = -side; y += rng.uniform(34, 60)
  card[f'vine{s}'] = uv(x0, y0, 256, 1024, C)
save('foliage_cards', crgb, calpha, C)

print('LEAF_CELLS =', json.dumps(cells, separators=(',', ':')))
print('CARD_CELLS =', json.dumps(card, separators=(',', ':')))

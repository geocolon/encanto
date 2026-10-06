// Encanto before/after screenshots and frame times (called by scripts/shots.sh, which serves the repo on $PORT).
//   node scripts/shots.mjs OUT_DIR [high,low,phone]
// For each tier: loads index.html?debug, enters the forest, places the camera at five fixed viewpoints through
// window.__enc (player position/yaw/pitch, terrain height), saves <tier>-<view>.png, and prints:
//   - frame: median requestAnimationFrame interval over four seconds on the trail (vsync and frame-rate limits off)
//   - render: median cost of one composer.render() forced to finish with a 1-pixel readPixels (GPU-bound cost)
//   - draw calls and triangles for one full frame, and the seeded layout hash (must not change between runs)
// IMPORTANT: these numbers are only for before/after comparison on the same machine. Headless Chromium uses the real
// GPU through ANGLE/Metal on macOS but SwiftShader (software GL) elsewhere, and neither is a phone. The "phone" tier is
// touch emulation (pointer: coarse) on a 844x390 viewport, which selects the phone Q preset, not phone hardware.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const OUT = path.resolve(process.argv[2] || '.');
const TIERS = (process.argv[3] || 'high,phone').split(',').map(s => s.trim()).filter(Boolean);
const PORT = process.env.PORT;
if (!PORT) { console.error('shots: run through scripts/shots.sh'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const gpu = process.platform === 'darwin';
const TIER = {
  high:  { query: 'quality=high', ctx: { viewport: { width: 1280, height: 720 } } },
  low:   { query: 'quality=low',  ctx: { viewport: { width: 1280, height: 720 } } },
  phone: { query: '',             ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
};
// Viewpoints: x is given relative to the trail line pathX(z); yaw 0 looks north (-z), -PI/2 looks east (+x)
const VIEWS_ALL = [
  { name: 'trail',   z: 70,  dx: 0,     yaw: 0,             pitch: -0.03 },  // on the trail, looking along it
  { name: 'canopy',  z: -20, dx: -14,   yaw: -Math.PI / 2,  pitch: 0.05 },   // under dense canopy, across the trail
  { name: 'sun',     z: 132, dx: 0,     yaw: -0.12,         pitch: 0.45 },   // toward the sun through the sky window
  { name: 'pond',    z: 18,  dx: null, x: 29, yaw: -Math.PI / 2, pitch: -0.1 },  // at the pond's west edge, looking across the water
  { name: 'foliage', z: 40,  dx: 2.6,   yaw: -Math.PI / 2,  pitch: -0.3 },   // close-up of trail-side plants
];
const VIEWS = process.env.SHOTS_VIEWS ? VIEWS_ALL.filter(v => process.env.SHOTS_VIEWS.split(',').includes(v.name)) : VIEWS_ALL;   // e.g. SHOTS_VIEWS=trail,sun

const browser = await chromium.launch({ args: gpu
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit']
  : ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
console.log(`shots: ${gpu ? 'GPU (ANGLE/Metal)' : 'software GL (SwiftShader)'}; PNGs in ${OUT}`);
for (const tier of TIERS) {
  const cfg = TIER[tier]; if (!cfg) { console.error(`shots: unknown tier ${tier}`); continue; }
  const context = await browser.newContext(cfg.ctx);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${PORT}/?debug${cfg.query ? '&' + cfg.query : ''}`, { waitUntil: 'commit' });
  await page.waitForSelector('#enter:not([hidden])', { state: 'attached', timeout: gpu ? 180000 : 600000 });
  await page.addStyleTag({ content: '.hud,#start,#splash,#details{display:none!important}' });
  await page.evaluate(() => { const s = document.getElementById('splash'); s && s.remove(); document.getElementById('enter').click(); });
  if (process.env.SHOTS_EVAL) await page.evaluate(process.env.SHOTS_EVAL);   // tuning: e.g. SHOTS_EVAL='__enc.renderer.toneMappingExposure=1.2'
  const place = v => page.evaluate(v => {
    const E = window.__enc, p = E.player, pathX = z => Math.sin(z*0.012)*3.5 + Math.sin(z*0.05)*0.8;
    p.x = v.dx === null ? v.x : pathX(v.z) + v.dx; p.z = v.z; p.yaw = v.yaw; p.pitch = v.pitch; p.vy = 0; p.bob = 0;
    p.y = Math.max(E.height(p.x, p.z), E.WATER_Y - 0.9) + 1.25;
  }, v);
  for (const v of VIEWS) {
    await place(v);
    await page.waitForTimeout(1200);   // let the shadow box, grass ring and any temporal effects settle
    await page.screenshot({ path: path.join(OUT, `${tier}-${v.name}.png`), scale: 'css' });
  }
  // Timing on the trail view
  await place(VIEWS_ALL[0]); await page.waitForTimeout(800);
  const m = await page.evaluate(async () => {
    const E = window.__enc, r = E.renderer, gl = r.getContext(), px = new Uint8Array(4);
    const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    const frame = await new Promise(res => { const ts = []; const step = t => { ts.push(t); if (t - ts[0] < 4000) requestAnimationFrame(step); else res(med(ts.slice(1).map((v, i) => v - ts[i]))); }; requestAnimationFrame(step); });
    // forced-sync render cost (runs between animation frames)
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (let i = 0; i < 5; i++) { E.composer.render(); sync(); }
    const rs = [];
    for (let i = 0; i < 40; i++) { const t0 = performance.now(); E.composer.render(); sync(); rs.push(performance.now() - t0); }
    const render = med(rs);
    r.info.autoReset = false; r.info.reset(); E.composer.render(); sync();
    const calls = r.info.render.calls, tris = r.info.render.triangles; r.info.autoReset = true;
    const ri = gl.getExtension('WEBGL_debug_renderer_info'), gpuName = ri ? gl.getParameter(ri.UNMASKED_RENDERER_WEBGL) : '?';
    return { gpuName, frame, render, calls, tris, hash: E.layout.hash, trunks: E.layout.trunks, dpr: r.getPixelRatio(), size: [r.domElement.width, r.domElement.height] };
  });
  console.log(`shots: ${tier.padEnd(5)} frame ${m.frame.toFixed(2)} ms (${(1000 / m.frame).toFixed(0)} fps)  render ${m.render.toFixed(2)} ms  ` +
    `calls ${m.calls}  tris ${(m.tris / 1e6).toFixed(2)}M  ${m.size.join('x')}@${m.dpr}  layout ${m.hash} (${m.trunks} trunks)`);
  if (tier === TIERS[0]) console.log(`shots: GL renderer ${m.gpuName}`);
  if (errors.length) console.log(`shots: ${tier} page errors:\n  ` + errors.join('\n  '));
  await context.close();
}
await browser.close();

#!/usr/bin/env node
/* Builds the scanned models in assets/models/*.glb from Poly Haven (CC0) glTF sources.

     node scripts/build-models.mjs [cache_dir]

   For every entry in MODELS: downloads the 1k glTF (and, for alpha-cut plants, the separate 1k alpha map) into
   cache_dir, keeps the listed mesh nodes, bakes each node's transform, re-centres it (plants: base at the origin;
   everything else: bounding-box centre at the origin), welds and simplifies it to its triangle budget, merges the
   alpha map into the albedo, resizes every texture (1k max) to WebP (EXT_texture_webp), and writes one GLB per source
   with meshopt compression (EXT_meshopt_compression, quantized positions/UVs). Each kept node becomes a separate
   mesh named after the key in `nodes` (index.html looks them up by name).

   Tools (gltf-transform, meshoptimizer, sharp) are installed into cache_dir/tools on first run, never into the repo.
   Deterministic: the same sources and settings always give the same GLBs. Prints triangles and bytes per model.
   toktx (KTX2) is not used: it is not on the dev machine, and WebP is enough at these sizes. */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const CACHE = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'encanto-models-src'));
const OUT = path.join(ROOT, 'assets', 'models');
const TOOLS = path.join(CACHE, 'tools');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TOOLS, { recursive: true });
const DEPS = ['@gltf-transform/core@4.5.1', '@gltf-transform/extensions@4.5.1', '@gltf-transform/functions@4.5.1', 'meshoptimizer@1.3.0', 'sharp@0.35.5'];
if (!fs.existsSync(path.join(TOOLS, 'node_modules', '@gltf-transform', 'functions'))) {
  if (!fs.existsSync(path.join(TOOLS, 'package.json'))) fs.writeFileSync(path.join(TOOLS, 'package.json'), '{"private":true}');
  console.log('build-models: installing tools into', TOOLS);
  execSync(`npm i --no-audit --no-fund ${DEPS.join(' ')}`, { cwd: TOOLS, stdio: 'inherit' });
}
const req = createRequire(path.join(TOOLS, 'package.json'));
const { NodeIO, Document } = req('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTTextureWebP, KHRMaterialsSpecular, KHRMaterialsIOR } = req('@gltf-transform/extensions');
const { weldPrimitive, simplifyPrimitive, transformMesh, prune, dedup, meshopt, getBounds } = req('@gltf-transform/functions');
const { MeshoptSimplifier, MeshoptEncoder } = await import(req.resolve('meshoptimizer'));
const sharp = req('sharp');
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;

/* out: GLB name; src: Poly Haven id; kind: 'plant' (base at origin, alpha merged) or 'solid' (centred);
   nodes: { meshName: [source node name, triangle budget, max simplify error (default 0.02)] }; tex: [albedo px, normal px, ARM/roughness px or 0 to drop] */
const MODELS = [
  { out: 'fern_02', src: 'fern_02', kind: 'plant', tex: [1024, 512, 0],
    nodes: { a: ['fern_02_b', 1100], b: ['fern_02_c', 1100], c: ['fern_02_a', 600], d: ['fern_02_d', 600] } },
  { out: 'anthurium_botany_01', src: 'anthurium_botany_01', kind: 'plant', tex: [1024, 512, 0],
    nodes: { a: ['anthurium_botany_01_a', 1800], b: ['anthurium_botany_01_b', 1700], c: ['anthurium_botany_01_c', 1300], d: ['anthurium_botany_04_d', 1000] } },
  { out: 'calathea_orbifolia_01', src: 'calathea_orbifolia_01', kind: 'plant', tex: [1024, 512, 0],
    nodes: { a: ['calathea_orbifolia_01_a', 1500], b: ['calathea_orbifolia_01_b', 1000], c: ['calathea_orbifolia_01_c', 1000] } },
  // ground objects (stage 4 step 2): bare scans, centred on their bounding box; index.html orients and fits them
  { out: 'rock_moss_set_02', src: 'rock_moss_set_02', kind: 'solid', tex: [1024, 1024, 512],
    nodes: { a: ['rock_moss_set_02_rock08', 700], b: ['rock_moss_set_02_rock09', 700], c: ['rock_moss_set_02_rock10', 700], d: ['rock_moss_set_02_rock11', 700],
      e: ['rock_moss_set_02_rock12', 700], pa: ['rock_moss_set_02_rock08', 110, 0.2], pb: ['rock_moss_set_02_rock10', 110, 0.2], pc: ['rock_moss_set_02_rock12', 110, 0.2] } },
  { out: 'dead_tree_trunk', src: 'dead_tree_trunk', kind: 'solid', tex: [1024, 1024, 512], nodes: { a: ['dead_tree_trunk', 2600] } },
  { out: 'dead_tree_trunk_02', src: 'dead_tree_trunk_02', kind: 'solid', tex: [1024, 1024, 512], nodes: { a: ['dead_tree_trunk_02', 2600] } },
  { out: 'root_cluster_01', src: 'root_cluster_01', kind: 'solid', tex: [1024, 1024, 512], nodes: { a: ['root_cluster_01', 2400] } },
  { out: 'root_cluster_02', src: 'root_cluster_02', kind: 'solid', tex: [1024, 1024, 512],
    nodes: { a: ['root_cluster_02_d', 700], b: ['root_cluster_02_f', 700], c: ['root_cluster_02_b', 700] } },
  { out: 'single_root', src: 'single_root', kind: 'solid', tex: [1024, 1024, 512], nodes: { a: ['single_root', 1200] } },
];

const fetchTo = async (url, fn) => {
  if (fs.existsSync(fn)) return;
  fs.mkdirSync(path.dirname(fn), { recursive: true });
  const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(fn, Buffer.from(await r.arrayBuffer()));
};
async function download(id, alpha) {
  const dir = path.join(CACHE, id), gl = path.join(dir, id + '.gltf');
  if (!fs.existsSync(gl)) {
    const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
    const e = files.gltf['1k'].gltf;
    for (const [f, v] of Object.entries(e.include)) await fetchTo(v.url, path.join(dir, f));
    await fetchTo(e.url, gl);
  }
  if (alpha) await fetchTo(`https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/${id}/${id}_alpha_1k.jpg`, path.join(dir, 'textures', `${id}_alpha_1k.jpg`));
  return gl;
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const triCount = mesh => mesh.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);

for (const M of MODELS) {
  const gl = await download(M.src, M.kind === 'plant');
  const doc = await io.read(gl);
  const root = doc.getRoot(), scene = root.listScenes()[0];
  // one new node per key, from a copy of the source node's mesh with its world transform baked in (the same source can
  // appear under several keys, e.g. a rock at two triangle budgets); the source nodes are dropped afterwards
  const srcNodes = new Map(root.listNodes().map(n => [n.getName(), n]));
  const keep = new Map(Object.entries(M.nodes).map(([k, [n, t, e]]) => [k, { key: k, src: n, tris: t, err: e || 0.02 }]));
  for (const want of keep.values()) {
    const sn = srcNodes.get(want.src);
    if (!sn || !sn.getMesh()) throw new Error(`${M.src}: node ${want.src} not found`);
    const mesh = doc.createMesh(want.key);
    for (const p of sn.getMesh().listPrimitives()) {
      const np = doc.createPrimitive().setMode(p.getMode()).setMaterial(p.getMaterial()).setIndices(p.getIndices().clone());
      for (const sem of p.listSemantics()) if (!/^COLOR_/.test(sem)) np.setAttribute(sem, p.getAttribute(sem).clone());   // vertex colours: unused
      weldPrimitive(np, { tolerance: 0.0001 });
      mesh.addPrimitive(np);
    }
    transformMesh(mesh, sn.getWorldMatrix());
    const node = doc.createNode(want.key).setMesh(mesh);
    scene.addChild(node);
    const before = triCount(mesh);
    for (const prim of mesh.listPrimitives()) {
      const n = prim.getIndices().getCount() / 3, ratio = Math.min(1, want.tris / before);
      if (ratio < 1) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: want.err, lockBorder: false });
    }
    // re-centre: plants keep their base at y=0 under the stem; solids get their box centre at the origin
    const b = getBounds(node), c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    if (M.kind === 'plant') c[1] = 0;
    const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -c[0], -c[1], -c[2], 1];
    transformMesh(mesh, T);
    want.done = { before, after: triCount(mesh) };
  }
  for (const n of srcNodes.values()) n.dispose();
  // materials: plain metal/rough (three's MeshStandardMaterial); the leaf alpha goes into the albedo's alpha channel
  for (const mat of root.listMaterials()) {
    mat.setExtension('KHR_materials_specular', null).setExtension('KHR_materials_ior', null);
    const tex = [[mat.getBaseColorTexture(), M.tex[0], true], [mat.getNormalTexture(), M.tex[1], false], [mat.getMetallicRoughnessTexture(), M.tex[2], false]];
    if (!M.tex[2] && mat.getMetallicRoughnessTexture()) mat.setMetallicRoughnessTexture(null);
    for (const [t, px, albedo] of tex) {
      if (!t || !px) continue;
      let img = sharp(Buffer.from(t.getImage())).removeAlpha();
      if (albedo && M.kind === 'plant') {   // (sharp applies removeAlpha last in a pipeline, so materialize the RGB first)
        const raw = { width: 1024, height: 1024 };
        const rgb = await img.resize(1024, 1024).raw().toBuffer();
        const a = await sharp(path.join(CACHE, M.src, 'textures', `${M.src}_alpha_1k.jpg`)).greyscale().resize(1024, 1024).raw().toBuffer();
        img = sharp(await sharp(rgb, { raw: { ...raw, channels: 3 } }).joinChannel(a, { raw: { ...raw, channels: 1 } }).png().toBuffer());
      }
      const out = await img.resize(px, px, { kernel: 'lanczos3' }).webp({ quality: albedo ? 82 : 86, alphaQuality: 90, effort: 6 }).toBuffer();
      t.setImage(new Uint8Array(out)).setMimeType('image/webp').setURI(`${M.out}_${t.getName() || 'tex'}.webp`);
    }
  }
  doc.createExtension(EXTTextureWebP).setRequired(true);
  await doc.transform(prune({ keepLeaves: false }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const fn = path.join(OUT, `${M.out}.glb`);
  await io.write(fn, doc);
  const sz = fs.statSync(fn).size;
  console.log(`build-models: ${M.out}.glb ${(sz / 1024).toFixed(0)} KB  ` + [...keep.values()].map(w => `${w.key} ${w.done.before}->${w.done.after}`).join('  '));
}
const total = fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`build-models: assets/models total ${(total / 1048576).toFixed(2)} MB`);

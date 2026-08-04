// scripts/verify-anims.mjs — bake QA probe. Decodes every mocap GLB (base +
// extras packs) WITHOUT three.js: checks clip presence against the manifest,
// per-clip hip-track floors (the "pelvis a metre under the court" defect), and
// size budgets. Exit 1 on any failure — safe for CI.
// Run: node scripts/verify-anims.mjs
import { readFileSync, readdirSync } from 'node:fs';
import manifest from '../src/data/anims.manifest.json' with { type: 'json' };

const DIR = 'public/assets/anims';
const BASE_BUDGET_KB = 1600;   // eager per-archetype payload
const X_BUDGET_KB = 1100;      // lazy extras pack
// clips allowed to ride LOW for real (floor poses); everything else must keep
// its hips above 40% of rest height for the bulk of the clip
const LOW_OK = new Set(['stumble', 'dive', 'slide', 'dejected', 'kickFlair', 'kickSweep', 'kickMeia', 'kickMeiaBack']);

function parseGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart);
  return { json, bin };
}

function accessorFloats({ json, bin }, idx) {
  const acc = json.accessors[idx];
  const bv = json.bufferViews[acc.bufferView];
  const comps = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type];
  const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return new Float32Array(bin.buffer, bin.byteOffset + start, acc.count * comps);
}

let fail = 0;
const bad = (msg) => { console.error('FAIL', msg); fail = 1; };

const files = readdirSync(DIR).filter((f) => f.endsWith('.glb'));
const archs = [...new Set(files.map((f) => f.replace(/^mocap-(x-)?/, '').replace('.glb', '')))].sort();
const wantBase = manifest.filter((m) => m.pack !== 'x').map((m) => m.name);
const wantX = manifest.filter((m) => m.pack === 'x').map((m) => m.name);

for (const arch of archs) {
  for (const [file, want, budget] of [
    [`mocap-${arch}.glb`, wantBase, BASE_BUDGET_KB],
    [`mocap-x-${arch}.glb`, wantX, X_BUDGET_KB],
  ]) {
    let g;
    try { g = parseGlb(`${DIR}/${file}`); } catch (e) { bad(`${file}: ${e.message}`); continue; }
    const { json } = g;
    const kb = readFileSync(`${DIR}/${file}`).length / 1024;
    if (kb > budget) bad(`${file}: ${kb.toFixed(0)} KB over ${budget} KB budget`);

    const names = (json.animations ?? []).map((a) => a.name);
    for (const n of want) if (!names.includes(n)) bad(`${file}: missing clip ${n}`);

    // rest hip height from the exported skeleton
    const hipsNode = json.nodes.find((n) => n.name === 'Hips');
    const restY = Math.abs(hipsNode?.translation?.[1] ?? 0);
    if (!restY) { bad(`${file}: no Hips rest translation`); continue; }

    const hipsIdx = json.nodes.indexOf(hipsNode);
    for (const anim of json.animations ?? []) {
      const ch = anim.channels.find((c) => c.target.node === hipsIdx && c.target.path === 'translation');
      if (!ch) continue;
      const v = accessorFloats(g, anim.samplers[ch.sampler].output);
      let lowFrames = 0, frames = v.length / 3;
      for (let i = 0; i < frames; i++) if (v[i * 3 + 1] < restY * 0.4) lowFrames += 1;
      const lowFrac = lowFrames / frames;
      if (!LOW_OK.has(anim.name) && lowFrac > 0.5) {
        bad(`${file}: ${anim.name} hips below 0.4×rest for ${(lowFrac * 100).toFixed(0)}% of clip (buried bake)`);
      }
    }
  }
}
console.log(`checked ${archs.length} archetypes × 2 packs${fail ? '' : ' — ALL GOOD'}`);
process.exit(fail);

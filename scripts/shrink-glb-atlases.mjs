// The six legacy archetypes + monarchs-23 embed a 2048² PNG (6-8 MB each,
// 21 MB on the GPU with mips); the other 14 ship 1024² WebP at ~100 KB.
// Bring the seven in line. Idempotent: a WebP ≤ 1024² is left alone.
// GUARD: the kit recolour (skinTint.recolorPixels) keys on the neutral-grey
// kit texels; lossy chroma noise could speckle that mask. We measure the mask
// on a lossless 1024 downscale and on the WebP result and refuse >3 % drift.
// Run: node scripts/shrink-glb-atlases.mjs   (ATLAS_MAX=1024 ATLAS_Q=90)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { rewriteGlbImages } from './lib/glb.mjs';
import { recolorPixels } from '../src/game/skinTint.js';

const MAX = Number(process.env.ATLAS_MAX ?? 1024);
const Q = Number(process.env.ATLAS_Q ?? 90);
const DRIFT = 0.03;
const KIT = '#d7263d';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/models');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.glb')) out.push(p);
  }
  return out;
}
function maskCount(rgba, width, height) {
  const data = new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const { mask } = recolorPixels(data, { kit: KIT, tone: null, width, height });
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) n += 1;
  return n;
}

let total0 = 0, total1 = 0;
for (const f of walk(root)) {
  const before = fs.statSync(f).size;
  const { buf, changed } = await rewriteGlbImages(fs.readFileSync(f), async (bytes, mime) => {
    const meta = await sharp(bytes).metadata();
    const side = Math.max(meta.width, meta.height);
    if (mime === 'image/webp' && side <= MAX) return null;
    const w = Math.min(MAX, meta.width), h = Math.min(MAX, meta.height);
    const base = sharp(bytes).resize(w, h, { fit: 'fill', kernel: 'lanczos3' });
    const webp = await base.clone().webp({ quality: Q, effort: 6 }).toBuffer();
    const refRaw = await base.clone().ensureAlpha().raw().toBuffer();
    const outRaw = await sharp(webp).ensureAlpha().raw().toBuffer();
    const a = maskCount(refRaw, w, h), b = maskCount(outRaw, w, h);
    const drift = a ? Math.abs(a - b) / a : 0;
    console.log(`  ${path.basename(f)}: ${meta.width}x${meta.height} ${mime} -> ${w}x${h} webp q${Q} (${(bytes.length / 1048576).toFixed(2)} -> ${(webp.length / 1048576).toFixed(2)} MB), kit mask ${a} -> ${b} (${(drift * 100).toFixed(2)} %)`);
    if (drift > DRIFT) throw new Error(`${path.basename(f)}: recolour mask drifted ${(drift * 100).toFixed(1)} % — raise ATLAS_Q`);
    return { bytes: webp, mimeType: 'image/webp' };
  });
  total0 += before;
  if (changed) fs.writeFileSync(f, buf);
  total1 += fs.statSync(f).size;
  console.log(`${changed ? 'SHRUNK' : 'ok    '} ${path.relative(root, f)} ${(before / 1048576).toFixed(1)} -> ${(fs.statSync(f).size / 1048576).toFixed(1)} MB`);
}
console.log(`models: ${(total0 / 1048576).toFixed(1)} -> ${(total1 / 1048576).toFixed(1)} MB`);

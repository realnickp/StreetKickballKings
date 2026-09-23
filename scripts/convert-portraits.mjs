// 50 team-select portraits, 848×1264 PNG with alpha at ~1.3 MB each → WebP.
// Run once: node scripts/convert-portraits.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/players');
let before = 0, after = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.png'))) {
  const src = path.join(dir, f), dst = src.replace(/\.png$/, '.webp');
  const out = await sharp(src).webp({ quality: 84, alphaQuality: 90, effort: 6 }).toBuffer();
  before += fs.statSync(src).size; after += out.length;
  fs.writeFileSync(dst, out);
  fs.unlinkSync(src);
  console.log(`${f} -> ${path.basename(dst)} ${(out.length / 1024).toFixed(0)} KB`);
}
console.log(`portraits: ${(before / 1048576).toFixed(1)} -> ${(after / 1048576).toFixed(1)} MB`);

// Story-mode stills: post-process raw Higgsfield renders into shipping JPEGs, and build a contact sheet.
//   node scripts/story-stills.mjs process <rawDir>   -> every <rawDir>/<id>.(png|jpg|webp) to public/assets/story/<id>.jpg
//   node scripts/story-stills.mjs sheet              -> docs/reports/story-stills-sheet.jpg
// Output: exactly 1080x1920 (cover-crop), baseline (non-progressive) JPEG, quality stepped down until <= 350 KB.
// (No mozjpeg preset: it forces progressive scans, which the iOS rule avoids.)
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'public/assets/story');
const MAX = 350_000; // strict decimal KB so any reading of "350 KB" passes

async function processOne(src, id) {
  const base = sharp(src).resize(1080, 1920, { fit: 'cover', position: 'centre' });
  for (let q = 88; q >= 50; q -= 3) {
    const buf = await base.clone().jpeg({ quality: q, progressive: false, optimiseCoding: true, chromaSubsampling: '4:2:0' }).toBuffer();
    if (buf.length <= MAX) {
      fs.writeFileSync(path.join(OUT, `${id}.jpg`), buf);
      return { id, q, bytes: buf.length };
    }
  }
  throw new Error(`${id}: cannot fit under 350 KB`);
}

async function sheet() {
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.jpg')).sort();
  const W = 216, H = 384, LABEL = 28, COLS = 7, PAD = 8;
  const rows = Math.ceil(files.length / COLS);
  const tiles = [];
  for (let i = 0; i < files.length; i++) {
    const id = files[i].replace(/\.jpg$/, '');
    const x = PAD + (i % COLS) * (W + PAD);
    const y = PAD + Math.floor(i / COLS) * (H + LABEL + PAD);
    tiles.push({ input: await sharp(path.join(OUT, files[i])).resize(W, H).toBuffer(), left: x, top: y });
    const svg = `<svg width="${W}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg"><text x="${W / 2}" y="20" font-family="Arial" font-size="17" font-weight="bold" fill="#fff" text-anchor="middle">${id}</text></svg>`;
    tiles.push({ input: Buffer.from(svg), left: x, top: y + H });
  }
  const width = PAD + COLS * (W + PAD);
  const height = PAD + rows * (H + LABEL + PAD);
  await sharp({ create: { width, height, channels: 3, background: '#15151c' } })
    .composite(tiles).jpeg({ quality: 82 }).toFile(path.join(ROOT, 'docs/reports/story-stills-sheet.jpg'));
  console.log(`sheet: ${files.length} stills, ${width}x${height}`);
}

const [mode, arg] = process.argv.slice(2);
if (mode === 'process') {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(arg).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))) {
    const r = await processOne(path.join(arg, f), f.replace(/\.[^.]+$/, ''));
    console.log(`${r.id}\t${r.bytes}\tq${r.q}`);
  }
} else if (mode === 'sheet') {
  await sheet();
} else {
  console.log('usage: process <rawDir> | sheet');
}

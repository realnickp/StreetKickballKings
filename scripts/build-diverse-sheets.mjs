// Assemble 4x4 pose sheets + 16-frame run sheets for the 6 diverse characters.
// Each source pose is a full-body figure on flat chroma-green (#00b140). We trim
// to the figure's bounding box, scale to a uniform square cell, center it on a
// flat green cell, and place it into the grid that src/game/spriteCharacters.js
// expects. Skin tones are never touched — this only repositions pixels.
//
// Usage: node scripts/build-diverse-sheets.mjs
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIVERSE = path.join(ROOT, 'public/assets/sprites/diverse');

const CELL = 512;             // px per grid cell (4x4 -> 2048)
const SHEET = CELL * 4;       // 2048
const GREEN = { r: 0, g: 177, b: 64 }; // #00b140 fill behind every figure
const PAD = 0.06;             // fraction of cell kept as breathing room

const IDS = ['luca', 'maria', 'kenji', 'jamal', 'aisha', 'sofia'];

// FRAMES layout (col,row) from spriteCharacters.js — index = row*4+col
const FRAME_ORDER = [
  'idleF', 'runF1', 'runF2', 'catch',
  'throw', 'stumble', 'dance', 'dejected',
  'plate', 'windup', 'contact', 'follow',
  'runB1', 'runB2', 'point', 'crouch',
];

/** Is a pixel part of the keyable chroma-green background? (mirror of loader rule) */
function isGreen(r, g, b) {
  return g > 80 && g > r * 1.25 && g > b * 1.25;
}

/** Decode a pose to raw RGBA + tight figure bounding box. */
async function loadPose(file) {
  const img = sharp(file).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 8) continue;
      if (isGreen(r, g, b)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }
  return { data, info, box: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 } };
}

/** Build one CELLxCELL cell: trimmed figure, scaled-to-fit, centered on green. */
async function renderCell(file, { flip = false } = {}) {
  const { box } = await loadPose(file);
  let fig = sharp(file).extract(box);
  if (flip) fig = fig.flop();
  const avail = Math.round(CELL * (1 - PAD * 2));
  // scale figure to fit inside avail x avail, keeping aspect
  const resized = await fig.resize({
    width: avail, height: avail, fit: 'inside', kernel: 'lanczos3',
  }).png().toBuffer();
  const meta = await sharp(resized).metadata();
  const left = Math.round((CELL - meta.width) / 2);
  const top = Math.round((CELL - meta.height) / 2);
  return sharp({ create: { width: CELL, height: CELL, channels: 3, background: GREEN } })
    .composite([{ input: resized, left, top }])
    .png().toBuffer();
}

/** Composite an array of 16 cell buffers (row-major) into a 4x4 sheet. */
async function composeSheet(cells, outPath) {
  const layers = cells.map((input, i) => ({
    input,
    left: (i % 4) * CELL,
    top: Math.floor(i / 4) * CELL,
  }));
  await sharp({ create: { width: SHEET, height: SHEET, channels: 3, background: GREEN } })
    .composite(layers)
    .png()
    .toFile(outPath);
}

/** Compose a 16-frame run sheet: rows 0-1 front (8), rows 2-3 back (8). */
async function composeRunSheet(cells, outPath) {
  return composeSheet(cells, outPath); // same 4x4 geometry, different content
}

async function buildCharacter(id) {
  const dir = path.join(DIVERSE, id);
  const P = (n) => path.join(dir, n);

  // Source poses (all exist; run2/run3/runback generated this session)
  const idle = P('idle.png');
  const run = P('run.png');     // front phase A
  const run2 = P('run2.png');   // front phase B (knee-drive recovery)
  const run3 = P('run3.png');   // front phase C (airborne drive)
  const back = P('runback.png');
  const cat = P('catch.png');
  const thr = P('throw.png');

  // ---- main 4x4 pose sheet (sheet.png) ----
  const map = {
    idleF: [idle], runF1: [run], runF2: [run2], catch: [cat],
    throw: [thr], stumble: [run3], dance: [idle], dejected: [idle],
    plate: [idle], windup: [thr], contact: [run3], follow: [thr],
    runB1: [back], runB2: [back, { flip: true }], point: [idle], crouch: [idle],
  };
  const cells = [];
  for (const name of FRAME_ORDER) {
    const [file, opts] = map[name];
    cells.push(await renderCell(file, opts || {}));
  }
  await composeSheet(cells, P('sheet.png'));

  // ---- 16-frame run sheet (run-sheet.png): 8 front + 8 back ----
  // Front cycle (rows 0-1): alternate the 3 distinct drive phases + mirrors
  // to read as a left/right stride. Back cycle (rows 2-3): the back pose +
  // mirror, alternated, since only one rendered back pose is available.
  const frontSeq = [
    [run], [run2], [run3], [run2, { flip: true }],
    [run, { flip: true }], [run2], [run3, { flip: true }], [run2, { flip: true }],
  ];
  const backSeq = [
    [back], [back, { flip: true }], [back], [back, { flip: true }],
    [back], [back, { flip: true }], [back], [back, { flip: true }],
  ];
  const runCells = [];
  for (const [file, opts] of frontSeq) runCells.push(await renderCell(file, opts || {}));
  for (const [file, opts] of backSeq) runCells.push(await renderCell(file, opts || {}));
  await composeRunSheet(runCells, P('run-sheet.png'));

  console.log(`built ${id}: sheet.png + run-sheet.png`);
}

async function main() {
  for (const id of IDS) {
    // eslint-disable-next-line no-await-in-loop
    await buildCharacter(id);
  }
  console.log('done.');
}

main().catch((e) => { console.error(e); process.exit(1); });

import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseGlb, buildGlb, rewriteGlbImages } from '../scripts/lib/glb.mjs';

// B43 (audit 2026-09-12): six legacy archetypes + monarchs-23 embedded a 2048²
// PNG atlas (6-8 MB each, 21 MB on the GPU with mips — 149 of the 267 MB
// measured live), while the other fourteen ship 1024² WebP through
// EXT_texture_webp. scripts/shrink-glb-atlases.mjs brings the seven in line
// through scripts/lib/glb.mjs; the third case fails the build if one returns.
const here = path.dirname(fileURLToPath(import.meta.url));
const models = path.resolve(here, '../public/assets/models');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.glb')) out.push(p);
  }
  return out;
}

async function syntheticGlb() {
  const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 120, g: 120, b: 120, alpha: 1 } } }).png().toBuffer();
  const blob = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); // an "accessor" that must survive byte-for-byte
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 0 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: blob.length }, { buffer: 0, byteOffset: blob.length, byteLength: png.length }],
    images: [{ bufferView: 1, mimeType: 'image/png' }],
    textures: [{ sampler: 0, source: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987 }],
  };
  json.buffers[0].byteLength = blob.length + png.length;
  return { buf: buildGlb(json, Buffer.concat([blob, png])), blob };
}

it('round-trips a GLB and re-packs every bufferView 4-byte aligned after an image swap', async () => {
  const { buf, blob } = await syntheticGlb();
  const { buf: out, changed } = await rewriteGlbImages(buf, async (bytes, mime) => {
    expect(mime).toBe('image/png');
    const webp = await sharp(bytes).resize(32, 32).webp({ quality: 90 }).toBuffer();
    return { bytes: webp, mimeType: 'image/webp' };
  });
  expect(changed).toBe(1);
  const { json, bin } = parseGlb(out);
  expect(json.images[0].mimeType).toBe('image/webp');
  expect(json.textures[0].source).toBeUndefined();
  expect(json.textures[0].extensions.EXT_texture_webp.source).toBe(0);
  expect(json.extensionsUsed).toContain('EXT_texture_webp');
  expect(json.extensionsRequired).toContain('EXT_texture_webp');
  for (const bv of json.bufferViews) expect(bv.byteOffset % 4).toBe(0);
  const a = json.bufferViews[0];
  expect(Buffer.from(bin.subarray(a.byteOffset, a.byteOffset + a.byteLength))).toEqual(blob);
  const im = json.bufferViews[1];
  const meta = await sharp(Buffer.from(bin.subarray(im.byteOffset, im.byteOffset + im.byteLength))).metadata();
  expect([meta.format, meta.width]).toEqual(['webp', 32]);
  expect(json.buffers[0].byteLength).toBe(bin.length);
});

it('returns the input untouched when the transform keeps every image', async () => {
  const { buf } = await syntheticGlb();
  const r = await rewriteGlbImages(buf, async () => null);
  expect(r.changed).toBe(0);
  expect(r.buf).toBe(buf);
});

it('every shipped character atlas is WebP and at most 1024²', async () => {
  const offenders = [];
  for (const f of walk(models)) {
    const { json, bin } = parseGlb(fs.readFileSync(f));
    for (const im of json.images ?? []) {
      const bv = json.bufferViews[im.bufferView];
      const meta = await sharp(Buffer.from(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength))).metadata();
      if (im.mimeType !== 'image/webp' || Math.max(meta.width, meta.height) > 1024) offenders.push(`${path.basename(f)} ${im.mimeType} ${meta.width}x${meta.height}`);
    }
  }
  expect(offenders).toEqual([]);
});

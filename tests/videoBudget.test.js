import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Two 1248×1664 H.264 loops per field at up to 14.6 Mbps was two hardware
// decoders and ~17 MB of texImage2D per frame on a phone (audit B18). Every
// backdrop now ships at ≤ 720 px wide and ≤ 3.4 Mbps. Pure MP4 box parsing —
// no ffprobe on the test box.
const here = path.dirname(fileURLToPath(import.meta.url));
const videoDir = path.resolve(here, '../public/assets/video');

function boxes(buf, start, end, out = []) {
  let off = start;
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off); const type = buf.toString('latin1', off + 4, off + 8); let head = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(off + 8)); head = 16; }
    if (size === 0) size = end - off;
    out.push({ type, start: off + head, end: off + size });
    off += size;
  }
  return out;
}
export function mp4Info(file) {
  const buf = fs.readFileSync(file);
  const top = boxes(buf, 0, buf.length);
  const moov = top.find((b) => b.type === 'moov');
  const inner = boxes(buf, moov.start, moov.end);
  const mvhd = inner.find((b) => b.type === 'mvhd');
  const v = buf[mvhd.start];
  const timescale = v === 1 ? buf.readUInt32BE(mvhd.start + 20) : buf.readUInt32BE(mvhd.start + 12);
  const duration = v === 1 ? Number(buf.readBigUInt64BE(mvhd.start + 24)) : buf.readUInt32BE(mvhd.start + 16);
  let width = 0, height = 0;
  for (const trak of inner.filter((b) => b.type === 'trak')) {
    const tkhd = boxes(buf, trak.start, trak.end).find((b) => b.type === 'tkhd');
    const tv = buf[tkhd.start];
    const w = buf.readUInt32BE(tkhd.start + (tv === 1 ? 88 : 76)) / 65536, h = buf.readUInt32BE(tkhd.start + (tv === 1 ? 92 : 80)) / 65536;
    if (w && h) { width = w; height = h; }
  }
  const seconds = duration / timescale;
  return { width, height, seconds, mbps: (buf.length * 8) / seconds / 1e6, bytes: buf.length };
}

const files = fs.readdirSync(videoDir).filter((f) => f.endsWith('.mp4'));

it('every backdrop loop is ≤ 720 px wide and ≤ 3.4 Mbps', () => {
  const bad = files.filter((f) => f.startsWith('backdrop-')).map((f) => ({ f, ...mp4Info(path.join(videoDir, f)) }))
    .filter((i) => i.width > 720 || i.mbps > 3.4)
    .map((i) => `${i.f} ${i.width}x${i.height} ${i.mbps.toFixed(1)} Mbps`);
  expect(bad).toEqual([]);
});

it('set-piece clips stay ≤ 720 px wide', () => {
  const bad = files.filter((f) => !f.startsWith('backdrop-')).map((f) => ({ f, ...mp4Info(path.join(videoDir, f)) }))
    .filter((i) => i.width > 720).map((i) => `${i.f} ${i.width}`);
  expect(bad).toEqual([]);
});

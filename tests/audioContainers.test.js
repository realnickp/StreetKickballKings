import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Safari decodes WebAudio through CoreAudio, which needs a sample table in
// `moov`. Fragmented MP4 (a `moof` box per chunk, `mvex` in the header, a
// zero-length `mvhd`) plays fine in Chrome and is rejected on iPhone with a
// bare EncodingError — and audio.js caches that failure as silence for the
// session. Every in-match track shipped that way on 2026-09-12. Same idea for
// the theme: an ID3 APIC picture frame trips Safari's mp3 decoder.
const here = path.dirname(fileURLToPath(import.meta.url));
const audioDir = path.resolve(here, '../public/assets/audio');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const musicFiles = () => walk(path.join(audioDir, 'music')).filter((f) => /\.(m4a|mp4)$/i.test(f));
const hasBox = (buf, box) => buf.toString('latin1').includes(box);

it('every in-match music track is a plain (non-fragmented) MP4 Safari can decode', () => {
  const files = musicFiles();
  expect(files.length).toBeGreaterThan(0);
  const fragmented = files.filter((f) => { const b = fs.readFileSync(f); return hasBox(b, 'moof') || hasBox(b, 'mvex'); });
  expect(fragmented.map((f) => path.relative(audioDir, f))).toEqual([]);
});

it('the theme mp3 carries no embedded picture frame', () => {
  const b = fs.readFileSync(path.join(audioDir, 'theme-red-rubber-felony.mp3'));
  expect(b.subarray(0, 262144).toString('latin1').includes('APIC')).toBe(false);
});

// One ffmpeg pass per backdrop loop: 720 px wide (3:4 → 720×960), H.264 main
// profile, CRF 22 capped at 3 Mbps, faststart, no audio. Idempotent: a file
// already ≤ 720 wide and ≤ 3.3 Mbps is skipped. Requires ffmpeg + ffprobe.
// Run: node scripts/reencode-backdrops.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/video');
const MAXW = 720, MAXRATE = process.env.MAXRATE ?? '3000k', BUFSIZE = '6000k', CRF = process.env.CRF ?? '22';
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration,bit_rate', '-of', 'json', f]).toString());

let before = 0, after = 0;
for (const name of fs.readdirSync(dir).filter((f) => f.startsWith('backdrop-') && f.endsWith('.mp4'))) {
  const f = path.join(dir, name);
  const size0 = fs.statSync(f).size; before += size0;
  const p = probe(f);
  const width = p.streams[0].width, mbps = Number(p.format.bit_rate) / 1e6;
  if (width <= MAXW && mbps <= 3.3) { after += size0; console.log(`ok     ${name} ${width}w ${mbps.toFixed(1)} Mbps`); continue; }
  const tmp = f + '.tmp.mp4';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f, '-an',
    '-vf', `scale=${MAXW}:-2:flags=lanczos`, '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF,
    '-maxrate', MAXRATE, '-bufsize', BUFSIZE, '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '4.0',
    '-movflags', '+faststart', tmp], { stdio: 'inherit' });
  fs.renameSync(tmp, f);
  const size1 = fs.statSync(f).size; after += size1;
  const q = probe(f);
  console.log(`ENCODED ${name} ${width}w ${mbps.toFixed(1)} Mbps -> ${q.streams[0].width}x${q.streams[0].height} ${(Number(q.format.bit_rate) / 1e6).toFixed(2)} Mbps (${(size0 / 1048576).toFixed(1)} -> ${(size1 / 1048576).toFixed(1)} MB)`);
}
console.log(`backdrops: ${(before / 1048576).toFixed(1)} -> ${(after / 1048576).toFixed(1)} MB`);

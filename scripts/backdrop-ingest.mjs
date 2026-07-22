// Ingest a regenerated eye-level backdrop video into the game's asset slots
// (Fun Overhaul pillar F). For each field+side: download the Seedance video,
// write it to public/assets/video, extract frame 0 as the JPEG poster (poster
// and video can never mismatch — the poster IS the video's first frame; JPEG
// per the iOS/WebKit poster rule), and for the front side cut the top sky band
// into the 1024x92 sky strip the ring's cap uses.
//
// Usage: node scripts/backdrop-ingest.mjs <field> <front|back> <videoUrl>
// Requires ffmpeg on PATH; sharp from devDependencies.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const [field, side, url] = process.argv.slice(2);
if (!field || !['front', 'back'].includes(side) || !url) {
  console.error('usage: node scripts/backdrop-ingest.mjs <field> <front|back> <videoUrl>');
  process.exit(1);
}

const suffix = side === 'back' ? '-back' : '';
const videoOut = `public/assets/video/backdrop-${field}${suffix}.mp4`;
const posterOut = side === 'back'
  ? `public/assets/textures/backdrop-${field}-back.jpg`
  : `public/assets/textures/backdrop-${field}-3d.jpg`;
const skyOut = `public/assets/textures/sky-${field}.jpg`;

const tmp = mkdtempSync(join(tmpdir(), 'skk-backdrop-'));
const rawFrame = join(tmp, 'frame0.png');

execFileSync('curl', ['-sL', '-o', videoOut, url], { stdio: 'inherit' });
if (!existsSync(videoOut)) { console.error('video download failed'); process.exit(1); }
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', videoOut, '-frames:v', '1', rawFrame], { stdio: 'inherit' });

const meta = await sharp(rawFrame).metadata();
await sharp(rawFrame).jpeg({ quality: 84 }).toFile(posterOut);
console.log(`poster ${posterOut} ${meta.width}x${meta.height}`);

if (side === 'front') {
  // top 7% of the scene = pure sky in the eye-level art; the cap mirrors it
  await sharp(rawFrame)
    .extract({ left: 0, top: 0, width: meta.width, height: Math.max(8, Math.round(meta.height * 0.07)) })
    .resize(1024, 92, { fit: 'fill' })
    .jpeg({ quality: 84 })
    .toFile(skyOut);
  console.log(`sky ${skyOut} 1024x92`);
}
console.log(`OK ${field} ${side}`);

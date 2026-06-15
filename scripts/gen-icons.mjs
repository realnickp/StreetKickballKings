// Generate PWA / home-screen icons from the square logo. Run: node scripts/gen-icons.mjs
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = path.join(root, 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
const logoPath = path.join(root, 'public', 'assets', 'branding', 'logo-square.png');
const bg = { r: 0x13, g: 0x15, b: 0x1c, alpha: 1 }; // theme slate behind the logo

async function icon(size, frac, file) {
  const ls = Math.round(size * frac);
  const fg = await sharp(logoPath)
    .resize(ls, ls, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: fg, gravity: 'center' }])
    .png().toFile(path.join(outDir, file));
  console.log('  ', file);
}

await icon(192, 0.82, 'icon-192.png');
await icon(512, 0.82, 'icon-512.png');
await icon(512, 0.60, 'icon-maskable-512.png'); // extra padding = maskable safe zone
await icon(180, 0.82, 'apple-touch-icon.png');
console.log('icons generated in public/icons/');

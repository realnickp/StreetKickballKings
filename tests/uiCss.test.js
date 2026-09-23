import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const css = () => fs.readFileSync(path.join(root, 'src/ui/ui.css'), 'utf8');

// Boot weight (audit B23/B40): a render-blocking Google Fonts import and a
// 2000² logo decoded as the very first thing on a cold start.
it('ships its own fonts — no render-blocking Google Fonts import', () => {
  expect(css()).not.toMatch(/fonts\.googleapis\.com/);
  expect(css()).toMatch(/@import\s+['"]\.\/fonts\.css['"]/);
  const faces = fs.readFileSync(path.join(root, 'src/ui/fonts.css'), 'utf8');
  const urls = [...faces.matchAll(/url\('\/fonts\/([\w\-.]+\.woff2)'\)/g)].map((m) => m[1]);
  expect(urls.sort()).toEqual(['archivo-500.woff2', 'archivo-700.woff2', 'archivo-900.woff2', 'permanent-marker-400.woff2']);
  for (const u of urls) expect(fs.statSync(path.join(root, 'public/fonts', u)).size).toBeGreaterThan(5000);
  expect((faces.match(/font-display:\s*swap/g) ?? []).length).toBe(4);
});

it('the TAP IN logo and the coin faces are phone-sized', async () => {
  const dim = async (f) => { const m = await sharp(path.join(root, 'public/assets/branding', f)).metadata(); return Math.max(m.width, m.height); };
  expect(await dim('logo-square.png')).toBeLessThanOrEqual(1024);
  expect(await dim('coin-heads.png')).toBeLessThanOrEqual(512);
  expect(await dim('coin-tails.png')).toBeLessThanOrEqual(512);
});

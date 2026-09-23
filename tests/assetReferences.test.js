import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import teams from '../src/data/teams.json';
import { markFor } from '../src/game/kits.js';

// Two directions. (1) Every asset path the source names must exist — a
// renamed file is a black backdrop or a broken portrait on a phone. (2) Every
// file in the hand-authored asset folders must be named by the source — the
// audit found 162 MB referenced by nothing (sprites, vo wavs, a poster, a
// coin-flip clip, stray textures). Folders driven by manifests or per-line
// pools (anims, announcer, sfx, music) are only checked in direction (1).
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pub = path.join(root, 'public');
export const PORTRAIT_EXT = 'png';

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const sourceText = () => [
  ...walk(path.join(root, 'src')).filter((f) => /\.(js|json|css)$/.test(f)),
  path.join(root, 'index.html'), path.join(pub, 'sw.js'), path.join(pub, 'manifest.webmanifest'),
].map((f) => fs.readFileSync(f, 'utf8')).join('\n');

function literalRefs() {
  const refs = new Set();
  for (const m of sourceText().matchAll(/assets\/[\w\-./]+?\.(?:png|webp|jpg|jpeg|mp4|m4a|mp3|wav|glb|json)/g)) refs.add(m[0]);
  return refs;
}
function derivedRefs() {
  const refs = new Set();
  for (const t of teams.teams) {
    for (const who of ['', '-man', '-woman']) for (const kit of ['', '-alt']) {
      if (who === '' && kit === '-alt') continue;
      refs.add(`assets/players/${t.id}${who}${kit}.${PORTRAIT_EXT}`);
    }
    for (const k of Object.values(t.kits ?? {})) if (k?.logo) refs.add(`assets/logos/${markFor(k.logo)}.png`);
  }
  // the coin toss picks its face at runtime: `assets/branding/coin-${result}.png`
  refs.add('assets/branding/coin-heads.png');
  refs.add('assets/branding/coin-tails.png');
  return refs;
}

it('every asset the source names is on disk', () => {
  const missing = [...literalRefs()].filter((r) => !fs.existsSync(path.join(pub, r)));
  expect(missing).toEqual([]);
});

it('no orphan files in the hand-authored asset folders', () => {
  const named = new Set([...literalRefs(), ...derivedRefs()]);
  const dirs = ['video', 'textures', 'players', 'logos', 'branding', 'models', 'audio/vo', 'ui'];
  const files = dirs.flatMap((d) => walk(path.join(pub, 'assets', d)));
  const loose = fs.readdirSync(path.join(pub, 'assets/audio')).filter((f) => /\.(m4a|mp3|wav|mp4)$/.test(f)).map((f) => path.join(pub, 'assets/audio', f));
  const orphans = [...files, ...loose]
    .map((f) => path.relative(pub, f).split(path.sep).join('/'))
    .filter((rel) => !named.has(rel) && !/\.md$/.test(rel));
  expect(orphans).toEqual([]);
});

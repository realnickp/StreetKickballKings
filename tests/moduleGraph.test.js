import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every module under src/ must be reachable from main.js (static or dynamic
// import). The 2026-09-12 audit found ~1,300 lines that nothing imported
// (spriteCharacters, world/blacktop, assets.manifest) shipping in the repo,
// plus an unused physics dependency. This keeps the graph honest.
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../src');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(js|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

function imports(file) {
  const text = fs.readFileSync(file, 'utf8');
  const specs = [];
  for (const m of text.matchAll(/import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)) specs.push(m[1]);
  for (const m of text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]);
  return specs.filter((s) => s.startsWith('.')).map((s) => path.resolve(path.dirname(file), s));
}

function reachable(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !fs.existsSync(f)) continue;
    seen.add(f);
    if (f.endsWith('.js')) stack.push(...imports(f));
  }
  return seen;
}

it('every module and data file under src/ is reachable from main.js', () => {
  const seen = reachable(path.join(src, 'main.js'));
  const orphans = walk(src).filter((f) => !seen.has(f)).map((f) => path.relative(src, f).split(path.sep).join('/'));
  expect(orphans).toEqual([]);
});

it('the unused physics dependency is gone', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(here, '../package.json'), 'utf8'));
  expect(Object.keys(pkg.dependencies ?? {})).not.toContain('@dimforge/rapier3d-compat');
});

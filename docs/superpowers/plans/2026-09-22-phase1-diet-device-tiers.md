# Phase 1 — Asset Diet + Device Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game light enough to live inside an iPhone's memory budget and steady on a $150 Android — delete dead weight, shrink every heavy asset, size the render pipeline to the device at boot, stop drawing behind menus, and let the character build breathe — without changing how the game looks on a good phone.

**Architecture:** A pure `deviceTier` module decides once at boot (DPR, MSAA, bloom/grade, shadow map, backdrop video mode, shadow-caster budget); `renderer.js` and `field.js` read it, `matchScene` feeds it to the field and to a per-frame shadow-caster budget. A pure `RenderGate` skips `composer.render()` while an opaque DOM screen covers the canvas (a MutationObserver on the UI root drives it). Assets are shrunk offline by idempotent node scripts (sharp for images and GLB atlases, ffmpeg for video) and guarded by vitest tests that fail the build if a heavy asset ever returns. A Playwright harness (`scripts/phase1-e2e.mjs`) proves each behaviour in WebKit AND Chromium.

**Tech Stack:** three r184 (WebGL2), Vite 8, vitest 4, Playwright 1.49 (webkit + chromium, already installed), sharp 0.35 (devDependency), ffmpeg 2023 (on PATH at `/c/Program Files (x86)/Common Files/AutoPod/ffmpeg/bin`).

**Spec:** `docs/reports/SKK-Launch-Readiness-Audit-2026-09-12.pdf` §02 (root causes B), §03 (ledger B02, B15–B18, B23, B24, B32–B34, B38, B40, B43), §04 (dead weight, tiered targets), §08 Phase 1; plus `SESSION_LOG.md` §29 "Next session". Working copy: git worktree `C:/Users/nickp/OneDrive/Desktop/skk-phase0`, branch `fix/phase1-diet-device-tiers` off `main` (8b2740b). The main checkout (`streetkickballkings`) is parked on the unfinished `feat/switch-cinematic-crown-pitch` branch and is NOT touched.

## Global Constraints

- "Do NOT break the game on Android" (dev, session 29): every behaviour is verified in Playwright WebKit (iPhone 13 profile) AND Chromium (`BROWSER=chromium`).
- Harnesses run in the FOREGROUND, one browser at a time: `node scripts/with-dev.mjs scripts/<harness>.mjs` (this box's background-task guard kills long background jobs). Never Chrome MCP tabs for game checks; headless + `?mute` only.
- The look holds on a good phone: brightness lift (`toneMappingExposure 1.35`, `LIGHT_LIFT`), the grade pass on mid/high tiers, the cohesive animated backdrop (front video on mid, both halves on high). Only the LOW tier trades look for survival.
- Audio containers stay plain MP4 / tag-free MP3 (`tests/audioContainers.test.js` must keep passing). `build.target` stays `['es2020','safari15','chrome87','firefox78']`. `public/sw.js` `NEVER_CACHE` stays as is.
- iOS/WebKit rules (memory `skk-ios-webkit-rules`): assign textures after load, never trust a video element's own signals, no new AudioContext paths.
- `public/assets/sprites/` is gitignored, not deployed, 132 MB on disk: NOT deleted by this plan (irreversible local art). Tell the dev it can go.
- `hairShoeFence`, `recolorCache` (16), and `prewarm`'s staging contract are load-bearing; changes to `glbCharacters.js` keep their comments and semantics.
- One commit per task, in the repo's voice (`fix(...)`, `perf(...)`, `chore(...)`, body explains WHY). Attribution lines from the session reminder on every commit.
- Baseline before any change: `npx vitest run` → 67 files / 663 tests green (measured 2026-09-22).

## Review Focus

1. **Low tier must still show a backdrop.** With `video: 'none'` the front ring material must still receive the poster JPEG (`bmat.map` set after load, colour reset to white). Test pinned in Task 12 (scenario TIER-LOW asserts `front.material.map` is a texture).
2. **Portrait fallback chain after the WebP move.** `setImg` falls back `<id>-man-alt` → `<id>-man` → `<id>`; every rung must be `.webp` or a rung 404s into a broken image. Pinned by `tests/assetReferences.test.js` (Task 10) and the TEAM-SELECT scenario in Task 12 (`naturalWidth > 0`).
3. **Render gate vs. the transparent coin toss and the pause overlay.** The coin-toss screen is `.screen.transparent` and the pause overlay is not a `.screen`; both must keep rendering. Pinned by `tests/renderGate.test.js` (`isCovered` cases) in Task 6 and the RENDER-GATE scenario in Task 12.
4. **Prewarm with frustum culling on.** The warm's one offscreen draw creates bone textures and shadow variants only for meshes the camera "sees"; culled rigs would meet the GPU on the walk-out again (the exact regression the dev hated). Pinned in Task 7: `tests/prewarm.test.js` asserts staged skinned meshes are drawn with `frustumCulled === false` and restored.
5. **Tier detection without `deviceMemory`.** iOS Safari, Firefox and some WebViews never expose it; the answer must be the safe middle, and iOS must never land on `high`. Pinned in `tests/deviceTier.test.js` (Task 5).

---

## Setup (before Task 1)

```bash
cd "C:/Users/nickp/OneDrive/Desktop/skk-phase0"
git checkout -b fix/phase1-diet-device-tiers     # from main 8b2740b
npx vitest run                                    # expect 67 files, 663 tests passing
du -sb public/assets | awk '{print $1/1048576 " MB"}'   # expect ≈ 491 MB (git-tracked ≈ 514 MB incl. dist-excluded)
```

Record the asset total; Task 12 reports the after figure.

---

### Task 1: Dead code and the dead dependency

**Files:**
- Delete: `src/game/spriteCharacters.js`, `src/game/world/blacktop.js`, `src/data/assets.manifest.json`
- Modify: `src/engine/renderer.js:11,133-146,152-155,268` (GTAO), `src/game/field.js:184-199,451-455,568-571` (world3d), `src/main.js:11,94-120` (lazy `?dance`), `package.json` (rapier)
- Test: `tests/moduleGraph.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `src/main.js` no longer statically imports `./game/characters.js`; `buildField` has no `world3d` branch (sun always at `(28, 40, 18)`, sky map from `fieldData.textures.sky` or the gradient).

- [ ] **Step 1: Write the failing test**

```js
// tests/moduleGraph.test.js
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
  const orphans = walk(src).filter((f) => !seen.has(f)).map((f) => path.relative(src, f));
  expect(orphans).toEqual([]);
});

it('the unused physics dependency is gone', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(here, '../package.json'), 'utf8'));
  expect(Object.keys(pkg.dependencies ?? {})).not.toContain('@dimforge/rapier3d-compat');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/moduleGraph.test.js`
Expected: FAIL — orphans list contains `data/assets.manifest.json`, `game/spriteCharacters.js`; rapier assertion fails. (`game/world/blacktop.js` is reachable through field.js's dynamic import until Step 3.)

- [ ] **Step 3: Delete the dead modules and their hooks**

```bash
git rm src/game/spriteCharacters.js src/game/world/blacktop.js src/data/assets.manifest.json
```

`src/game/field.js` — remove lines 184-199 (the `world3d` block: `const world3d = ...` through the `.catch(...)`), then:
- line 451-455: replace
  ```js
  // world3d fields use the per-sky GRADIENT (golden-hour dusk), not the baked
  // daytime sky photo that matched the old backdrop
  const skyMap = (fieldData.textures?.sky && !world3d)
  ```
  with
  ```js
  const skyMap = fieldData.textures?.sky
  ```
- lines 568-571: replace
  ```js
  // golden-hour 3D world: LOW warm sun from the third-base side -> long dusk
  // shadows across the asphalt (the mood the whole world bake is lit for)
  if (world3d) sun.position.set(-34, 17, 24);
  else sun.position.set(28, 40, 18);
  ```
  with
  ```js
  sun.position.set(28, 40, 18);
  ```
- the comment at lines 184-186 ("TRUE 3D WORLD (hero field)...") goes with the block.

`src/engine/renderer.js`:
- delete line 11 `import { GTAOPass } ...`
- delete lines 133-146 (the `aoPass` block, comment included)
- in `rebuildChain()` delete the three comment lines 152-154 and the commented `// if (quality === 'high' && aoPass) ...` line
- in `resize()` delete `if (aoPass) aoPass.setSize(w, h);`

`src/main.js`:
- delete line 11 `import { buildPlayer, CLIP_NAMES } from './game/characters.js';`
- wrap the `?dance` harness body (lines 96-119) so it reads:
  ```js
  if (params.has('dance')) {
    // legacy procedural rig harness — lazy, so the 674-line module stays out of the game bundle
    import('./game/characters.js').then(({ buildPlayer, CLIP_NAMES }) => {
      const monarchs = teamsData.teams.find(t => t.id === 'monarchs');
      const snappers = teamsData.teams.find(t => t.id === 'snappers');
      const field = buildField(blacktop, engine.scene);
      let elapsed = 0;
      engine.onFrame((dt) => { elapsed += dt; field.updateCrowd(elapsed); });
      const p1 = buildPlayer(monarchs.roster[0].look, monarchs.colors);
      p1.group.position.set(-0.75, 0, -3.4);
      engine.scene.add(p1.group);
      const p2 = buildPlayer(snappers.roster[1].look, snappers.colors);
      p2.group.position.set(0.75, 0, -3.4);
      engine.scene.add(p2.group);
      let clipIdx = 0;
      const nextClip = () => {
        const name = CLIP_NAMES[clipIdx % CLIP_NAMES.length];
        p1.animator.play(name, { variant: 'tank' });
        p2.animator.play(name);
        clipIdx++;
      };
      nextClip();
      setInterval(nextClip, 2500);
      engine.onFrame((dt) => { p1.animator.update(dt); p2.animator.update(dt); });
      engine.camera.position.set(0, 1.6, 0.2);
      engine.camera.lookAt(0, 1.0, -3.4);
      engine.cameraLock = true;
    }).catch((e) => console.error('dance harness failed', e));
  } else
  ```

`package.json`: run `npm uninstall @dimforge/rapier3d-compat` (updates package.json + lock).

- [ ] **Step 4: Check nothing else named them**

Run: `grep -rn "world3d\|blacktop.js\|spriteCharacters\|assets.manifest\|GTAO\|rapier" src tests scripts --include=*.js --include=*.mjs --include=*.json`
Expected: only `src/data/fields.json:35 "world3d": false` (harmless data, `tests/worldConfig.test.js` asserts it) and `scripts/build-diverse-sheets.mjs` comments (an offline sprite tool; leave it).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run`
Expected: 68 files, 665 tests passing (the two new ones included).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(diet): drop the dead modules, the GTAO pass and the rapier dependency

spriteCharacters.js, world/blacktop.js and assets.manifest.json had zero
importers (audit 2026-09-12 §04); GTAOPass was constructed every boot and
never added to the chain; rapier shipped in package.json with no import.
characters.js (674 lines) now loads lazily for the ?dance harness only.
tests/moduleGraph.test.js keeps the import graph honest from here on.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
```

---

### Task 2: Orphan assets + the reference guard

**Files:**
- Delete: `public/assets/audio/vo/` (28 wav, 12.2 MB), `public/assets/audio/match-beat.m4a`, `public/assets/branding/logo-poster.png`, `public/assets/video/coin-flip.mp4`, `public/assets/logos/bullies-alt.png`, `public/assets/textures/asphalt.png`, `public/assets/textures/graffiti-sheet.png`, `public/assets/textures/skyline.png`, `public/assets/textures/sky-blacktop.png`
- Test: `tests/assetReferences.test.js`

**Interfaces:**
- Produces: the test's `PORTRAIT_EXT` constant (`'png'` now, flipped to `'webp'` in Task 10).

- [ ] **Step 1: Write the failing test**

```js
// tests/assetReferences.test.js
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/assetReferences.test.js`
Expected: FAIL on the orphan test listing exactly: `assets/audio/vo/*.wav` ×28, `assets/audio/match-beat.m4a`, `assets/branding/logo-poster.png`, `assets/video/coin-flip.mp4`, `assets/logos/bullies-alt.png`, `assets/textures/asphalt.png`, `assets/textures/graffiti-sheet.png`, `assets/textures/skyline.png`, `assets/textures/sky-blacktop.png`. If ANY other file appears (e.g. an `arch-*.glb` or a `sky-*.jpg`), STOP: it is referenced by a pattern the test does not model — add the pattern to `derivedRefs()` rather than deleting the file. (`arch-band.glb` is a literal string in `ARCHETYPES` so it is "named" and stays.)

- [ ] **Step 3: Delete exactly the listed orphans**

```bash
git rm -r public/assets/audio/vo
git rm public/assets/audio/match-beat.m4a public/assets/branding/logo-poster.png public/assets/video/coin-flip.mp4 \
       public/assets/logos/bullies-alt.png public/assets/textures/asphalt.png public/assets/textures/graffiti-sheet.png \
       public/assets/textures/skyline.png public/assets/textures/sky-blacktop.png
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run`
Expected: all green, 667 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(diet): delete 26 MB of assets nothing references; guard the asset folders

28 superseded VO wavs, the old match beat, the poster logo, the coin-flip
clip, an alt crest and four stray textures — every one confirmed unreferenced
by grep and now by tests/assetReferences.test.js, which also fails when a
named asset goes missing.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
```

---

### Task 3: The seven 2048² PNG atlases become 1024² WebP (B43, 149 → 37 MB GPU)

**Files:**
- Create: `scripts/lib/glb.mjs`, `scripts/shrink-glb-atlases.mjs`
- Modify (binary): `public/assets/models/archetypes/arch-{afro,bald,braids,durag,locs,twists}.glb`, `public/assets/models/monarchs-23.glb`
- Test: `tests/glbAtlas.test.js`

**Interfaces:**
- Produces: `parseGlb(buf) → { json, bin }`, `buildGlb(json, bin) → Buffer`, `rewriteGlbImages(buf, transform) → Promise<{ buf, changed }>` where `transform(bytes: Buffer, mimeType: string, imageIndex: number) → Promise<{ bytes, mimeType } | null>`.

Context: the 14 newer archetypes already ship `image/webp` 1024² through `EXT_texture_webp` (`extensionsRequired`), so three's `GLTFLoader` path is proven on the dev's phone. The recolour (`recolorPixels`) walks RGBA and must see the same neutral-grey kit after lossy WebP — the script measures the recolour MASK before and after and refuses a >3 % drift.

- [ ] **Step 1: Write the failing test**

```js
// tests/glbAtlas.test.js
import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseGlb, buildGlb, rewriteGlbImages } from '../scripts/lib/glb.mjs';

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

it('every shipped character atlas is WebP and at most 1024² (B43: seven 2048² PNGs cost 149 MB on the GPU)', async () => {
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/glbAtlas.test.js`
Expected: FAIL — `scripts/lib/glb.mjs` does not exist.

- [ ] **Step 3: Write the GLB library**

```js
// scripts/lib/glb.mjs
// Minimal GLB 2.0 container read/write for asset scripts. No dependencies.
const MAGIC = 0x46546c67, CHUNK_JSON = 0x4e4f534a, CHUNK_BIN = 0x004e4942;
const pad4 = (n) => (n + 3) & ~3;

export function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== MAGIC) throw new Error('not a GLB');
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === CHUNK_JSON) json = JSON.parse(body.toString('utf8'));
    else if (type === CHUNK_BIN) bin = body;
    off += 8 + len;
  }
  if (!json) throw new Error('GLB without a JSON chunk');
  return { json, bin: bin ?? Buffer.alloc(0) };
}

export function buildGlb(json, bin) {
  const js = Buffer.from(JSON.stringify(json), 'utf8');
  const jsPadded = Buffer.concat([js, Buffer.alloc(pad4(js.length) - js.length, 0x20)]); // JSON pads with spaces
  const binPadded = Buffer.concat([bin, Buffer.alloc(pad4(bin.length) - bin.length, 0)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(MAGIC, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsPadded.length + 8 + binPadded.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsPadded.length, 0); jh.writeUInt32LE(CHUNK_JSON, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binPadded.length, 0); bh.writeUInt32LE(CHUNK_BIN, 4);
  return Buffer.concat([head, jh, jsPadded, bh, binPadded]);
}

/**
 * Replace embedded images. `transform(bytes, mimeType, imageIndex)` returns
 * `{ bytes, mimeType }` or null to keep the image. Every bufferView is
 * re-packed 4-byte aligned; textures pointing at a WebP image are routed
 * through EXT_texture_webp (the extension three's GLTFLoader already handles
 * for the 14 newer archetypes). Returns the SAME buffer when nothing changed.
 */
export async function rewriteGlbImages(buf, transform) {
  const { json, bin } = parseGlb(buf);
  const views = (json.bufferViews ?? []).map((bv) => ({ ...bv, bytes: bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength) }));
  let changed = 0;
  for (const [i, im] of (json.images ?? []).entries()) {
    if (im.bufferView == null) continue;
    const out = await transform(views[im.bufferView].bytes, im.mimeType, i);
    if (!out) continue;
    views[im.bufferView].bytes = Buffer.from(out.bytes);
    im.mimeType = out.mimeType;
    changed += 1;
  }
  if (!changed) return { buf, changed };
  const parts = [];
  let off = 0;
  for (const v of views) {
    v.byteOffset = off; v.byteLength = v.bytes.length;
    parts.push(v.bytes); off += v.bytes.length;
    const pad = pad4(off) - off;
    if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
  }
  json.bufferViews = views.map(({ bytes, ...rest }) => rest);
  json.buffers = [{ byteLength: off }];
  const webp = new Set((json.images ?? []).map((im, i) => (im.mimeType === 'image/webp' ? i : -1)).filter((i) => i >= 0));
  for (const t of json.textures ?? []) {
    const src = t.source ?? t.extensions?.EXT_texture_webp?.source;
    if (src == null || !webp.has(src)) continue;
    delete t.source;
    t.extensions = { ...(t.extensions ?? {}), EXT_texture_webp: { source: src } };
  }
  if (webp.size) {
    json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'EXT_texture_webp'])];
    json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), 'EXT_texture_webp'])];
  }
  return { buf: buildGlb(json, Buffer.concat(parts)), changed };
}
```

- [ ] **Step 4: Run the two library tests (the assets test still fails)**

Run: `npx vitest run tests/glbAtlas.test.js`
Expected: 2 pass, 1 fail (seven offenders listed: `arch-afro.glb image/png 2048x2048` … `monarchs-23.glb image/png 2048x2048`).

- [ ] **Step 5: Write the shrink script (with the recolour-drift guard)**

```js
// scripts/shrink-glb-atlases.mjs
// The six legacy archetypes + monarchs-23 embed a 2048² PNG (6-8 MB each,
// 21 MB on the GPU with mips); the other 14 ship 1024² WebP at ~100 KB.
// Bring the seven in line. Idempotent: a WebP ≤ 1024² is left alone.
// GUARD: the kit recolour (skinTint.recolorPixels) keys on the neutral-grey
// kit texels; lossy chroma noise could speckle that mask. We measure the mask
// on a lossless 1024 downscale and on the WebP result and refuse >3 % drift.
// Run: node scripts/shrink-glb-atlases.mjs   (ATLAS_MAX=1024 ATLAS_Q=90)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { rewriteGlbImages } from './lib/glb.mjs';
import { recolorPixels } from '../src/game/skinTint.js';

const MAX = Number(process.env.ATLAS_MAX ?? 1024);
const Q = Number(process.env.ATLAS_Q ?? 90);
const DRIFT = 0.03;
const KIT = '#d7263d';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/models');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.glb')) out.push(p);
  }
  return out;
}
async function maskCount(rgba, width, height) {
  const data = new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const { mask } = recolorPixels(data, { kit: KIT, tone: null, width, height });
  let n = 0; for (let i = 0; i < mask.length; i++) if (mask[i]) n += 1;
  return n;
}

let total0 = 0, total1 = 0;
for (const f of walk(root)) {
  const before = fs.statSync(f).size;
  const { buf, changed } = await rewriteGlbImages(fs.readFileSync(f), async (bytes, mime) => {
    const meta = await sharp(bytes).metadata();
    const side = Math.max(meta.width, meta.height);
    if (mime === 'image/webp' && side <= MAX) return null;
    const w = Math.min(MAX, meta.width), h = Math.min(MAX, meta.height);
    const base = sharp(bytes).resize(w, h, { fit: 'fill', kernel: 'lanczos3' });
    const webp = await base.clone().webp({ quality: Q, effort: 6 }).toBuffer();
    const refRaw = await base.clone().ensureAlpha().raw().toBuffer();
    const outRaw = await sharp(webp).ensureAlpha().raw().toBuffer();
    const a = await maskCount(refRaw, w, h), b = await maskCount(outRaw, w, h);
    const drift = a ? Math.abs(a - b) / a : 0;
    console.log(`  ${path.basename(f)}: ${meta.width}x${meta.height} ${mime} -> ${w}x${h} webp q${Q} (${(bytes.length / 1048576).toFixed(2)} -> ${(webp.length / 1048576).toFixed(2)} MB), kit mask ${a} -> ${b} (${(drift * 100).toFixed(2)} %)`);
    if (drift > DRIFT) throw new Error(`${path.basename(f)}: recolour mask drifted ${(drift * 100).toFixed(1)} % — raise ATLAS_Q`);
    return { bytes: webp, mimeType: 'image/webp' };
  });
  total0 += before;
  if (changed) fs.writeFileSync(f, buf);
  total1 += fs.statSync(f).size;
  console.log(`${changed ? 'SHRUNK' : 'ok    '} ${path.relative(root, f)} ${(before / 1048576).toFixed(1)} -> ${(fs.statSync(f).size / 1048576).toFixed(1)} MB`);
}
console.log(`models: ${(total0 / 1048576).toFixed(1)} -> ${(total1 / 1048576).toFixed(1)} MB`);
```

Note: `recolorPixels` signature is `recolorPixels(data, { kit, tone, width, height })` returning `{ mask }` (see `glbCharacters.js:57`). If it throws on a `Uint8ClampedArray` view, pass `new Uint8ClampedArray(rgba)` (a copy).

- [ ] **Step 6: Run the script**

Run: `node scripts/shrink-glb-atlases.mjs`
Expected: seven `SHRUNK` lines, each kit-mask drift under 3 %, `models: 72.9 -> ≈ 28 MB`. If a drift line exceeds 3 %, re-run with `ATLAS_Q=95`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run`
Expected: all green (670 tests). `tests/glbAtlas.test.js` third case now passes.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "perf(diet): the seven 2048² PNG atlases become 1024² WebP like the other fourteen

arch-afro/bald/braids/durag/locs/twists + monarchs-23 each carried a 6-8 MB
PNG that cost 21 MB on the GPU with mips (149 of the 267 MB measured live,
audit §02 B). scripts/shrink-glb-atlases.mjs re-packs the GLB through
EXT_texture_webp — the path the fourteen newer rigs already use on the dev's
phone — and refuses any file whose kit-recolour mask drifts >3 %.
tests/glbAtlas.test.js fails the build if a big PNG atlas ever returns.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
```

---

### Task 4: Backdrop videos — 720×960, ≤ 3 Mbps, and a per-tier video mode (B18)

**Files:**
- Create: `scripts/reencode-backdrops.mjs`
- Modify (binary): `public/assets/video/backdrop-*.mp4` (20 files)
- Modify: `src/game/field.js:67,251-314,315,373`
- Test: `tests/videoBudget.test.js`

**Interfaces:**
- Produces: `buildField(fieldData, scene, opts = {})` with `opts.video: 'none' | 'front' | 'both'` (default `'both'` = today's behaviour) and `opts.shadowMap: number` (default 2048; wired in Task 5).

- [ ] **Step 1: Write the failing test**

```js
// tests/videoBudget.test.js
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/videoBudget.test.js`
Expected: first case FAILS listing all 20 backdrops (1248 wide, 3.5–14.5 Mbps); second passes.

- [ ] **Step 3: Write the re-encode script**

```js
// scripts/reencode-backdrops.mjs
// One ffmpeg pass per backdrop loop: 720 px wide (3:4 → 720×960), H.264 main
// profile, CRF 22 capped at 3 Mbps, faststart, no audio. Idempotent: a file
// already ≤ 720 wide and ≤ 3.3 Mbps is skipped. Requires ffmpeg + ffprobe.
// Run: node scripts/reencode-backdrops.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/video');
const MAXW = 720, MAXRATE = '3000k', BUFSIZE = '6000k', CRF = '22';
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
```

- [ ] **Step 4: Run it**

Run: `node scripts/reencode-backdrops.mjs` (several minutes; `-preset slow` on 20 clips)
Expected: 20 `ENCODED` lines, every result ≤ 3.0 Mbps, `backdrops: 199.x -> ≈ 45 MB`.

- [ ] **Step 5: Run the video test**

Run: `npx vitest run tests/videoBudget.test.js`
Expected: PASS ×2. If a clip lands at 3.4+ Mbps (a very busy scene at the cap can average slightly over), re-run that file with `MAXRATE` 2800k by editing the constant, then restore it.

- [ ] **Step 6: Give `buildField` a video mode**

`src/game/field.js`:
- line 67: `export function buildField(fieldData, scene, opts = {}) {` and right after `const handles = ...` add
  ```js
  // DEVICE TIER (Phase 1): 'both' = the two animated halves (desktop / 8 GB
  // Android), 'front' = the outfield loop only, the home half stays its
  // poster (iOS default — one hardware decoder), 'none' = posters only (low
  // tier). Callers without a tier get today's behaviour.
  const videoMode = opts.video ?? 'both';
  const shadowMapSize = opts.shadowMap ?? 2048;
  ```
- line 315: `const frontBuild = buildBackdropMat(fieldData.textures?.backdrop, videoMode === 'none' ? null : fieldData.textures?.backdropVideo, tuneTex);`
- line 373: `const backBuild = buildBackdropMat(bk.tex ?? fieldData.textures?.backdrop, videoMode === 'both' ? (bk.video ?? null) : null, tuneBack, seamRamp);`
- line 575: `sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);`
- also expose it: after `handles.sun = sun;` add `handles.videoMode = videoMode;`

`buildBackdropMat` already returns `{ mat, video: null }` when `videoUrl` is null and the poster path fills `bmat.map` — no other change.

- [ ] **Step 7: Run the whole suite**

Run: `npx vitest run`
Expected: all green (672 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "perf(diet): backdrop loops at 720 px / ≤3 Mbps, and the field takes a video mode

Two 1248×1664 H.264 decoders per field at up to 14.6 Mbps (block party) was
the single biggest per-frame cost on a phone (audit B18). Every loop is
re-encoded with scripts/reencode-backdrops.mjs (199 -> ~45 MB) and
buildField now takes { video: 'none'|'front'|'both', shadowMap } so the
device tier (next commit) can choose posters, one loop or both.
tests/videoBudget.test.js parses the MP4 headers and fails on a fat clip.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
```

---

### Task 5: The device tier (B16, B17, B34, B38)

**Files:**
- Create: `src/engine/deviceTier.js`
- Modify: `src/engine/renderer.js` (renderer ctor, pixel ratio, shadow type, samples, chain, watchdog steps, Timer, expose `engine.tier`), `src/game/matchScene.js:137`, `src/main.js:64,98` (harness `buildField` calls), `scripts/round-e2e.mjs:874-898` (scenario 9 reads the tier)
- Test: `tests/deviceTier.test.js`

**Interfaces:**
- Produces: `TIERS` table; `detectTier(env) → { name, dpr, msaa, bloom, grade, shadowMap, video, casters, reason }`; `tierFromBrowser(win) → same` (reads `navigator`, `screen`, `?tier=`); `engine.tier` on the engine object; `createEngine(canvas, { tier } = {})`.

- [ ] **Step 1: Write the failing test**

```js
// tests/deviceTier.test.js
import { it, expect } from 'vitest';
import { TIERS, detectTier } from '../src/engine/deviceTier.js';

const SE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IOS15 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

it('the table itself: low sheds everything, mid keeps the look, high is today', () => {
  expect(TIERS.low).toMatchObject({ dpr: 1.5, msaa: 0, bloom: false, grade: false, shadowMap: 1024, video: 'none', casters: 6 });
  expect(TIERS.mid).toMatchObject({ dpr: 2, msaa: 2, bloom: true, grade: true, shadowMap: 1024, video: 'front', casters: 8 });
  expect(TIERS.high).toMatchObject({ dpr: 2, msaa: 4, bloom: true, grade: true, shadowMap: 2048, video: 'both', casters: 16 });
});

it('an iPhone SE / mini (≤ 380 CSS px wide) is low; a 390+ iPhone is mid; no iPhone is ever high', () => {
  expect(detectTier({ ua: SE, screenW: 375, screenH: 667 }).name).toBe('low');
  expect(detectTier({ ua: SE, screenW: 390, screenH: 844 }).name).toBe('mid');
  expect(detectTier({ ua: SE, screenW: 430, screenH: 932, deviceMemory: 8 }).name).toBe('mid');
});

it('iOS 15 is low whatever the screen', () => {
  expect(detectTier({ ua: IOS15, screenW: 414, screenH: 896 }).name).toBe('low');
});

it('an iPad (Macintosh UA + touch) is iOS: mid', () => {
  expect(detectTier({ ua: IPAD, platform: 'MacIntel', maxTouchPoints: 5, screenW: 820, screenH: 1180 }).name).toBe('mid');
  expect(detectTier({ ua: IPAD, platform: 'MacIntel', maxTouchPoints: 0, screenW: 1440, screenH: 900 }).name).toBe('high'); // a real Mac
});

it('Android tiers by memory (Chrome rounds 6 GB down to 4) and by cores', () => {
  expect(detectTier({ ua: ANDROID, deviceMemory: 2, hardwareConcurrency: 8 }).name).toBe('low');
  expect(detectTier({ ua: ANDROID, deviceMemory: 4, hardwareConcurrency: 8 }).name).toBe('mid');
  expect(detectTier({ ua: ANDROID, deviceMemory: 8, hardwareConcurrency: 8 }).name).toBe('high');
  expect(detectTier({ ua: ANDROID, deviceMemory: 4, hardwareConcurrency: 4 }).name).toBe('low');
});

it('no memory or core signal at all (Firefox, WebViews) lands on the safe middle', () => {
  expect(detectTier({ ua: ANDROID }).name).toBe('mid');
  expect(detectTier({ ua: '' }).name).toBe('high'); // an unknown desktop-ish UA: nothing says phone
});

it('desktop is high; the ?tier override wins over everything', () => {
  expect(detectTier({ ua: DESKTOP, deviceMemory: 8 }).name).toBe('high');
  expect(detectTier({ ua: SE, screenW: 375, screenH: 667, override: 'high' })).toMatchObject({ name: 'high', reason: 'override' });
  expect(detectTier({ ua: DESKTOP, override: 'nonsense' }).name).toBe('high');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/deviceTier.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```js
// src/engine/deviceTier.js
// ONE decision at boot about how much phone there is. The audit (2026-09-12)
// measured the render pipeline at ~100 MB of render targets, a 2048² soft
// shadow map, two H.264 decoders and sixteen shadow casters on EVERY device,
// and iOS jetsams web content somewhere between 600 MB and ~1 GB on a 4 GB
// phone. The PerfWatchdog only ever stepped MSAA down after 8 s and touched
// nothing else. This table is read by the renderer (dpr, msaa, bloom, grade),
// the field (shadow map, backdrop video mode) and the match scene (how many
// rigs cast shadows). ?tier=low|mid|high overrides it for testing.
export const TIERS = {
  low:  { name: 'low',  dpr: 1.5, msaa: 0, bloom: false, grade: false, shadowMap: 1024, video: 'none',  casters: 6 },
  mid:  { name: 'mid',  dpr: 2,   msaa: 2, bloom: true,  grade: true,  shadowMap: 1024, video: 'front', casters: 8 },
  high: { name: 'high', dpr: 2,   msaa: 4, bloom: true,  grade: true,  shadowMap: 2048, video: 'both',  casters: 16 },
};

/** Pure: decide from what the browser tells us. iOS never lands on `high`
 *  (the memory ceiling is the whole problem); Android trusts `deviceMemory`
 *  (Chrome rounds to a power of two, so 6 GB reads 4) and the core count;
 *  anything that is not a phone is high. Missing signals fall to the middle. */
export function detectTier(env = {}) {
  const { ua = '', platform = '', maxTouchPoints = 0, deviceMemory = null, hardwareConcurrency = null, screenW = 0, screenH = 0, override = null } = env;
  if (override && TIERS[override]) return { ...TIERS[override], reason: 'override' };
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  if (isIOS) {
    const m = ua.match(/OS (\d+)_/);
    const major = m ? Number(m[1]) : null;
    const shortSide = Math.min(screenW || Infinity, screenH || Infinity);
    if (major !== null && major < 16) return { ...TIERS.low, reason: 'ios-old' };
    if (Number.isFinite(shortSide) && shortSide <= 380) return { ...TIERS.low, reason: 'ios-small' };
    return { ...TIERS.mid, reason: 'ios' };
  }
  if (isAndroid) {
    if ((deviceMemory !== null && deviceMemory <= 2) || (hardwareConcurrency !== null && hardwareConcurrency <= 4)) return { ...TIERS.low, reason: 'android-low' };
    if (deviceMemory !== null && deviceMemory >= 8) return { ...TIERS.high, reason: 'android-high' };
    return { ...TIERS.mid, reason: 'android' };
  }
  return { ...TIERS.high, reason: 'desktop' };
}

/** Read the live browser. Safe without a window (tests, SSR-less builds). */
export function tierFromBrowser(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return { ...TIERS.high, reason: 'no-window' };
  const nav = win.navigator ?? {};
  let override = null;
  try { override = new URLSearchParams(win.location?.search ?? '').get('tier'); } catch { /* fine */ }
  return detectTier({
    ua: nav.userAgent ?? '', platform: nav.platform ?? '', maxTouchPoints: nav.maxTouchPoints ?? 0,
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    hardwareConcurrency: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    screenW: win.screen?.width ?? 0, screenH: win.screen?.height ?? 0, override,
  });
}
```

- [ ] **Step 4: Run the tier tests**

Run: `npx vitest run tests/deviceTier.test.js`
Expected: PASS ×7.

- [ ] **Step 5: Wire the renderer to the tier**

`src/engine/renderer.js`:
- imports: add `import { tierFromBrowser } from './deviceTier.js';`
- signature: `export function createEngine(canvas, opts = {}) {` then first lines:
  ```js
  const tier = opts.tier ?? tierFromBrowser();
  console.info(`[skk] device tier ${tier.name} (${tier.reason}): dpr ${tier.dpr}, msaa ${tier.msaa}, bloom ${tier.bloom}, shadow ${tier.shadowMap}, video ${tier.video}`);
  // antialias:false — every frame renders through the composer, so the
  // backbuffer's own MSAA (~25 MB at phone resolution) was never seen (B38)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dpr));
  ```
- `renderer.shadowMap.type = THREE.PCFShadowMap;` — replace the PCFSoft line; add the comment `// PCFSoftShadowMap is deprecated in r183+ and was silently downgraded to this anyway (B34)`
- samples: `let samples = msaaParam != null ? Math.max(0, Math.min(4, Number(msaaParam) || 0)) : tier.msaa;`
- watchdog: `const watchdog = new PerfWatchdog({ steps: [4, 2, 0].filter((s) => s <= samples) });` — comment: `// the watchdog only ever steps DOWN from the tier's level; a tier at 0 never fires`
- `rebuildChain()`:
  ```js
  function rebuildChain() {
    composer.passes.length = 0;
    composer.addPass(renderPass);
    if (tier.bloom) composer.addPass(bloomPass);
    if (quality === 'high' && tier.grade) composer.addPass(gradePass);
    composer.addPass(outputPass);
  }
  ```
- engine object: add `tier,` right after `THREE,`.
- Timer (B34): replace `const clock = new THREE.Clock();` with `const timer = new THREE.Timer();` and in `loop(ts)`: after `lastFrameAt = performance.now();` put `timer.update(ts);` then `const rawDt = Math.min(timer.getDelta(), 0.05);` and `gradePass.uniforms.time.value = timer.getElapsed();`. (`Timer` is exported from `three` core in r184: `src/Three.Core.js:109`.)

- [ ] **Step 6: Feed the tier to the field**

`src/game/matchScene.js:137`: `this.field = buildField(fieldData, engine.scene, { video: engine.tier?.video, shadowMap: engine.tier?.shadowMap });`
`src/main.js` lines 64 and 98 (`?glb` and `?dance` harnesses): `buildField(blacktop, engine.scene, { video: engine.tier.video, shadowMap: engine.tier.shadowMap })`.

- [ ] **Step 7: Teach the round harness about tiers**

`scripts/round-e2e.mjs` scenario 9 (lines 882-893) becomes:
```js
  const start = await page.evaluate(() => ({ s: window.__engine.samples, tier: window.__engine.tier.msaa, rt1: window.__engine.composer.renderTarget1.samples, rt2: window.__engine.composer.renderTarget2.samples }));
  ok(start.s === start.tier && start.rt1 === start.tier && start.rt2 === start.tier, `the composer targets start at the device tier's MSAA (${JSON.stringify(start)})`);
  const next = start.tier >= 2 ? start.tier / 2 : 0;
  const dropped = await page.evaluate(async (n) => {
    let frames = 0;
    const off = window.__engine.onFrame(() => { frames += 1; });
    window.__engine.setSamples(n);
    await new Promise((r) => setTimeout(r, 400));
    off?.();
    return { s: window.__engine.samples, rt1: window.__engine.composer.renderTarget1.samples, rt2: window.__engine.composer.renderTarget2.samples, frames };
  }, next);
  ok(dropped.s === next && dropped.rt1 === next && dropped.rt2 === next, `setSamples(${next}) lands on both targets (${JSON.stringify(dropped)})`);
```
and update the header comment line 27-28 to "the composer target starts at the device tier's MSAA".

- [ ] **Step 8: Run the tests**

Run: `npx vitest run`
Expected: all green (679 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "perf(tier): one boot-time device tier drives DPR, MSAA, bloom, shadows and the backdrop video

iOS never gets 'high': the memory ceiling IS the crash (audit §02 B). Low =
SE-class / iOS 15 / 2 GB Android: DPR 1.5, no MSAA, no bloom or grade,
1024² shadows, posters only, six casters. Mid = every other iPhone and 4 GB
Android: 2× MSAA, bloom + grade kept, one backdrop loop. High = desktop and
8 GB Android: today's look. antialias:false on the main renderer (B38 — the
composer owns AA), PCFShadowMap and THREE.Timer replace the deprecated pair
(B34). The PerfWatchdog still steps down from the tier's level. ?tier=
overrides for the harnesses; round-e2e's MSAA scenario reads the tier.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
```

---

### Task 6: Stop rendering behind menus; build the neutral IBL on the first real frame (B16, B23)

**Files:**
- Create: `src/engine/renderGate.js`
- Modify: `src/engine/renderer.js` (gate in the loop, lazy neutral env), `src/main.js` (observers after `createEngine`), `src/cinematics/videoPlayer.js:7` (wrap class)
- Test: `tests/renderGate.test.js`

**Interfaces:**
- Produces: `RenderGate` (`setCovered(bool)`, `shouldRender() → bool`, `covered`), `isCovered(stageEl) → bool`; `engine.setCovered(bool)`, `engine.covered` getter.

- [ ] **Step 1: Write the failing test**

```js
// tests/renderGate.test.js
import { it, expect } from 'vitest';
import { RenderGate, isCovered } from '../src/engine/renderGate.js';

// Title, Menu, Team Select, Locker, Post-game and the intro videos all sit on
// an OPAQUE layer over the canvas, and the engine kept rendering the full
// post chain at 60 fps underneath every one of them (audit B16). The gate
// lets a couple of frames through after any change (so the last drawn frame
// is current when a screen lifts) and then skips composer.render().

it('renders while uncovered, settles two frames after being covered, then skips', () => {
  const g = new RenderGate({ settleFrames: 2 });
  expect(g.shouldRender()).toBe(true);
  g.setCovered(true);
  expect([g.shouldRender(), g.shouldRender(), g.shouldRender(), g.shouldRender()]).toEqual([true, true, false, false]);
  g.setCovered(false);
  expect([g.shouldRender(), g.shouldRender(), g.shouldRender()]).toEqual([true, true, true]);
});

it('setting the same state twice does not re-arm the settle frames', () => {
  const g = new RenderGate({ settleFrames: 1 });
  g.setCovered(true); g.shouldRender();
  g.setCovered(true);
  expect(g.shouldRender()).toBe(false);
});

// a tiny DOM stand-in: elements with classList/children/querySelector
function el(cls = '', children = [], attrs = {}) {
  const classes = new Set(cls.split(' ').filter(Boolean));
  const node = {
    classList: { contains: (c) => classes.has(c) }, children, hidden: !!attrs.hidden, id: attrs.id ?? '',
    querySelector(sel) {
      const want = sel.startsWith('#') ? (n) => n.id === sel.slice(1) : (n) => n.classList.contains(sel.slice(1));
      const walk = (n) => { for (const c of n.children) { if (want(c)) return c; const r = walk(c); if (r) return r; } return null; };
      return walk(this);
    },
  };
  return node;
}

it('an opaque .screen in #ui-root covers; a transparent one (coin toss) or an empty root does not', () => {
  const stage = (kids) => el('', [el('', kids, { id: 'ui-root' })]);
  expect(isCovered(stage([el('screen menu-screen')]))).toBe(true);
  expect(isCovered(stage([el('screen transparent coin-screen')]))).toBe(false);
  expect(isCovered(stage([]))).toBe(false);
  expect(isCovered(stage([el('screen', [], { hidden: true })]))).toBe(false);
});

it('an intro/splash video wrapper covers; the pause overlay (not a .screen) does not', () => {
  const stage = el('', [el('', [], { id: 'ui-root' }), el('video-cover')]);
  expect(isCovered(stage)).toBe(true);
  const paused = el('', [el('', [], { id: 'ui-root' }), el('pause-overlay show')]);
  expect(isCovered(paused)).toBe(false);
  expect(isCovered(null)).toBe(false);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/renderGate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the gate**

```js
// src/engine/renderGate.js
// Skip the post chain while an opaque DOM layer covers the canvas (audit B16).
// Frame CALLBACKS keep running — this only decides whether composer.render()
// is worth calling. `settleFrames` frames are always drawn after a change so
// the framebuffer holds a current image when a screen lifts.
export class RenderGate {
  constructor({ settleFrames = 2 } = {}) {
    this.covered = false;
    this.settleFrames = settleFrames;
    this._pending = 0;
  }
  setCovered(on) {
    on = !!on;
    if (on === this.covered) return;
    this.covered = on;
    this._pending = this.settleFrames;
  }
  /** Call once per frame. true = draw this frame. */
  shouldRender() {
    if (!this.covered) return true;
    if (this._pending > 0) { this._pending -= 1; return true; }
    return false;
  }
}

/** Is the stage's canvas hidden behind something opaque right now? Opaque =
 *  a `.screen` in #ui-root that is not `.transparent` (the coin toss shows the
 *  field through) and not hidden, or a set-piece video wrapper
 *  (`.video-cover`). The pause overlay is neither: the game stays visible. */
export function isCovered(stage) {
  if (!stage) return false;
  if (stage.querySelector('.video-cover')) return true;
  const ui = stage.querySelector('#ui-root');
  if (!ui) return false;
  for (const child of ui.children) {
    if (!child.classList?.contains('screen')) continue;
    if (child.classList.contains('transparent') || child.hidden) continue;
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Run the gate tests**

Run: `npx vitest run tests/renderGate.test.js`
Expected: PASS ×4.

- [ ] **Step 5: Wire the renderer**

`src/engine/renderer.js`:
- import: `import { RenderGate } from './renderGate.js';`
- replace the neutral IBL block (lines 92-112, `let pmrem = null; try { pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(...)...`) with:
  ```js
  let pmrem = null;
  try { pmrem = new THREE.PMREMGenerator(renderer); } catch (e) { console.warn('[skk] PMREM unavailable, no env map:', e); }
  // The neutral room map is built on the FIRST FRAME THAT DRAWS, not at boot:
  // menus cover the canvas for the first minute of a session and the field's
  // own map usually replaces it before anything is seen (B23). Same PMREM_CUBE
  // as the scene map so the swap never moves the program key (see above).
  let neutralBuilt = false;
  function ensureNeutralEnv() {
    if (neutralBuilt || !pmrem || scene.environment) return;
    neutralBuilt = true;
    try {
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04, 0.1, 100, { size: PMREM_CUBE }).texture;
      scene.environmentIntensity = 0.5;
    } catch (e) { console.warn('[skk] env map (RoomEnvironment/PMREM) unavailable, skipping:', e); }
  }
  ```
  Keep the long PMREM comment above `PMREM_CUBE` and the "SIZE PINNED" explanation (move it onto `ensureNeutralEnv`).
- `setSceneEnvironment(url)`: every path that leaves the scene WITHOUT a field map must fall back to the neutral one BEFORE it settles `envReady`, or the prewarm (which awaits `envReady`) links env-less programs and the first drawn frame re-links all sixteen — the exact "renders one by one" regression. So: in the `if (!url || !pmrem) { settle(); return; }` early-out call `ensureNeutralEnv();` first; in the `catch` inside the image callback and in the loader's error callback call `ensureNeutralEnv();` before `settle()`.
- in the context-restored handler replace the rebuild lines with:
  ```js
  if (pmrem) {
    pmrem.dispose();
    pmrem = new THREE.PMREMGenerator(renderer);
    sceneEnvRT?.dispose(); sceneEnvRT = null;
    scene.environment = null; neutralBuilt = false;
    if (lastEnvUrl) engine.setSceneEnvironment(lastEnvUrl); else ensureNeutralEnv();
  }
  ```
- gate: after `const frameCbs = new Set();` add `const gate = new RenderGate();`; on the engine object add
  ```js
  setCovered(on) { gate.setCovered(on); },
  get covered() { return gate.covered; },
  ```
- in `loop()` replace `if (contextLost) return;` with
  ```js
  if (contextLost) return; // nothing to draw into; three would early-return anyway
  if (!gate.shouldRender()) return; // an opaque screen or a video covers the canvas (B16)
  ensureNeutralEnv();
  ```

- [ ] **Step 6: Drive the gate from the DOM**

`src/cinematics/videoPlayer.js:7`: before the `style.cssText` line add `wrap.className = 'video-cover';` (the class carries no CSS; the render gate reads it).

`src/main.js`, right after `window.__bus = bus; ...` (line 52):
```js
// RENDER GATE (Phase 1, B16): the post chain used to run at 60 fps under the
// Title, Menu, Team Select, Locker and the intro videos. Watch the UI root
// and the stage for opaque covers and tell the engine; the coin toss is
// `.screen.transparent` and keeps drawing. One cheap query per DOM change.
const refreshCover = () => engine.setCovered(isCovered(stage));
new MutationObserver(refreshCover).observe(uiRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
new MutationObserver(refreshCover).observe(stage, { childList: true });
refreshCover();
```
with `import { isCovered } from './engine/renderGate.js';` at the top.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run`
Expected: all green (683 tests). `tests/prewarm.test.js` still passes (it never touches the gate).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "perf(render): no post chain behind menus or videos; the neutral IBL waits for the first drawn frame

Title, Menu, Team Select, Locker, Post-game and both intro videos are
opaque layers, and the composer ran the full chain under all of them (B16).
A RenderGate skips composer.render() while #ui-root holds a non-transparent
.screen or the stage holds a set-piece video wrapper, drawing two settle
frames after every change; frame callbacks are untouched. The RoomEnvironment
PMREM is built on the first frame that actually draws (B23).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
```

---

### Task 7: Shadow-caster budget and frustum culling for the rigs (B17)

**Files:**
- Create: `src/game/shadowBudget.js`
- Modify: `src/game/glbCharacters.js:615-617` (culling sphere), `src/game/prewarm.js` (`warmNow` stages unculled), `src/game/matchScene.js:4425` (`update` refresh)
- Test: `tests/shadowBudget.test.js`, `tests/prewarm.test.js` (one new case)

**Interfaces:**
- Produces: `pickCasters(chars, camPos, n) → Set<char>`, `castersOf(char) → SkinnedMesh[]` (only meshes built with `castShadow === true`; memoised on `char._casterMeshes`), `applyCasters(chars, picked) → number`; `CULL_RADIUS_SCALE = 2.2` exported from glbCharacters.js; `MatchScene.refreshShadowCasters()`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/shadowBudget.test.js
import { it, expect } from 'vitest';
import * as THREE from 'three';
import { pickCasters, castersOf, applyCasters } from '../src/game/shadowBudget.js';

// Sixteen un-culled 25k-triangle rigs all cast into a 2048² soft shadow map
// (audit B17). Only the N rigs nearest the camera cast now; N is the tier's.
function fakeChar(x, z, { casts = true } = {}) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const body = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  body.castShadow = casts;
  const patch = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  patch.castShadow = false; // a decal patch never casts — and must never be switched on
  group.add(body, patch);
  return { group, body, patch };
}

it('picks the n nearest characters to the camera', () => {
  const chars = [fakeChar(0, -30), fakeChar(0, -2), fakeChar(5, -5), fakeChar(-20, -20)];
  const picked = pickCasters(chars, new THREE.Vector3(0, 6, 8), 2);
  expect([...picked]).toEqual([chars[1], chars[2]]);
});

it('a budget at or above the roster picks everyone; zero picks nobody', () => {
  const chars = [fakeChar(0, 0), fakeChar(1, 1)];
  expect(pickCasters(chars, new THREE.Vector3(), 16).size).toBe(2);
  expect(pickCasters(chars, new THREE.Vector3(), 0).size).toBe(0);
});

it('castersOf lists only the meshes the build made casters, once', () => {
  const c = fakeChar(0, 0);
  expect(castersOf(c)).toEqual([c.body]);
  expect(castersOf(c)).toBe(c._casterMeshes);
});

it('applyCasters switches the budgeted rigs on and the rest off, leaving non-casters alone', () => {
  const chars = [fakeChar(0, -1), fakeChar(0, -40)];
  const on = applyCasters(chars, new Set([chars[0]]));
  expect(on).toBe(1);
  expect(chars[0].body.castShadow).toBe(true);
  expect(chars[1].body.castShadow).toBe(false);
  expect(chars[1].patch.castShadow).toBe(false);
  applyCasters(chars, new Set([chars[1]]));
  expect([chars[0].body.castShadow, chars[1].body.castShadow]).toEqual([false, true]);
});
```

Add to `tests/prewarm.test.js`: in `fakeChar`, after `body.skeleton = ...` add `body.frustumCulled = true;` and in `fakeEngine`'s `render(sc, cam)` record culling state: inside the existing `sc.traverse((o) => { ... })` add `if (o.isSkinnedMesh) log.push(['drawCulled', o.parent?.name, o.frustumCulled]);`. Then a new case:

```js
it('stages every skinned mesh UNCULLED for the warm draw and restores culling after', () => {
  const eng = fakeEngine();
  const a = fakeChar('a'); a.group.visible = false;
  const stats = warmNow(eng, [a]);
  expect(stats.drew).toBe(true);
  expect(eng.log.filter((e) => e[0] === 'drawCulled')).toEqual([['drawCulled', 'a', false]]);
  expect(a.body.frustumCulled).toBe(true);
});
```
(`fakeEngine` must expose `log` — check how the existing cases read it and match that.)

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/shadowBudget.test.js tests/prewarm.test.js`
Expected: shadowBudget FAILS (module not found); the new prewarm case FAILS (`drawCulled` logged `true`).

- [ ] **Step 3: Write the budget module**

```js
// src/game/shadowBudget.js
// The tier says how many rigs may cast a shadow; the camera says which. The
// pitcher, the kicker and the near infield are the shadows a phone player
// reads; a left fielder's shadow forty metres out is 25k triangles into the
// shadow map for nothing (audit B17). Pure — unit-tested.
export function pickCasters(chars, camPos, n) {
  const list = chars.filter((c) => c?.group);
  if (n >= list.length) return new Set(list);
  if (n <= 0) return new Set();
  const ranked = list.map((c) => ({ c, d: c.group.position.distanceToSquared(camPos) })).sort((a, b) => a.d - b.d);
  return new Set(ranked.slice(0, n).map((x) => x.c));
}

/** The meshes on this character the BUILD made casters (body, bands). Decal
 *  patches are built `castShadow = false` and stay that way. Memoised. */
export function castersOf(char) {
  if (!char._casterMeshes) {
    const out = [];
    char.group?.traverse?.((o) => { if (o.isMesh && o.castShadow) out.push(o); });
    char._casterMeshes = out;
  }
  return char._casterMeshes;
}

/** Apply a pick: budgeted rigs cast, the rest don't. Returns how many cast. */
export function applyCasters(chars, picked) {
  let on = 0;
  for (const c of chars) {
    const cast = picked.has(c);
    for (const m of castersOf(c)) m.castShadow = cast;
    if (cast) on += 1;
  }
  return on;
}
```

Note `castersOf` must be called on a character BEFORE any `applyCasters` turns its meshes off (the memo reads the build-time flags). `applyCasters` does exactly that, in order, for every char in `chars` — every char it will ever see is in the list on the first call.

- [ ] **Step 4: Cull the rigs, stage them unculled in the warm**

`src/game/glbCharacters.js`, in `buildGlbCharacter`'s traverse (line 615-617) replace `o.castShadow = true; o.frustumCulled = false;` with:
```js
      o.castShadow = true;
      // FRUSTUM CULLING (Phase 1, B17). Skinned meshes ship `frustumCulled =
      // false` because three would otherwise compute a sphere from the SKINNED
      // vertices every frame. We give each one a fixed sphere instead: the
      // bind pose's, grown ×CULL_RADIUS_SCALE so a dive, a bicycle kick or a
      // hips bob never leaves it. Off-screen fielders then skip the main pass
      // (the shadow pass has its own budget — shadowBudget.js). The prewarm
      // stages every rig UNCULLED for its one draw, so bone textures and
      // shadow variants still link before the walk-out.
      if (o.isSkinnedMesh) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        o.boundingSphere = o.geometry.boundingSphere.clone();
        o.boundingSphere.radius *= CULL_RADIUS_SCALE;
        o.frustumCulled = true;
      } else {
        o.frustumCulled = false;
      }
```
and near `RECOLOR_CACHE_MAX` add `export const CULL_RADIUS_SCALE = 2.2;`.

`src/game/prewarm.js` `warmNow`: in the staging loop, after `if (!inTree(g, scene)) scene.add(g);` add
```js
    // culling off for the warm draw: the live camera must "see" every rig so
    // its bone texture is created and its shadow variant linked (B17 culling)
    g.traverse?.((o) => { if (o.isSkinnedMesh && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
```
with `const culled = [];` declared beside `const staged = [];`, and in the unstage loop (after the `for (const s of staged)` block) add `for (const o of culled) o.frustumCulled = true;`. Update the comment at "The draw is what CREATES the bone textures..." to say the rigs are staged unculled here.

- [ ] **Step 5: Refresh the budget from the scene**

`src/game/matchScene.js`:
- import: `import { pickCasters, applyCasters } from './shadowBudget.js';`
- at the top of `update(dt, rawDt)` (line 4425) add:
  ```js
    // SHADOW BUDGET (Phase 1, B17): the tier's N nearest rigs cast; re-picked
    // four times a second, which follows every camera cut without per-frame cost
    this._casterT = (this._casterT ?? 0) + rawDt;
    if (this._casterT >= 0.25) { this._casterT = 0; this.refreshShadowCasters(); }
  ```
- new method next to `fieldingChars()` (line 811):
  ```js
  refreshShadowCasters() {
    const n = this.engine.tier?.casters ?? 16;
    const all = [...(this.chars?.home ?? []), ...(this.chars?.away ?? [])];
    applyCasters(all, pickCasters(all, this.engine.camera.position, n));
  }
  ```
- call `this.refreshShadowCasters();` once at the end of the constructor's character setup (find where `this.chars` is assigned, after the field build) so the first frame already respects the budget.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run`
Expected: all green (688 tests). If a `glbCharacters`-importing test (`casts`, `fenceBits`, `jerseyDecals`, `lockerModel`) fails on `CULL_RADIUS_SCALE`, the export is missing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "perf(shadows): only the tier's nearest rigs cast, and off-screen rigs are culled

Sixteen 18-31k-triangle rigs went into the 2048² shadow map and the main
pass every frame wherever they stood (audit B17). Each SkinnedMesh now
carries a fixed bind-pose sphere grown ×2.2 so three can cull it without
re-measuring skinned vertices; matchScene re-picks the N nearest casters
four times a second (N from the tier: 6 / 8 / 16). The prewarm stages every
rig unculled for its one draw, so nothing meets the GPU on the walk-out.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
```

---

### Task 8: The character build breathes — prefetch everything, yield between bodies (B15)

**Files:**
- Create: `src/engine/yieldToMain.js`
- Modify: `src/game/glbCharacters.js:817-862` (`buildTeamCharsGlb`)
- Test: `tests/yieldToMain.test.js`

**Interfaces:**
- Produces: `yieldToMain(maxWaitMs = 50) → Promise<void>` (resolves after the next animation frame + a macrotask, or after `maxWaitMs` if no frame comes — hidden tab, node).

- [ ] **Step 1: Write the failing test**

```js
// tests/yieldToMain.test.js
import { it, expect } from 'vitest';
import { yieldToMain } from '../src/engine/yieldToMain.js';

// Sixteen serial recolours of 130-400 ms each blocked the UI thread for a
// measured 14 s while the intro videos played — TAP TO SKIP did nothing
// (audit B15). Between bodies the build now hands the thread back.

it('resolves without requestAnimationFrame (node, a hidden tab) within the cap', async () => {
  const t0 = Date.now();
  await yieldToMain(30);
  expect(Date.now() - t0).toBeLessThan(500);
});

it('uses requestAnimationFrame when there is one, then a macrotask', async () => {
  const calls = [];
  globalThis.requestAnimationFrame = (cb) => { calls.push('raf'); setTimeout(() => cb(16), 0); return 1; };
  try {
    await yieldToMain(1000);
    expect(calls).toEqual(['raf']);
  } finally { delete globalThis.requestAnimationFrame; }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/yieldToMain.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

```js
// src/engine/yieldToMain.js
/** Hand the main thread back for one frame: resolves after the next animation
 *  frame plus a macrotask (so input handlers and paint get in), or after
 *  `maxWaitMs` when no frame is coming (hidden tab, node). */
export function yieldToMain(maxWaitMs = 50) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const cap = setTimeout(finish, maxWaitMs);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => { clearTimeout(cap); setTimeout(finish, 0); });
    }
  });
}
```

- [ ] **Step 4: Run the helper tests**

Run: `npx vitest run tests/yieldToMain.test.js`
Expected: PASS ×2.

- [ ] **Step 5: Restructure the team build**

`src/game/glbCharacters.js`: import `yieldToMain` (`import { yieldToMain } from '../engine/yieldToMain.js';`) and rewrite the body of `buildTeamCharsGlb` from `const out = [];` (line 835) to the return:

```js
  // PREFETCH (B15): the old loop fetched slot N+1's model and clip pack only
  // after slot N's synchronous recolour had finished, so the network sat idle
  // between bodies. Everything comes down at once now (loadGltf and
  // loadMocapClips both cache per URL), and the build below is pure CPU.
  const slots = roster.map((p, i) => ({ p, i, archIdx: archIdxFor(team, i), cast: castSlotFor(team, i) }));
  await Promise.all(slots.map((s) => Promise.all([
    loadGltf(ARCHETYPES[s.archIdx]).catch(() => null), // a 404 is handled per-slot below (fallback model)
    clipsFor(s.archIdx),
  ])));
  const out = [];
  for (const s of slots) {
    // BREATHE (B15): the recolour + fence + panel pass is synchronous pixel
    // work per body. Between bodies the thread goes back to the page so TAP TO
    // SKIP on the intro video answers and the frame loop paints.
    if (out.length) await yieldToMain();
    const { p, i, archIdx, cast } = s;
    const clips = await clipsFor(archIdx);
    let char;
    try {
      char = await buildGlbCharacter({ model: ARCHETYPES[archIdx], teamColor: primary, cleatHex, cast }, { heightM: 2.05, clips });
    } catch {
      // fallback model has a DIFFERENT rig — no baked set; use the code animator
      char = await buildGlbCharacter({ model: FALLBACK_MODEL }, { heightM: 2.05, clips: null });
    }
    char.cast = cast;
    // the headband / wristbands, PRINTED on this body in the crew's accent
    char.accessories = attachAccessory(char, cast?.accessory, bandHexFor(team), { scale: cast?.height ?? 1 });
    char.data = p;
    char.number = p.number ?? JERSEY_NUMBERS[i % JERSEY_NUMBERS.length];
    char.gender = FEMALE_ARCHETYPES.has(archIdx) ? 'she' : 'he'; // for the announcer's he/she calls
    char.hasBall = false;
    char.archKey = clips ? archKeyOf(archIdx) : null; // which extras packs (mocap-<pack>-*) fit this rig
    // crew mark front and back + this player's number (spec §2). Never awaited:
    // the mark streams in behind the character, which is on the field either way.
    char.decals = attachJerseyDecals(char, { logoUrl, number: char.number, ink: kit.ink });
    out.push(char);
  }
  return out;
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run`
Expected: all green (690 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "perf(build): every model and clip pack in flight at once; the thread breathes between bodies

The roster loop fetched slot N+1 only after slot N's synchronous recolour,
and sixteen 130-400 ms recolours back to back blocked the UI thread for a
measured 14 s under the intro videos — TAP TO SKIP did nothing (audit B15).
Models and clips prefetch in parallel; between bodies the build yields a
frame. With the 1024² atlases each recolour is ~4× cheaper as well.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
```

---

### Task 9: Boot weight — self-hosted fonts, a right-sized logo and coins (B23, B40)

**Files:**
- Create: `scripts/fetch-fonts.mjs`, `src/ui/fonts.css`, `public/fonts/*.woff2` (4 files)
- Modify: `src/ui/ui.css:8`, `public/assets/branding/logo-square.png` (2000² → 1024²), `coin-heads.png`/`coin-tails.png` (1024² → 512²)
- Test: `tests/uiCss.test.js` (created here; extended in Task 11)

**Interfaces:**
- Produces: `public/fonts/permanent-marker-400.woff2`, `archivo-500.woff2`, `archivo-700.woff2`, `archivo-900.woff2`; `src/ui/fonts.css` with four `@font-face` rules; `ui.css` imports `./fonts.css`.

- [ ] **Step 1: Write the failing test**

```js
// tests/uiCss.test.js
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/uiCss.test.js`
Expected: FAIL ×2 (Google import present; logo is 2000²).

- [ ] **Step 3: Fetch the fonts**

```js
// scripts/fetch-fonts.mjs
// Self-host the two UI faces (both OFL). Asks Google's CSS API with a modern
// Chrome UA so it answers with woff2 + unicode-range subsets, keeps the
// `latin` block of each face, downloads it and writes src/ui/fonts.css.
// Run once: node scripts/fetch-fonts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&family=Archivo:wght@500;700;900&display=swap';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text();
const blocks = [...css.matchAll(/\/\*\s*(\w[\w-]*)\s*\*\/\s*@font-face\s*{([^}]*)}/g)]
  .map((m) => ({ subset: m[1], body: m[2] }))
  .filter((b) => b.subset === 'latin');
fs.mkdirSync(path.join(root, 'public/fonts'), { recursive: true });
const faces = [];
for (const b of blocks) {
  const family = b.body.match(/font-family:\s*'([^']+)'/)[1];
  const weight = b.body.match(/font-weight:\s*(\d+)/)[1];
  const url = b.body.match(/url\(([^)]+\.woff2)\)/)[1];
  const file = `${family.toLowerCase().replace(/\s+/g, '-')}-${weight}.woff2`;
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(path.join(root, 'public/fonts', file), bytes);
  faces.push({ family, weight, file, size: bytes.length });
  console.log(`${file} ${(bytes.length / 1024).toFixed(0)} KB`);
}
const out = ['/* Self-hosted UI faces (Permanent Marker + Archivo, both OFL). Generated by scripts/fetch-fonts.mjs — do not edit by hand. */',
  ...faces.map((f) => `@font-face { font-family: '${f.family}'; font-style: normal; font-weight: ${f.weight}; font-display: swap; src: url('/fonts/${f.file}') format('woff2'); }`)];
fs.writeFileSync(path.join(root, 'src/ui/fonts.css'), out.join('\n') + '\n');
console.log(`wrote src/ui/fonts.css with ${faces.length} faces`);
```

Run: `node scripts/fetch-fonts.mjs`
Expected: four `.woff2` lines (Permanent Marker 400, Archivo 500/700/900), each 20–80 KB, and `wrote src/ui/fonts.css with 4 faces`. If Google returns a single variable-font block for Archivo (one `font-weight: 500 900`), the regex takes the first number and writes one file: then duplicate the `@font-face` for 700 and 900 pointing at the same file and name it `archivo-500.woff2`, `archivo-700.woff2`, `archivo-900.woff2` by copying — the test wants four files.

- [ ] **Step 4: Point the stylesheet at them**

`src/ui/ui.css:8`: replace the `@import url('https://fonts.googleapis.com/...')` line with `@import './fonts.css';`.

- [ ] **Step 5: Right-size the branding PNGs**

```bash
node -e "
const sharp=require('sharp');const fs=require('fs');
(async()=>{
 for (const [f,s] of [['logo-square.png',1024],['coin-heads.png',512],['coin-tails.png',512]]) {
  const p='public/assets/branding/'+f; const b=await sharp(p).resize(s,s,{fit:'inside',kernel:'lanczos3'}).png({compressionLevel:9,palette:false}).toBuffer();
  console.log(f, fs.statSync(p).size, '->', b.length); fs.writeFileSync(p,b);
 }})();"
```
Expected: logo 3.1 MB → ≈ 0.8 MB, coins 2.1/1.8 MB → ≈ 0.4 MB each.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run`
Expected: all green (692 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "perf(boot): self-hosted fonts, a 1024² logo and 512² coins

The stylesheet's first line was a render-blocking fetch to Google Fonts,
and the TAP IN gate decoded a 2000² PNG (16 MB decoded) before anything
else on a cold start (audit B23/B40). Permanent Marker + Archivo 500/700/900
now ship as four latin woff2 files under public/fonts (scripts/fetch-fonts.mjs);
the logo is 1024² (it shows at ≤380 CSS px), the coin faces 512².

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
```

---

### Task 10: Portraits become WebP (64 → ≈ 7 MB)

**Files:**
- Create: `scripts/convert-portraits.mjs`
- Modify (binary): `public/assets/players/*.png` → `*.webp` (50 files)
- Modify: `src/ui/screens/screens.js:251-256`, `tests/assetReferences.test.js` (`PORTRAIT_EXT = 'webp'` + a "no PNG portraits" case)

**Interfaces:**
- Consumes: `PORTRAIT_EXT` from Task 2's test.
- Produces: portrait URLs end in `.webp` everywhere the source names them.

- [ ] **Step 1: Make the test demand WebP**

In `tests/assetReferences.test.js` set `export const PORTRAIT_EXT = 'webp';` and add:
```js
it('portraits ship as WebP (the 50 PNGs were 64 MB)', () => {
  const pngs = fs.readdirSync(path.join(pub, 'assets/players')).filter((f) => f.endsWith('.png'));
  expect(pngs).toEqual([]);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/assetReferences.test.js`
Expected: FAIL — orphan list = all 50 PNGs (nothing derives `.png` any more), PNG case fails.

- [ ] **Step 3: Convert**

```js
// scripts/convert-portraits.mjs
// 50 team-select portraits, 848×1264 PNG with alpha at ~1.3 MB each → WebP.
// Run once: node scripts/convert-portraits.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/players');
let before = 0, after = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.png'))) {
  const src = path.join(dir, f), dst = src.replace(/\.png$/, '.webp');
  const out = await sharp(src).webp({ quality: 84, alphaQuality: 90, effort: 6 }).toBuffer();
  before += fs.statSync(src).size; after += out.length;
  fs.writeFileSync(dst, out);
  fs.unlinkSync(src);
  console.log(`${f} -> ${path.basename(dst)} ${(out.length / 1024).toFixed(0)} KB`);
}
console.log(`portraits: ${(before / 1048576).toFixed(1)} -> ${(after / 1048576).toFixed(1)} MB`);
```

Run: `node scripts/convert-portraits.mjs`
Expected: 50 lines, `portraits: 62.9 -> ≈ 7 MB`.

- [ ] **Step 4: Point the screen at them**

`src/ui/screens/screens.js` lines 251-256: change the three `.png` suffixes to `.webp`:
```js
          const signature = `assets/players/${base}.webp`;
          img.onerror = () => { // alt kit missing -> signature image -> generic team image
            img.onerror = () => { img.onerror = null; img.src = `assets/players/${t.id}.webp`; };
            img.src = signature;
          };
          img.src = `assets/players/${base}${k.img}.webp`;
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run`
Expected: all green (693 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "perf(diet): team-select portraits ship as WebP (64 -> 7 MB)

Fifty 848×1264 PNGs with alpha at ~1.3 MB each, downloaded on the team
select screen (never cached by the service worker, on purpose). WebP q84
keeps the alpha edge; every rung of the alt -> signature -> crew fallback
chain moves with them. tests/assetReferences.test.js derives all fifty names.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
```

---

### Task 11: The CSS ledger — dvh, touch-callout, paint-cheap pulses, no blur over the canvas (B24, B32, B33)

**Files:**
- Modify: `src/ui/ui.css:65-73` (stage), `:286-292` (action hint), `:1274,1278,1302,1448` (tutBag), `:1359` (drill-intro), `:1560-1564` (elementPulse), `:1859,1869-1872` (heatBurn), `:1905-1908` (hotPulse)
- Test: `tests/uiCss.test.js` (extend)

- [ ] **Step 1: Extend the failing test**

Append to `tests/uiCss.test.js`:
```js
// The ledger's CSS items: B24 (100vh under Safari's toolbar), B33 (long-press
// share sheet), B32 (infinite animations on hidden elements; keyframes that
// animate filter/box-shadow/text-shadow repaint every frame; blur over the
// live canvas).
const keyframes = (name) => css().match(new RegExp(`@keyframes ${name}\\s*{[\\s\\S]*?}\\s*}`))?.[0] ?? css().match(new RegExp(`@keyframes ${name}\\s*{[^}]*}`))?.[0] ?? '';

it('the stage uses dynamic viewport height and blocks the iOS long-press callout', () => {
  const stage = css().match(/#stage\s*{[^}]*}/)[0];
  expect(stage).toMatch(/height:\s*100dvh/);
  expect(stage).toMatch(/calc\(100dvh \* 0\.52\)/);
  expect(stage).toMatch(/-webkit-touch-callout:\s*none/);
});

it('the action hint only animates while shown', () => {
  const base = css().match(/\.action-hint\s*{[^}]*}/)[0];
  expect(base).not.toMatch(/animation:\s*hintPulse/);
  expect(css()).toMatch(/\.action-hint\.show\s*{[^}]*animation:\s*hintPulse/);
});

it('infinite pulses animate transform/opacity only', () => {
  expect(keyframes('hotPulse')).not.toMatch(/text-shadow/);
  expect(keyframes('heatBurn')).not.toMatch(/filter|box-shadow/);
  expect(keyframes('elementPulse')).not.toMatch(/box-shadow/);
  expect(keyframes('tutBag')).not.toMatch(/box-shadow/);
});

it('nothing blurs the live canvas', () => {
  expect(css()).not.toMatch(/backdrop-filter/);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/uiCss.test.js`
Expected: the four new cases FAIL.

- [ ] **Step 3: Edit the stylesheet**

`#stage` (lines 65-73):
```css
#stage {
  position: relative;
  height: 100vh;
  height: 100dvh; /* iOS Safari (non-PWA): 100vh sits under the toolbar and hid the bottom HUD row (B24) */
  width: min(100vw, calc(100vh * 0.52)); /* portrait phone aspect (~9:17) */
  width: min(100vw, calc(100dvh * 0.52));
  overflow: hidden;
  background: var(--bg);
  box-shadow: 0 0 50px rgba(0, 0, 0, .7);
  -webkit-touch-callout: none; /* a long press on a crest mid-play opened the iOS share sheet (B33) */
  /* size container so UI uses cqw (% of the FRAME), not vw (% of the desktop window) */
  container-type: inline-size;
}
```

`.action-hint` (line 286): delete `animation: hintPulse 0.8s ease-in-out infinite;` from the base rule and make line 292 `.action-hint.show { opacity: 1; animation: hintPulse 0.8s ease-in-out infinite; }` — the hint sat at `opacity: 0` most of the match with its pulse running.

`hotPulse` (lines 1905-1908): give the chip its glow statically and pulse opacity:
```css
.steal-chips.hot .steal-chip {
  color: var(--gold);
  text-shadow: 0 2px 6px rgba(0,0,0,.85), 0 0 16px rgba(245,179,18,.95);
  animation: hotPulse 0.4s ease-in-out infinite alternate;
}
.steal-chips.hot .steal-chip span { border-bottom-color: var(--gold); }
@keyframes hotPulse { from { opacity: .72; } to { opacity: 1; } }
```

`elementPulse` (lines 1560-1564):
```css
.element-chip.element-live { box-shadow: inset 0 -2px 0 rgba(255,215,94,1); animation: elementPulse .5s ease-in-out infinite alternate; }
@keyframes elementPulse { from { opacity: .7; } to { opacity: 1; } }
```

`heatBurn` (lines 1859, 1869-1872):
```css
.heat-bar.on-fire .heat-fill { box-shadow: 0 0 8px 2px rgba(255,120,42,.9); animation: heatBurn .4s ease-in-out infinite alternate; }
...
@keyframes heatBurn { from { opacity: .8; } to { opacity: 1; } }
```

`tutBag` (line 1278) → `@keyframes tutBag { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }` and give the three users a static glow: line 1274 add `box-shadow: 0 0 14px rgba(245,179,18,.7);`, line 1302 already has one, line 1448 already has one.

`.drill-intro` (line 1359): `background: rgba(5,6,10,.82);` — delete both `backdrop-filter` declarations.

`markerBob` (line 791) stays: the runner arrows are positioned by JS through `transform`, so the bob has to ride a layout property; it is one 40 px element.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run`
Expected: all green (697 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(ui): dvh stage, no iOS long-press callout, paint-cheap pulses, no blur over the canvas

100vh sat under Safari's toolbar and hid the bottom HUD row (B24); a long
press on a crest mid-play opened the share sheet (B33); the action hint
pulsed at opacity 0 for the whole match, and four infinite keyframes
animated text-shadow / box-shadow / filter (a repaint per frame on a phone)
while the drill intro blurred the live canvas (B32). Pulses now ride
opacity or transform with their glow static; tests/uiCss.test.js holds it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
```

---

### Task 12: The Phase 1 harness, and the full verification run

**Files:**
- Create: `scripts/phase1-e2e.mjs`
- Verify: `npm run build`, `scripts/phase0-e2e.mjs`, `scripts/gameover-e2e.mjs`, `scripts/round-e2e.mjs` (WebKit + Chromium), asset totals.

**Interfaces:**
- Consumes: `window.__engine.tier`, `window.__engine.covered`, `window.__engine.renderer.info`, `window.__skk.field.videoMode` / `_videoHooks` / `backdrop`, `window.__skk.chars`.

- [ ] **Step 1: Write the harness**

```js
// scripts/phase1-e2e.mjs
// E2E for the Phase 1 diet + device-tier round (2026-09-22). Drives the REAL
// game in Playwright WebKit (default, iPhone 13 profile) or Chromium
// (BROWSER=chromium, the Android stand-in).
// Run: node scripts/with-dev.mjs scripts/phase1-e2e.mjs
//
// Scenarios:
//   1. TIER LOW    — ?tier=low: no MSAA, no bloom pass, DPR ≤ 1.5, 1024²
//                    shadows, PCFShadowMap, NO backdrop video elements, and the
//                    poster still lands on the front ring.
//   2. TIER HIGH   — ?tier=high: 4× MSAA, bloom in the chain, both loops.
//   3. TIER DEFAULT— the profile's own answer (WebKit iPhone 13 → mid → one
//                    loop; Chromium desktop UA → high → two).
//   4. RENDER GATE — on the menu the composer stops drawing (render.frame
//                    holds) while frame callbacks keep ticking; in a live
//                    match it draws.
//   5. TEXTURE BUDGET — a live match's textures sum ≤ 150 MB (was 242-267).
//   6. SHADOW BUDGET — ≤ tier.casters skinned bodies cast shadows.
//   7. FONTS       — no request leaves for fonts.googleapis.com / gstatic.
//   8. PORTRAITS   — team select shows .webp portraits that decoded.
//   9. BUILD STALL (Chromium only) — longest long task during the match
//                    build is printed; none ≥ 1000 ms.
import { webkit, chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
const which = process.env.BROWSER ?? 'webkit';
const url = (q) => `${BASE}/?${q}`;
const SHOTS = process.env.SHOTS ?? '';
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`PASS  ${label}`); } else { fail++; console.log(`FAIL  ${label}`); } return !!cond; };

async function poll(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await page.evaluate(fn);
    if (v) return v;
    await page.waitForTimeout(100);
  }
  console.log(`TIMEOUT  ${label}`);
  return null;
}
async function bootMatch(page, q) {
  await page.goto(url(q), { waitUntil: 'domcontentloaded' });
  if (!(await poll(page, () => !!window.__skk, 150000, 'scene boot'))) throw new Error('scene never booted');
  await page.evaluate(() => { window.__skk.engine.paused = false; });
  await poll(page, () => !window.__skk.walkoutActive && ['SETUP', 'PITCH', 'PITCH_SELECT'].includes(window.__skk.phase), 60000, 'first at-bat');
}
const tierState = () => ({
  name: window.__engine.tier.name, samples: window.__engine.samples,
  passes: window.__engine.composer.passes.map((p) => p.constructor.name),
  dpr: window.__engine.renderer.getPixelRatio(),
  shadowType: window.__engine.renderer.shadowMap.type,
  shadowMap: window.__skk.field.sun.shadow.mapSize.x,
  videoMode: window.__skk.field.videoMode,
  videos: window.__skk.field._videoHooks.length,
  frontMap: (() => { const b = window.__skk.field.backdrop; const m = (b.children?.[0] ?? b).material; return !!m.map; })(),
});

async function tierScenario(page, tier, expect) {
  console.log(`\n--- TIER ${tier ?? 'DEFAULT'} ---`);
  await bootMatch(page, `match&mute&nosplash${tier ? `&tier=${tier}` : ''}`);
  await page.waitForTimeout(2500); // poster/video swap window
  const s = await page.evaluate(tierState);
  console.log('  ', JSON.stringify(s));
  if (tier) ok(s.name === tier, `tier is ${tier}`);
  else ok(s.name === expect.name, `default tier in this profile is ${expect.name} (${s.name})`);
  ok(s.samples === expect.msaa, `composer samples ${expect.msaa} (${s.samples})`);
  ok(s.passes.includes('UnrealBloomPass') === expect.bloom, `bloom ${expect.bloom ? 'in' : 'out of'} the chain (${s.passes.join(',')})`);
  ok(s.dpr <= expect.dpr + 1e-6, `pixel ratio ≤ ${expect.dpr} (${s.dpr})`);
  ok(s.shadowMap === expect.shadowMap, `shadow map ${expect.shadowMap} (${s.shadowMap})`);
  ok(s.shadowType === 1, `PCFShadowMap (${s.shadowType})`);
  ok(s.videos === expect.videos, `${expect.videos} backdrop video element(s) (${s.videos}, mode ${s.videoMode})`);
  ok(s.frontMap, 'the front ring has a texture (poster or video) after load');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phase1-${which}-tier-${s.name}.png` });
}

async function renderGateScenario(page) {
  console.log('\n--- RENDER GATE ---');
  await page.goto(url('nosplash&go=menu&mute'), { waitUntil: 'domcontentloaded' });
  if (!ok(!!(await poll(page, () => !!window.__engine?.composer, 20000, 'engine')), 'engine up on the menu')) return;
  await page.waitForTimeout(600);
  const a = await page.evaluate(() => ({ covered: window.__engine.covered, frame: window.__engine.renderer.info.render.frame }));
  await page.waitForTimeout(1000);
  const b = await page.evaluate(async () => {
    let cbs = 0; const off = window.__engine.onFrame(() => { cbs += 1; });
    await new Promise((r) => setTimeout(r, 500)); off();
    return { covered: window.__engine.covered, frame: window.__engine.renderer.info.render.frame, cbs };
  });
  ok(a.covered && b.covered, 'the menu covers the canvas');
  ok(b.frame === a.frame, `composer frames hold on the menu (${a.frame} -> ${b.frame})`);
  ok(b.cbs > 5, `frame callbacks keep ticking under the cover (${b.cbs} in 0.5 s)`);
  await bootMatch(page, 'match&mute&nosplash');
  const c = await page.evaluate(() => window.__engine.renderer.info.render.frame);
  await page.waitForTimeout(700);
  const d = await page.evaluate(() => ({ covered: window.__engine.covered, frame: window.__engine.renderer.info.render.frame }));
  ok(!d.covered && d.frame > c, `a live match draws (${c} -> ${d.frame})`);
}

async function budgetScenario(page) {
  console.log('\n--- TEXTURE + SHADOW BUDGET ---');
  await bootMatch(page, 'match&mute&nosplash');
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const seen = new Map();
    window.__engine.scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) for (const k of Object.keys(m)) { const t = m[k]; if (t?.isTexture && t.image && !seen.has(t.uuid)) seen.set(t.uuid, t); }
    });
    let bytes = 0, count = 0, big = 0;
    for (const t of seen.values()) {
      const im = t.image; const w = im.videoWidth || im.width || 0, h = im.videoHeight || im.height || 0;
      if (!w || !h) continue;
      count += 1; bytes += w * h * 4 * 1.33;
      // recolour canvases only — the two backdrop POSTERS are 1248×1664 JPEGs by design
      if (im.tagName === 'CANVAS' && Math.max(w, h) > 1024) big += 1;
    }
    const chars = [...window.__skk.chars.home, ...window.__skk.chars.away];
    let casting = 0; // CHARACTERS with any casting mesh (a body plus its bands is one character)
    for (const c of chars) { let any = false; c.group.traverse((o) => { if (o.isMesh && o.castShadow) any = true; }); if (any) casting += 1; }
    return { mb: bytes / 1048576, count, big, casting, casters: window.__engine.tier.casters, glTextures: window.__engine.renderer.info.memory.textures };
  });
  console.log('  ', JSON.stringify({ ...r, mb: +r.mb.toFixed(1) }));
  // was 242-267 MB measured live with seven 2048² atlases (audit §02 B); sixteen
  // 1024² atlases ≈ 90 MB + 32 decal canvases ≈ 45 MB + two posters ≈ 22 MB + field
  ok(r.mb <= 190, `scene textures ≤ 190 MB (${r.mb.toFixed(1)} MB across ${r.count} textures, GL count ${r.glTextures})`);
  ok(r.big === 0, `no recolour canvas above 1024² (${r.big})`);
  ok(r.casting <= r.casters, `≤ ${r.casters} characters cast shadows (${r.casting})`);
}

async function fontsAndPortraitsScenario(page) {
  console.log('\n--- FONTS + PORTRAITS ---');
  const external = [];
  const onReq = (req) => { if (/fonts\.googleapis|fonts\.gstatic/.test(req.url())) external.push(req.url()); };
  page.on('request', onReq);
  await page.goto(url('nosplash&go=teamSelect&mute'), { waitUntil: 'domcontentloaded' });
  await poll(page, () => !!document.querySelector('.m-player.man')?.complete, 20000, 'portraits');
  await page.waitForTimeout(800);
  page.off('request', onReq);
  ok(external.length === 0, `no Google Fonts requests (${external.length})`);
  const imgs = await page.evaluate(() => [...document.querySelectorAll('.m-player')].map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth })));
  ok(imgs.length >= 2 && imgs.every((i) => /\.webp$/.test(i.src)), `portraits are .webp (${imgs.map((i) => i.src).join(', ')})`);
  ok(imgs.every((i) => i.w > 0), `portraits decoded (${imgs.map((i) => i.w).join(', ')})`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/phase1-${which}-teamselect.png` });
}

async function buildStallScenario(page) {
  if (which !== 'chromium') return;
  console.log('\n--- BUILD STALL (long tasks) ---');
  await page.addInitScript(() => {
    window.__long = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch { /* fine */ }
  });
  await bootMatch(page, 'match&mute&nosplash');
  const longest = await page.evaluate(() => Math.max(0, ...window.__long));
  console.log(`   longest main-thread task during boot+build: ${longest.toFixed(0)} ms (${(await page.evaluate(() => window.__long.length))} long tasks)`);
  ok(longest < 1000, `no single task ≥ 1 s (${longest.toFixed(0)} ms)`);
}

(async () => {
  const browser = await (which === 'chromium' ? chromium : webkit).launch({ headless: true, args: which === 'chromium' ? ['--mute-audio'] : [] });
  // iPhone 14, not 13: Playwright's iPhone 13 descriptor carries an "iPhone OS
  // 15_0" UA, which the tier rule (rightly) reads as an old phone → low. The
  // iPhone 14 descriptor says 16_0 at 390 CSS px → mid, the real-iPhone default.
  const ctx = await browser.newContext(which === 'webkit' ? { ...devices['iPhone 14'] } : { viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  try {
    await tierScenario(page, 'low', { msaa: 0, bloom: false, dpr: 1.5, shadowMap: 1024, videos: 0 });
    await tierScenario(page, 'high', { msaa: 4, bloom: true, dpr: 2, shadowMap: 2048, videos: 2 });
    await tierScenario(page, null, which === 'webkit'
      ? { name: 'mid', msaa: 2, bloom: true, dpr: 2, shadowMap: 1024, videos: 1 }
      : { name: 'high', msaa: 4, bloom: true, dpr: 2, shadowMap: 2048, videos: 2 });
    await renderGateScenario(page);
    await budgetScenario(page);
    await fontsAndPortraitsScenario(page);
    await buildStallScenario(page);
  } catch (e) { fail++; console.log('HARNESS ERROR', e); }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
```

Note for the executor: `field.sun` and `field.backdrop` are on `handles` (see `field.js:397,584`); `videoMode` is added in Task 4. `renderer.info.render.frame` is three's frame counter, incremented per `render()` call — with the gate holding, it stays put.

- [ ] **Step 2: Run it in WebKit**

Run: `node scripts/with-dev.mjs scripts/phase1-e2e.mjs`
Expected: every `PASS`, `0 failed`. Typical WebKit software rendering takes 40–60 s per boot; the whole run is ~6 minutes.

- [ ] **Step 3: Run it in Chromium with screenshots**

Run: `BROWSER=chromium SHOTS="C:/Users/nickp/AppData/Local/Temp/claude/C--Users-nickp-OneDrive-Desktop-streetkickballkings/278601b1-ddda-43ec-a50f-84b3d342f55d/scratchpad/shots" node scripts/with-dev.mjs scripts/phase1-e2e.mjs`
Expected: every `PASS`. Open the three tier screenshots and the team-select shot (Read tool) and confirm: characters recoloured (no grey/white jerseys — the WebP atlas guard), the backdrop present in all three tiers (poster only on low), the portraits sharp.

- [ ] **Step 4: The Phase 0 harnesses still pass**

Run, one at a time:
```
node scripts/with-dev.mjs scripts/phase0-e2e.mjs
BROWSER=chromium node scripts/with-dev.mjs scripts/phase0-e2e.mjs
node scripts/with-dev.mjs scripts/gameover-e2e.mjs
node scripts/with-dev.mjs scripts/round-e2e.mjs
```
Expected: phase0 17/17 (both), gameover 7/7, round-e2e ALL PASS (its MSAA scenario now reads the tier).

- [ ] **Step 5: Build and grep the bundle**

```bash
npm run build
grep -c "GTAOPass\|rapier3d\|spriteCharacters\|fonts.googleapis" dist/assets/*.js dist/assets/*.css   # expect 0 for every file
ls -la dist/assets/*.js dist/assets/*.css
du -sb public/assets | awk '{print $1/1048576 " MB"}'
for d in video models players audio textures branding anims logos; do printf "%8.1f MB  %s\n" "$(du -sb public/assets/$d | awk '{print $1/1048576}')" $d; done
```
Expected: no matches; JS ≈ 1.15 MB (the GTAO pass and the dance harness left), `public/assets` ≈ 195 MB (from ≈ 491): video ≈ 80 → 45 after the loops (intros/splash unchanged), models ≈ 28, players ≈ 7, audio ≈ 33, textures ≈ 10, branding ≈ 2.

- [ ] **Step 6: Commit the harness**

```bash
git add scripts/phase1-e2e.mjs
git commit -m "test(e2e): the Phase 1 harness — tiers, render gate, texture and shadow budgets, fonts, portraits

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
```

---

### Task 13: Session log, memory, PR

**Files:**
- Modify: `SESSION_LOG.md` (append §30), memory `skk-launch-audit-2026-09-12.md` (Phase 1 status), `MEMORY.md` hook.

- [ ] **Step 1: Append §30 to `SESSION_LOG.md`** — what shipped (tasks 1–12 in ledger terms: B15, B16, B17, B18, B23, B24, B32, B33, B34, B38, B40, B43 + dead weight), the measured numbers from Task 12 Step 5 (asset MB before/after, texture MB in a live match, bundle size), what was NOT done and why (B44 gltfCache source eviction — 28 MB after the shrink, not worth the context-loss risk; B22 HUD churn, B21/B25–B31 → the ledger-sweep plan; code-splitting — the bundle is three.js-dominated, ~50 KB to gain; music re-encode — decoded PCM size is duration-bound, no memory win), the gate that still needs a REAL device (≤ 450 MB on an iPhone SE at match 3, 50 fps on a Galaxy A15), and the one visible change on the dev's phone: the home-half backdrop is a still on mid tier (both loops on high; `?tier=high` forces it).

- [ ] **Step 2: Update memory** — in `skk-launch-audit-2026-09-12.md` add a **PHASE 1 STATUS (2026-09-22)** paragraph mirroring §30; keep the MEMORY.md line current.

- [ ] **Step 3: Commit + push the branch + open the PR** (the dev merges on "push" — do NOT merge):
```bash
git add -A
git commit -m "docs(log): session 30 — Phase 1, the diet and the device tiers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A"
git push -u origin fix/phase1-diet-device-tiers
gh pr create --base main --title "Phase 1: the asset diet and the device tiers (audit B15-B18, B23, B24, B32-B34, B38, B40, B43)" --body-file <(printf '%s\n' "<summary from §30>" "" "🤖 Generated with [Claude Code](https://claude.com/claude-code)" "" "https://claude.ai/code/session_01XoQLnUf7snWE4NxfvFBz7A")
```

---

## Not in this plan (and where it goes)

- **B44** (gltfCache source bitmaps): ≈ 28 MB after Task 3; dropping them breaks context-loss re-upload. Revisit if the iPhone SE gate misses.
- **B07, B08, B20, B21, B22, B25–B31**: gameplay/HUD ledger items — a separate "ledger sweep" plan next.
- **Code-splitting the Locker/tutorial/director**: three.js is ~600 KB of the 1.15 MB; the split buys ~50 KB. Not now.
- **Music at 96 kbps**: a decoded track is PCM sized by duration, not bitrate; only download shrinks (~5 MB). Not now.
- **Real-device gate** (≤ 450 MB on an iPhone SE at match 3; 50 fps floor on a Galaxy A15): the dev's phone pass. Phase 2 adds the Capacitor memory API to measure it.

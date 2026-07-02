# Phase 3 — The Blacktop True 3D NYC World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat backdrop/skyline cylinders with a real 3D NYC block — brick buildings rising past the outfield fence, street props around the lot, golden-hour dusk lighting — built from the Gameready3D packs the dev already owns.

**Architecture:** Reuse the proven Phase-1 bake pipeline: a browser harness (`tools/worldbake.html`) loads the pack's FBX buildings/props with their textures, normalizes scale, places them per a layout table, MERGES geometry by material (few draw calls), and exports ONE `world-blacktop.glb` (textures capped at 1024) POSTed to the local sink server. In-game, `src/game/world/blacktop.js` loads that GLB; `field.js` keeps building the legacy backdrop and swaps it out only when the world loads successfully (zero-risk fallback). Dusk lighting ships with the world flag.

**Tech Stack:** Three.js r0.184 (FBXLoader, TGALoader, GLTFLoader, GLTFExporter, BufferGeometryUtils), Vite dev server, existing `scripts/anim-upload-server.mjs` sink, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-01-graphics-overhaul-design.md` — Phase 3 only. "Gameplay geometry (field size, fence distance/height, ball physics) — untouched. This phase is pure visuals."
- Source packs (NEVER modify): `C:\Unity Projects\KickballGame\Assets\Assets\Gameready3D\NYC_Building\` (Vol 1 — 202 FBX + Textures). Vol 2 `.unitypackage` is OUT OF SCOPE for the first pass (Vol 1 suffices; extract later only if the skyline feels thin).
- Perf contract: locked 60fps on the dev's Galaxy S26 Ultra. Merged world ≤ ~20 draw calls, textures ≤1024, `world-blacktop.glb` target ≤ 25MB (PWA-cached).
- Every new path degrades gracefully: a missing/failed `world-blacktop.glb` leaves the CURRENT backdrop visuals untouched — never a blank horizon.
- Dusk mood: warm low sun, orange-teal sky (brand palette), long shadows. Per spec ("C"): hero field only; other fields keep the backdrop system.
- `tools/world-src/` is gitignored (raw FBX/textures); `public/assets/world/blacktop.glb` IS committed.
- Verify visuals by REAL browser play (claude-in-chrome); auto-push mode is active — verify (tests + real play) before each merge.

## File Structure

- Create `scripts/copy-world.mjs` — copies chosen FBX + flattens all pack textures into `tools/world-src/`.
- Modify `scripts/anim-upload-server.mjs` — accept `world-*.glb` names too.
- Create `tools/worldbake.html` + `tools/worldbake.js` — load/normalize/place/merge/preview/export.
- Create `src/game/world/blacktop.js` — runtime loader + dusk lighting appliers.
- Modify `src/game/field.js` — world3d branch (swap backdrop → world on successful load; dusk sky/lights).
- Modify `src/data/fields.json` — blacktop gets `"world3d": true`.

---

### Task 1: Copy script + sink extension

**Files:**
- Create: `scripts/copy-world.mjs`
- Modify: `scripts/anim-upload-server.mjs` (name regex)
- Modify: `.gitignore` (`tools/world-src/`)

**Interfaces:**
- Produces: `tools/world-src/*.fbx` + `tools/world-src/textures/*` (flat) for Task 2; sink accepts `world-blacktop.glb`.

- [ ] **Step 1: Write the copy script**

```js
// scripts/copy-world.mjs — copy the NYC pack meshes + textures the world bake
// uses into tools/world-src/ (gitignored). Textures are FLATTENED into one dir
// so FBXLoader.setResourcePath can resolve them by filename.
// Run once per machine: node scripts/copy-world.mjs
import { cpSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

const PACK = 'C:/Unity Projects/KickballGame/Assets/Assets/Gameready3D/NYC_Building';
const DST = 'tools/world-src';
const TEXDST = join(DST, 'textures');

// full buildings for the skyline + street props for the lot
const MESH_DIRS = ['Static_Meshes/Buildings', 'Static_Meshes/Props', 'Static_Meshes/Foliage'];
const TEX_ROOT = join(PACK, 'Textures');

mkdirSync(TEXDST, { recursive: true });
let fbx = 0, tex = 0;
for (const dir of MESH_DIRS) {
  const abs = join(PACK, dir);
  if (!existsSync(abs)) continue;
  for (const f of readdirSync(abs)) {
    if (extname(f).toLowerCase() === '.fbx') { cpSync(join(abs, f), join(DST, f)); fbx++; }
  }
}
// flatten every texture in the pack (recursive) into one dir
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (['.png', '.jpg', '.jpeg', '.tga'].includes(extname(f).toLowerCase())) {
      cpSync(p, join(TEXDST, basename(p)));
      tex++;
    }
  }
})(TEX_ROOT);
console.log(`copied ${fbx} FBX + ${tex} textures -> ${DST}`);
if (!fbx) process.exit(1);
```

- [ ] **Step 2: Extend the sink's accepted names**

In `scripts/anim-upload-server.mjs` replace the name check line:

```js
  if (req.method !== 'POST' || !/^(mocap|world)-[a-z]+\.glb$/.test(name)) {
```

and write world files into the right folder:

```js
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    const dir = name.startsWith('world-') ? 'public/assets/world' : 'public/assets/anims';
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${name}`, buf);
    console.log(`saved ${dir}/${name} (${(buf.length / 1024).toFixed(0)} KB)`);
    res.end('ok');
  });
```

(move the top-level `mkdirSync('public/assets/anims', ...)` into the handler as shown; add `mkdirSync` import already present.)

- [ ] **Step 3: Gitignore + run**

Append `tools/world-src/` to `.gitignore`.
Run: `node scripts/copy-world.mjs`
Expected: `copied ~30+ FBX + ~100+ textures -> tools/world-src` (exact counts printed).

- [ ] **Step 4: Commit**

```bash
git add scripts/copy-world.mjs scripts/anim-upload-server.mjs .gitignore
git commit -m "feat(world): NYC pack copy script + sink accepts world bakes"
```

---

### Task 2: World bake harness

**Files:**
- Create: `tools/worldbake.html`
- Create: `tools/worldbake.js`

**Interfaces:**
- Consumes: `tools/world-src/` (Task 1), sink on :5199.
- Produces: `public/assets/world/blacktop.glb` via the EXPORT button (Task 3 iterates the layout, Task 4 consumes the GLB). Layout table `LAYOUT` lives in `worldbake.js` — entries `{file, x, z, rotY?, targetH?, targetW?}`.

- [ ] **Step 1: Create the harness HTML**

```html
<!doctype html>
<!-- tools/worldbake.html — dev-only. npm run dev then
     http://localhost:5173/tools/worldbake.html
     Loads NYC pack FBX + textures, places them per LAYOUT, merges by material,
     previews with orbit, EXPORTs world-blacktop.glb to the sink (:5199). -->
<html>
<head>
  <meta charset="utf-8" />
  <title>SKK world bake</title>
  <style>
    body { margin: 0; background: #111; color: #eee; font: 13px monospace; }
    #ui { position: fixed; top: 0; left: 0; right: 0; padding: 8px; background: #000a; z-index: 2; }
    #ui button { margin: 2px; padding: 4px 8px; }
    #log { position: fixed; bottom: 0; left: 0; right: 0; max-height: 26vh; overflow: auto;
           background: #000c; padding: 6px; white-space: pre-wrap; z-index: 2; }
    canvas { display: block; }
  </style>
</head>
<body>
  <div id="ui"></div>
  <div id="log"></div>
  <script type="module" src="/tools/worldbake.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the harness script**

```js
// tools/worldbake.js — assemble the Blacktop's NYC surroundings offline.
// FBX -> normalize scale -> place per LAYOUT -> downscale textures -> merge
// geometry by material -> preview -> export ONE glb to the sink.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const logEl = document.getElementById('log');
const log = (...a) => { logEl.textContent += a.join(' ') + '\n'; logEl.scrollTop = logEl.scrollHeight; console.log(...a); };

// ---------- scene + dusk preview lighting ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2b3350');
scene.add(new THREE.HemisphereLight(0xffd9b0, 0x2e3a55, 0.75));
const sun = new THREE.DirectionalLight(0xffB070, 1.6);
sun.position.set(-40, 18, 30);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 800);
camera.position.set(0, 30, 90);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 8, -40);
// the field footprint for reference: fence ring at 42m + home plate marker
const ring = new THREE.Mesh(new THREE.TorusGeometry(42, 0.15, 6, 64), new THREE.MeshBasicMaterial({ color: '#3ec6b5' }));
ring.rotation.x = Math.PI / 2;
scene.add(ring);
scene.add(new THREE.GridHelper(160, 32, 0x334455, 0x223344));

// ---------- LAYOUT: what goes where (world coords; field center=origin,
// outfield toward -z, fence at r=42). rotY faces buildings toward the field. --
const B = (file, x, z, rotY = 0, targetH = 18) => ({ file, x, z, rotY, targetH });
const P = (file, x, z, rotY = 0, targetH = 1.4) => ({ file, x, z, rotY, targetH });
export const LAYOUT = [
  // back row: full buildings in an arc behind the outfield fence
  B('SM_Building_A.fbx', -38, -52, 0.55),
  B('SM_Building_B.fbx', -14, -58, 0.15),
  B('SM_Building_C.fbx', 12, -58, -0.1),
  B('SM_Building_D.fbx', 36, -52, -0.5),
  B('SM_Building_E.fbx', -58, -30, 1.05),
  B('SM_Building_F.fbx', 58, -30, -1.05),
  // second row peeking over the first (parallax depth)
  B('SM_Building_G_V1.fbx', -26, -76, 0.3, 24),
  B('SM_Building_E_V2.fbx', 24, -78, -0.2, 26),
  B('SM_Building_F_V2.fbx', 62, -60, -0.7, 22),
  B('SM_Building_A.fbx', -64, -58, 0.8, 22),
  // street props around the lot (outside the foul lines / behind the fence)
  P('SM_Dumpster_V1.fbx', -30, -38, 0.4, 1.5),
  P('SM_Dumpster_V2.fbx', 33, -36, -0.7, 1.5),
  P('SM_Fire_Hydrant.fbx', -14, 6, 0, 0.9),
  P('SM_Mailbox.fbx', 15, 5, -0.4, 1.3),
  P('SM_Cardboardboxes.fbx', -35, -20, 0.9, 1.0),
  P('SM_Barricade_Fence.fbx', 28, -20, 1.2, 1.1),
  P('SM_Big_BillBoard_A.fbx', 0, -66, 0, 12),
];

// ---------- load + place ----------
const manager = new THREE.LoadingManager();
manager.addHandler(/\.tga$/i, new TGALoader(manager));
const loader = new FBXLoader(manager);
loader.setResourcePath('/tools/world-src/textures/');

/** downscale any texture image to <=1024 so the export stays phone-sized */
function shrinkTexture(tex) {
  const img = tex.image;
  if (!img || !img.width || Math.max(img.width, img.height) <= 1024) return;
  const s = 1024 / Math.max(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  tex.image = c;
  tex.needsUpdate = true;
}

const placed = new THREE.Group();
scene.add(placed);
const fbxCache = new Map();

for (const item of LAYOUT) {
  let base = fbxCache.get(item.file);
  if (!base) {
    try {
      base = await loader.loadAsync('/tools/world-src/' + encodeURIComponent(item.file));
      fbxCache.set(item.file, base);
      log(`loaded ${item.file}`);
    } catch (e) { log(`SKIP ${item.file}: ${e.message ?? e}`); continue; }
  }
  const inst = base.clone(true);
  // normalize to the intended real-world height
  const box = new THREE.Box3().setFromObject(inst);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = item.targetH / (size.y || 1);
  inst.scale.setScalar(s);
  // sit on the ground
  const box2 = new THREE.Box3().setFromObject(inst);
  inst.position.set(item.x, -box2.min.y, item.z);
  inst.rotation.y = item.rotY;
  placed.add(inst);
}
placed.updateMatrixWorld(true);

// flat-shade fix + texture shrink + collect meshes
const byMaterial = new Map(); // material.uuid -> {material, geoms: []}
placed.traverse((o) => {
  if (!o.isMesh) return;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  for (const m of mats) {
    if (m.map) { shrinkTexture(m.map); m.map.colorSpace = THREE.SRGBColorSpace; }
    m.metalness = 0; m.roughness = 0.92;
  }
  // bake world transform into a clone of the geometry (per material group)
  if (Array.isArray(o.material)) return; // multi-material meshes stay unmerged (rare)
  const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
  const key = o.material.uuid;
  if (!byMaterial.has(key)) byMaterial.set(key, { material: o.material, geoms: [] });
  byMaterial.get(key).geoms.push(g);
});

log(`materials: ${byMaterial.size} (merged draw calls after bake)`);

// ---------- export ----------
function buildMerged() {
  const out = new THREE.Group();
  out.name = 'blacktop-world';
  for (const { material, geoms } of byMaterial.values()) {
    // normalize attribute sets so merge doesn't reject mixed geometries
    for (const g of geoms) { g.deleteAttribute('color'); g.deleteAttribute('uv2'); }
    const merged = BufferGeometryUtils.mergeGeometries(geoms, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
  }
  return out;
}

const ui = document.getElementById('ui');
const exp = document.createElement('button');
exp.textContent = 'EXPORT world-blacktop.glb'; exp.style.background = '#e63';
exp.onclick = () => {
  const merged = buildMerged();
  new GLTFExporter().parse(
    merged,
    async (buf) => {
      try {
        const r = await fetch('http://localhost:5199/save?name=world-blacktop.glb', { method: 'POST', body: buf });
        log(`saved world-blacktop.glb (${(buf.byteLength / 1048576).toFixed(1)} MB) -> ${await r.text()}`);
      } catch (e) { log('UPLOAD FAILED (is the sink running?):', e.message ?? e); }
    },
    (e) => log('EXPORT ERROR', e),
    { binary: true, maxTextureSize: 1024 },
  );
};
ui.appendChild(exp);

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
```

- [ ] **Step 3: Verify in a REAL browser (claude-in-chrome)**

Open `http://localhost:5173/tools/worldbake.html`. Expect: buildings arced behind
the teal fence ring, textured brick, props scattered, dusk-lit preview. Iterate
missing-texture issues here (log shows SKIPs; wrong texture names → check
`tools/world-src/textures/` for the actual filenames).

- [ ] **Step 4: Commit**

```bash
git add tools/worldbake.html tools/worldbake.js
git commit -m "feat(world): bake harness - layout, texture shrink, merge-by-material, export"
```

---

### Task 3: Layout iteration + export the world GLB

**Files:**
- Modify: `tools/worldbake.js` (LAYOUT tuning)
- Create: `public/assets/world/blacktop.glb` (committed)

- [ ] **Step 1: Iterate the LAYOUT by eye** — orbit the preview; buildings must
  clear the fence ring visually (no clipping into the field), the back rows
  should overlap for parallax, props must not sit inside the playable diamond.
  Screenshot from home-plate height (camera ~(0, 3, 8) looking at (0, 4, -40))
  to judge the actual in-game silhouette.
- [ ] **Step 2: EXPORT** — click the button; sink logs the MB size. If > 25MB,
  drop duplicate building instances or reduce `maxTextureSize` to 512 and re-export.
- [ ] **Step 3: Commit**

```bash
git add public/assets/world/blacktop.glb
git commit -m "feat(world): baked Blacktop NYC world (merged, <=1024 textures)"
```

---

### Task 4: Runtime integration + dusk lighting

**Files:**
- Create: `src/game/world/blacktop.js`
- Modify: `src/game/field.js` (backdrop swap + lighting branch)
- Modify: `src/data/fields.json` (blacktop: `"world3d": true`)
- Test: `tests/worldConfig.test.js`

**Interfaces:**
- Consumes: `public/assets/world/blacktop.glb` (Task 3).
- Produces: `loadBlacktopWorld() -> Promise<THREE.Group>` and `duskLighting()` from `src/game/world/blacktop.js`; `field.js` calls them when `fieldData.world3d`.

- [ ] **Step 1: Write the failing test**

```js
// tests/worldConfig.test.js
import { describe, it, expect } from 'vitest';
import fields from '../src/data/fields.json';
import { duskLighting } from '../src/game/world/blacktop.js';

describe('3d world config', () => {
  it('the blacktop field opts into the 3d world', () => {
    const blacktop = fields.fields.find((f) => f.id === 'blacktop');
    expect(blacktop.world3d).toBe(true);
  });
  it('dusk lighting spec is warm-sun + cool-fill (brand palette)', () => {
    const d = duskLighting();
    expect(d.sun.color).toBe('#ffb070');
    expect(d.sun.intensity).toBeGreaterThan(0.8);
    expect(d.hemi.sky).toBe('#ffd9b0');
    expect(d.sky.top).toBe('#2b3350');
    expect(d.sky.horizon).toBe('#ff9d5c');
  });
});
```

NOTE: verify the field id/key names against `src/data/fields.json` first (the
starter field may be `the-blacktop` or similar — match the real id, and adjust
the fields array accessor to the file's actual shape).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/worldConfig.test.js`
Expected: FAIL — module missing / flag absent.

- [ ] **Step 3: Implement the world module**

```js
// src/game/world/blacktop.js — the Blacktop's true-3D NYC surroundings.
// Loads the offline-baked, pre-merged world GLB (a handful of draw calls) and
// provides the dusk lighting spec. Fail-safe by design: callers keep the
// legacy backdrop until the world actually loads.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let worldPromise = null;
/** resolves to a ready-to-add Group; rejects if the GLB is missing/broken */
export function loadBlacktopWorld(url = '/assets/world/blacktop.glb') {
  if (!worldPromise) {
    worldPromise = new GLTFLoader().loadAsync(url).then((g) => {
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;   // static set dressing: skip the shadow pass
          o.receiveShadow = false;
          o.matrixAutoUpdate = false;
        }
      });
      return g.scene;
    }).catch((e) => { worldPromise = null; throw e; });
  }
  return worldPromise;
}

/** golden-hour palette (brand orange/teal) the field applies with the world */
export function duskLighting() {
  return {
    sun: { color: '#ffb070', intensity: 1.35, position: [-38, 16, 26] },
    hemi: { sky: '#ffd9b0', ground: '#2e3a55', intensity: 0.6 },
    sky: { top: '#2b3350', horizon: '#ff9d5c' },
  };
}
```

- [ ] **Step 4: Integrate in field.js**

In `buildField`, inside the backdrop section, ADD (do not remove the existing
backdrop construction — it IS the fallback):

```js
  // TRUE 3D WORLD (hero field): loads async; on success the flat backdrop +
  // skyline swap out for real geometry. On failure nothing changes.
  if (fieldData.world3d) {
    import('./world/blacktop.js').then(async ({ loadBlacktopWorld, duskLighting }) => {
      const world = await loadBlacktopWorld();
      root.add(world);
      if (handles.backdrop) { handles.backdrop.visible = false; }
      if (handles.skyline) { handles.skyline.visible = false; }
      // dusk relight: warm low sun + cool fill, dusk sky dome
      const d = duskLighting();
      if (handles.sun) {
        handles.sun.color.set(d.sun.color);
        handles.sun.intensity = d.sun.intensity;
        handles.sun.position.set(...d.sun.position);
      }
      if (handles.hemi) {
        handles.hemi.color.set(d.hemi.sky);
        handles.hemi.groundColor.set(d.hemi.ground);
        handles.hemi.intensity = d.hemi.intensity;
      }
      if (handles.setSkyGradient) handles.setSkyGradient(d.sky.top, d.sky.horizon);
    }).catch((e) => console.warn('[skk] 3d world unavailable, keeping backdrop:', e));
  }
```

PREREQ inside field.js (check what already exists, add what doesn't):
- `handles.sun` / `handles.hemi` — expose the existing directional + hemisphere
  lights on `handles` where they're created in the lighting section.
- `handles.setSkyGradient(top, horizon)` — a helper that regenerates the sky
  dome canvas texture with the two colors (mirror the existing sky-texture
  code path; if the current sky is a static texture, redraw its canvas).

- [ ] **Step 5: Flag the field**

In `src/data/fields.json`, add `"world3d": true` to the blacktop entry (match
the actual id).

- [ ] **Step 6: Run tests + build; REAL-PLAY verify**

`npx vitest run && npm run build` → green.
Real play `?match`: brick buildings with rooftop water towers/AC past the fence
where the flat image used to be, parallax when the telephoto tracker moves,
dusk sun + warm sky, props visible around the lot. Kill-switch check: rename
the GLB temporarily → game still shows the old backdrop (then restore).
Check `renderer.info.render.calls` in the console during a pitch: total scene
should stay < ~140.

- [ ] **Step 7: Commit**

```bash
git add src/game/world/blacktop.js src/game/field.js src/data/fields.json tests/worldConfig.test.js
git commit -m "feat(world): Blacktop loads the real NYC block + dusk lighting (backdrop fallback)"
```

---

### Task 5: Perf audit + ship

- [ ] **Step 1:** Draw calls + FPS: with the world loaded, log `renderer.info.render.calls`
  and watch a few plays; verify no hitching on camera cuts. If calls jumped > ~160,
  reduce LAYOUT instances and re-export.
- [ ] **Step 2:** Payload: `Get-Item public/assets/world/blacktop.glb` ≤ 25MB.
- [ ] **Step 3:** Full suite + build + a complete real-play half-inning both roles.
- [ ] **Step 4:** PR + merge (auto-push authorized) + confirm Vercel `success` + tell the dev to reopen the app.

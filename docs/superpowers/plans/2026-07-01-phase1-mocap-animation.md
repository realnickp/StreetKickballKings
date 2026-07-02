# Phase 1 — Mocap Animation Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-coded `GlbCodeAnimator` joint rotations with real Mixamo motion-capture clips retargeted onto the 6 Meshy archetype characters, with crossfade blending.

**Architecture:** A browser-based retarget harness (`tools/retarget.html`, Vite dev-served) loads the 17 Mixamo FBX clips + one archetype GLB, retargets every clip onto the shared Meshy skeleton via `SkeletonUtils.retargetClip`, and exports ONE animation-only `public/assets/anims/mocap.glb`. At runtime a new `MocapAnimator` (THREE.AnimationMixer + crossfades) drives all characters with the same public surface as the old animator, so `matchScene.js` changes are minimal and targeted. The old code animator stays behind `?codeanim=1` as a fallback.

**Tech Stack:** Three.js r0.184 (`FBXLoader`, `GLTFLoader`, `GLTFExporter`, `SkeletonUtils`, `AnimationMixer`), Vite dev server, Vitest, Node ≥ 20.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-01-graphics-overhaul-design.md` — Phase 1 only.
- Source FBX live at `C:\Unity Projects\KickballGame\Assets\GangsPack01\Animations\` — NEVER modify that directory; copy into the repo.
- Kick clip = `Strike Foward Jog.fbx` (filename IS misspelled "Foward" — do not "fix" it when referencing).
- Every new loader path must degrade gracefully — a missing/broken `mocap.glb` falls back to `GlbCodeAnimator`, never a blank screen.
- The `MocapAnimator` public surface MUST match the old one: `play(name, {onContact, onDone, speedFactor, speed})`, `update(dt)`, `ctx.speedFactor`, `name`.
- Visual claims are verified by REAL browser play (claude-in-chrome). Headless Chrome renders the WebGL scene black — never use it for visual verification.
- Do not commit `tools/anims-src/` (raw FBX). DO commit `public/assets/anims/mocap.glb`.
- All existing 76 Vitest tests must keep passing; `npm run build` must stay clean.
- Branch: `feat/graphics-overhaul`. Do NOT merge/push to main — deploys are dev-authorized ("push") only.

---

### Task 1: Animation manifest + FBX copy script

**Files:**
- Create: `scripts/copy-anims.mjs`
- Create: `src/data/anims.manifest.json`
- Modify: `.gitignore`
- Test: `tests/animsManifest.test.js`

**Interfaces:**
- Produces: `src/data/anims.manifest.json` — array of `{file, name, loop, contactAt?, trim?, rate?}` consumed by Task 2 (harness reads `file`+`name`) and Task 4 (`MocapAnimator` reads `name`/`loop`/`contactAt`/`rate`).
- Produces: `tools/anims-src/*.fbx` (local only, gitignored) consumed by Task 2.

- [ ] **Step 1: Write the failing test**

```js
// tests/animsManifest.test.js
import { describe, it, expect } from 'vitest';
import manifest from '../src/data/anims.manifest.json';

// Every animation name the game asks for must exist in the manifest.
const REQUIRED = [
  'idle', 'plate', 'crouch', 'holdball', 'run', 'strafeL', 'strafeR',
  'kick', 'throw', 'pitch', 'catch', 'slide', 'juke', 'stumble',
  'walk', 'swagger', 'dance1', 'dance2', 'dance3', 'dance4', 'dejected',
];

describe('anims manifest', () => {
  it('covers every game animation name', () => {
    const names = manifest.map((m) => m.name);
    for (const n of REQUIRED) expect(names, `missing ${n}`).toContain(n);
  });
  it('entries are well-formed', () => {
    for (const m of manifest) {
      expect(typeof m.file).toBe('string');
      expect(m.file.endsWith('.fbx')).toBe(true);
      expect(typeof m.name).toBe('string');
      expect(typeof m.loop).toBe('boolean');
      if (m.contactAt != null) { expect(m.contactAt).toBeGreaterThan(0); expect(m.contactAt).toBeLessThan(1); }
      if (m.trim != null) { expect(m.trim.length).toBe(2); expect(m.trim[0]).toBeLessThan(m.trim[1]); }
      if (m.rate != null) expect(m.rate).toBeGreaterThan(0);
    }
  });
  it('one-shots that drive gameplay have contact marks', () => {
    for (const n of ['kick', 'throw', 'pitch']) {
      const m = manifest.find((x) => x.name === n);
      expect(m.loop).toBe(false);
      expect(m.contactAt, `${n} needs contactAt`).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/animsManifest.test.js`
Expected: FAIL — cannot resolve `../src/data/anims.manifest.json`.

- [ ] **Step 3: Create the manifest**

`contactAt`/`trim` values below are informed first guesses — Task 3 refines them by eye in the harness and re-saves this file. A clip may appear under several game names (different `rate`/`trim`).

```json
[
  { "file": "Idle.fbx",                "name": "idle",     "loop": true },
  { "file": "Idle.fbx",                "name": "plate",    "loop": true,  "rate": 0.9 },
  { "file": "Goalkeeper Idle.fbx",     "name": "crouch",   "loop": true },
  { "file": "Goalkeeper Idle.fbx",     "name": "holdball", "loop": true },
  { "file": "Running.fbx",             "name": "run",      "loop": true },
  { "file": "Jog Strafe Left.fbx",     "name": "strafeL",  "loop": true },
  { "file": "Jog Strafe Right.fbx",    "name": "strafeR",  "loop": true },
  { "file": "Strike Foward Jog.fbx",   "name": "kick",     "loop": false, "contactAt": 0.5 },
  { "file": "Throwing.fbx",            "name": "throw",    "loop": false, "contactAt": 0.45 },
  { "file": "Goalie Throw.fbx",        "name": "pitch",    "loop": false, "contactAt": 0.5 },
  { "file": "Baseball Catcher.fbx",    "name": "catch",    "loop": false },
  { "file": "Running Slide.fbx",       "name": "slide",    "loop": false },
  { "file": "Left Strafe.fbx",         "name": "juke",     "loop": false },
  { "file": "Defeated.fbx",            "name": "stumble",  "loop": false, "trim": [0, 1.4] },
  { "file": "Walking.fbx",             "name": "walk",     "loop": true },
  { "file": "SwaggerWalk.fbx",         "name": "swagger",  "loop": true },
  { "file": "Hip Hop Dancing.fbx",     "name": "dance1",   "loop": true },
  { "file": "Hip Hop Dancing (1).fbx", "name": "dance2",   "loop": true },
  { "file": "Victory.fbx",             "name": "dance3",   "loop": true },
  { "file": "Hip Hop Dancing.fbx",     "name": "dance4",   "loop": true,  "rate": 1.25 },
  { "file": "Defeated.fbx",            "name": "dejected", "loop": false }
]
```

- [ ] **Step 4: Write the copy script**

```js
// scripts/copy-anims.mjs — copy the 17 Mixamo FBX from the Unity project into
// tools/anims-src/ (gitignored) so the Vite dev server can serve them to the
// retarget harness. Run once per machine: node scripts/copy-anims.mjs
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'C:/Unity Projects/KickballGame/Assets/GangsPack01/Animations';
const DST = 'tools/anims-src';
const FILES = [
  'Idle.fbx', 'Goalkeeper Idle.fbx', 'Running.fbx',
  'Jog Strafe Left.fbx', 'Jog Strafe Right.fbx', 'Strike Foward Jog.fbx',
  'Throwing.fbx', 'Goalie Throw.fbx', 'Baseball Catcher.fbx',
  'Running Slide.fbx', 'Left Strafe.fbx', 'Defeated.fbx',
  'Walking.fbx', 'SwaggerWalk.fbx',
  'Hip Hop Dancing.fbx', 'Hip Hop Dancing (1).fbx', 'Victory.fbx',
];

mkdirSync(DST, { recursive: true });
let ok = 0;
for (const f of FILES) {
  const src = join(SRC, f);
  if (!existsSync(src)) { console.error(`MISSING: ${src}`); continue; }
  cpSync(src, join(DST, f));
  ok++;
}
console.log(`copied ${ok}/${FILES.length} clips -> ${DST}`);
if (ok !== FILES.length) process.exit(1);
```

- [ ] **Step 5: Add to .gitignore**

Append to `.gitignore`:

```
tools/anims-src/
```

- [ ] **Step 6: Run the copy script + tests**

Run: `node scripts/copy-anims.mjs`
Expected: `copied 17/17 clips -> tools/anims-src`

Run: `npx vitest run tests/animsManifest.test.js`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add scripts/copy-anims.mjs src/data/anims.manifest.json .gitignore tests/animsManifest.test.js
git commit -m "feat(anim): mocap clip manifest + FBX copy script"
```

---

### Task 2: Retarget harness page

**Files:**
- Create: `tools/retarget.html`
- Create: `tools/retarget.js`

**Interfaces:**
- Consumes: `src/data/anims.manifest.json` (Task 1), `tools/anims-src/*.fbx` (Task 1), `public/assets/models/archetypes/arch-locs.glb` (existing).
- Produces: a downloaded `mocap.glb` (Task 3 saves it to `public/assets/anims/mocap.glb`). Also on-screen bone-name dump used to verify `MESHY_TO_MIXAMO` below.

No Vitest here — this is a dev tool whose output is verified by eye in Task 3.

- [ ] **Step 1: Create the harness HTML**

```html
<!doctype html>
<!-- tools/retarget.html — dev-only. Open via `npm run dev` then
     http://localhost:5173/tools/retarget.html
     Loads all manifest clips, retargets onto the Meshy archetype skeleton,
     previews each clip (buttons), exports animation-only mocap.glb. -->
<html>
<head>
  <meta charset="utf-8" />
  <title>SKK retarget harness</title>
  <style>
    body { margin: 0; background: #111; color: #eee; font: 13px monospace; }
    #ui { position: fixed; top: 0; left: 0; right: 0; padding: 8px; background: #000a; z-index: 2; }
    #ui button { margin: 2px; padding: 4px 8px; }
    #log { position: fixed; bottom: 0; left: 0; right: 0; max-height: 30vh; overflow: auto;
           background: #000c; padding: 6px; white-space: pre-wrap; z-index: 2; }
    canvas { display: block; }
  </style>
</head>
<body>
  <div id="ui"></div>
  <div id="log"></div>
  <script type="module" src="/tools/retarget.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the harness script**

NOTE for implementer: before writing the bone map, READ
`node_modules/three/examples/jsm/utils/SkeletonUtils.js` — verify the exact
`retargetClip(target, source, clip, options)` option names in r184
(`hip`, `names`, `scale`, `getBoneName`, etc.) and adapt the call below to what
the installed source actually accepts. The `names` map direction (target→source
vs source→target) has flipped between releases — the source file is the truth.

```js
// tools/retarget.js
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import manifest from '../src/data/anims.manifest.json';

const logEl = document.getElementById('log');
const log = (...a) => { logEl.textContent += a.join(' ') + '\n'; console.log(...a); };

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#223');
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(3, 6, 4); scene.add(sun);
scene.add(new THREE.GridHelper(10, 20, 0x445566, 0x334455));
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 1.6, 3.2); camera.lookAt(0, 1.0, 0);

// ---------- target rig (Meshy archetype) ----------
const gltf = await new GLTFLoader().loadAsync('/assets/models/archetypes/arch-locs.glb');
const target = gltf.scene;
// normalize to ~2m so we can SEE it (Meshy native is ~0.0185 tall)
const box = new THREE.Box3().setFromObject(target);
const size = new THREE.Vector3(); box.getSize(size);
const wrapper = new THREE.Group();
wrapper.scale.setScalar(2.0 / (size.y || 1));
wrapper.add(target);
scene.add(wrapper);
let targetSkin = null;
target.traverse((o) => { if (o.isSkinnedMesh && !targetSkin) targetSkin = o; });

// dump the REAL bone names — verify MIXAMO_TO_MESHY against this list
log('--- target bones ---');
target.traverse((o) => { if (o.isBone) log('  ', o.name); });

// Meshy standard rig -> Mixamo source bone names. VERIFY each left-hand name
// against the dump above; fix any that differ before exporting.
const MESHY_TO_MIXAMO = {
  Hips: 'mixamorig:Hips',
  Spine: 'mixamorig:Spine',
  Spine01: 'mixamorig:Spine1',
  Spine02: 'mixamorig:Spine2',
  Neck: 'mixamorig:Neck',
  Head: 'mixamorig:Head',
  LeftShoulder: 'mixamorig:LeftShoulder',
  LeftArm: 'mixamorig:LeftArm',
  LeftForeArm: 'mixamorig:LeftForeArm',
  LeftHand: 'mixamorig:LeftHand',
  RightShoulder: 'mixamorig:RightShoulder',
  RightArm: 'mixamorig:RightArm',
  RightForeArm: 'mixamorig:RightForeArm',
  RightHand: 'mixamorig:RightHand',
  LeftUpLeg: 'mixamorig:LeftUpLeg',
  LeftLeg: 'mixamorig:LeftLeg',
  LeftFoot: 'mixamorig:LeftFoot',
  LeftToeBase: 'mixamorig:LeftToeBase',
  RightUpLeg: 'mixamorig:RightUpLeg',
  RightLeg: 'mixamorig:RightLeg',
  RightFoot: 'mixamorig:RightFoot',
  RightToeBase: 'mixamorig:RightToeBase',
};

// ---------- retarget every manifest clip ----------
const fbxLoader = new FBXLoader();
const clips = [];           // retargeted, renamed to manifest name
const fileCache = new Map(); // file -> {source, clip}

for (const entry of manifest) {
  let src = fileCache.get(entry.file);
  if (!src) {
    const fbx = await fbxLoader.loadAsync('/tools/anims-src/' + encodeURIComponent(entry.file));
    src = { source: fbx, clip: fbx.animations[0] };
    fileCache.set(entry.file, src);
    log(`loaded ${entry.file}: ${src.clip.duration.toFixed(2)}s, ${src.clip.tracks.length} tracks`);
  }
  let clip = src.clip;
  if (entry.trim) clip = THREE.AnimationUtils.subclip(clip, entry.name, Math.round(entry.trim[0] * 30), Math.round(entry.trim[1] * 30), 30);
  const retargeted = SkeletonUtils.retargetClip(targetSkin, src.source, clip, {
    hip: 'mixamorig:Hips',
    names: MESHY_TO_MIXAMO,
    // scale hip translation from Mixamo cm-world to the tiny Meshy rig space —
    // ratio of rig heights; verify visually (character must not float or sink).
    scale: size.y / 180,
  });
  retargeted.name = entry.name;
  clips.push(retargeted);
  log(`retargeted -> ${entry.name}`);
}

// ---------- preview ----------
const mixer = new THREE.AnimationMixer(target);
let active = null;
function play(name) {
  const clip = clips.find((c) => c.name === name);
  const entry = manifest.find((m) => m.name === name);
  const action = mixer.clipAction(clip);
  action.reset();
  action.timeScale = entry.rate ?? 1;
  action.setLoop(entry.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = true;
  if (active) active.crossFadeTo(action, 0.15, false);
  action.play();
  active = action;
  document.title = `retarget: ${name}`;
}

const ui = document.getElementById('ui');
for (const m of manifest) {
  const b = document.createElement('button');
  b.textContent = m.name; b.onclick = () => play(m.name);
  ui.appendChild(b);
}
const slow = document.createElement('button');
slow.textContent = 'SLOW x0.25'; let slowOn = false;
slow.onclick = () => { slowOn = !slowOn; slow.textContent = slowOn ? 'SPEED x1' : 'SLOW x0.25'; };
ui.appendChild(slow);

// ---------- export ----------
const exp = document.createElement('button');
exp.textContent = 'EXPORT mocap.glb'; exp.style.background = '#e63';
exp.onclick = () => {
  // export ONLY the bone hierarchy + clips (animation-only GLB, no mesh/textures)
  const hips = target.getObjectByProperty('isBone', true);
  const exportRoot = new THREE.Group();
  exportRoot.name = 'mocap-rig';
  exportRoot.add(SkeletonUtils.clone(hips.parent ?? hips));
  new GLTFExporter().parse(
    exportRoot,
    (buf) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
      a.download = 'mocap.glb'; a.click();
      log(`exported mocap.glb (${(buf.byteLength / 1024).toFixed(0)} KB)`);
    },
    (e) => log('EXPORT ERROR', e),
    { binary: true, animations: clips },
  );
};
ui.appendChild(exp);

// ---------- loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  mixer.update(clock.getDelta() * (slowOn ? 0.25 : 1));
  renderer.render(scene, camera);
});
play('idle');
```

- [ ] **Step 3: Verify the harness loads (REAL browser, claude-in-chrome)**

Run: `npm run dev` (background), then open `http://localhost:5173/tools/retarget.html`
in a real Chrome tab via claude-in-chrome. Screenshot it.
Expected: the archetype model standing on a grid, clip buttons across the top,
the bone-name dump in the log panel, `idle` playing.
If bones in the dump differ from `MESHY_TO_MIXAMO` keys → fix the map now.
If the character is mangled (limbs folded/exploded) → fix the retarget options
against the r184 `SkeletonUtils.js` source before proceeding.

- [ ] **Step 4: Commit**

```bash
git add tools/retarget.html tools/retarget.js
git commit -m "feat(anim): browser retarget harness (FBX -> Meshy rig -> mocap.glb)"
```

---

### Task 3: Generate + eyeball-verify mocap.glb

**Files:**
- Create: `public/assets/anims/mocap.glb` (harness output, committed)
- Modify: `src/data/anims.manifest.json` (contact marks / trims refined by eye)

**Interfaces:**
- Consumes: Task 2 harness.
- Produces: `public/assets/anims/mocap.glb` — animation-only GLB whose clips are named by manifest `name`; consumed by Task 4's `loadMocapClips()`.

- [ ] **Step 1: Eyeball every clip in the harness (claude-in-chrome, screenshots)**

Click through ALL 21 buttons. For each, screenshot mid-motion and check:
- limbs move naturally (no folding, no twist-through, no T-pose freeze)
- feet stay near the ground (hip-scale correct — not floating/sunk)
- `kick`: the RIGHT leg swings through a believable kick
- `strafeL`/`strafeR`: lateral steps in mirrored directions
- `holdball`/`crouch`: reads as an alert ready stance
Fix `MESHY_TO_MIXAMO` / retarget options / `trim` values until all pass.

- [ ] **Step 2: Mark contact frames by eye**

Play `kick`, `throw`, `pitch` with SLOW x0.25. Note the normalized time where the
foot/hand would meet the ball (fraction of clip duration, e.g. contact at 0.62s of
a 1.3s clip → 0.48). Update `contactAt` in `src/data/anims.manifest.json`.

- [ ] **Step 3: Export + install the asset**

Click EXPORT mocap.glb → save the download to `public/assets/anims/mocap.glb`.
Run: `npx vitest run tests/animsManifest.test.js`
Expected: PASS (manifest still well-formed after edits).

- [ ] **Step 4: Sanity-check the exported file re-imports**

Add (temporarily, in the browser dev console on the harness page — no code change):
loading `/assets/anims/mocap.glb` with GLTFLoader and logging
`gltf.animations.map(a => a.name)`.
Expected: all 21 manifest names present. If export dropped clips, fix the
export-root cloning in `tools/retarget.js` (tracks must resolve inside the
exported bone hierarchy).

- [ ] **Step 5: Commit**

```bash
git add public/assets/anims/mocap.glb src/data/anims.manifest.json
git commit -m "feat(anim): retargeted mocap.glb (21 clips) + eyeballed contact marks"
```

---

### Task 4: MocapAnimator module

**Files:**
- Create: `src/game/mocapAnimator.js`
- Test: `tests/mocapAnimator.test.js`

**Interfaces:**
- Consumes: `src/data/anims.manifest.json` (Task 1); clips (as `THREE.AnimationClip[]`) — injected in tests, loaded from `mocap.glb` in production via `loadMocapClips`.
- Produces:
  - `class MocapAnimator { constructor(root, clips); play(name, {onContact, onDone, speedFactor, speed}); update(dt); ctx: {speedFactor}; name }` — drop-in surface match for `GlbCodeAnimator`.
  - `async function loadMocapClips(url = '/assets/anims/mocap.glb')` → `AnimationClip[]` (module-cached, one fetch total).

- [ ] **Step 1: Write the failing tests**

```js
// tests/mocapAnimator.test.js
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { MocapAnimator } from '../src/game/mocapAnimator.js';

// Build a minimal rig + synthetic clips so tests need no GLB/network.
function makeRig() {
  const root = new THREE.Group();
  const hips = new THREE.Bone(); hips.name = 'Hips';
  root.add(hips);
  return root;
}
function makeClip(name, dur = 1) {
  const track = new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, dur], [0, 0, 0, 1, 0, 0, 0.383, 0.924]);
  return new THREE.AnimationClip(name, dur, [track]);
}
const CLIP_NAMES = ['idle', 'plate', 'run', 'kick', 'throw', 'pitch', 'catch',
  'crouch', 'holdball', 'strafeL', 'strafeR', 'juke', 'slide', 'stumble',
  'walk', 'swagger', 'dance1', 'dance2', 'dance3', 'dance4', 'dejected'];
const clips = CLIP_NAMES.map((n) => makeClip(n));

describe('MocapAnimator', () => {
  it('exposes the GlbCodeAnimator surface', () => {
    const a = new MocapAnimator(makeRig(), clips);
    expect(typeof a.play).toBe('function');
    expect(typeof a.update).toBe('function');
    expect(a.ctx).toHaveProperty('speedFactor');
    expect(a.name).toBe('idle');
  });

  it('play() switches the reported name; unknown names fall back to idle', () => {
    const a = new MocapAnimator(makeRig(), clips);
    a.play('run');
    expect(a.name).toBe('run');
    a.play('nope-not-a-clip');
    expect(a.name).toBe('idle');
  });

  it('fires onContact at the manifest contactAt fraction, once', () => {
    const a = new MocapAnimator(makeRig(), clips);
    const onContact = vi.fn();
    a.play('kick', { onContact });           // kick contactAt from manifest
    a.update(0.05);
    expect(onContact).not.toHaveBeenCalled(); // way before contact
    for (let i = 0; i < 40; i++) a.update(0.05); // run past the end
    expect(onContact).toHaveBeenCalledTimes(1);
  });

  it('fires onDone exactly once when a one-shot finishes', () => {
    const a = new MocapAnimator(makeRig(), clips);
    const onDone = vi.fn();
    a.play('throw', { onDone });
    for (let i = 0; i < 60; i++) a.update(0.05);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('speedFactor scales looping clips only', () => {
    const a = new MocapAnimator(makeRig(), clips);
    a.play('run', { speedFactor: 2 });
    expect(a._active.timeScale).toBeCloseTo(2);
    a.play('kick', { speedFactor: 2 });      // one-shot: plays at base rate
    expect(a._active.timeScale).toBeCloseTo(1);
  });

  it('live speedFactor changes via ctx are picked up on update (run cycle)', () => {
    const a = new MocapAnimator(makeRig(), clips);
    a.play('run', { speedFactor: 1 });
    a.ctx.speedFactor = 1.8;
    a.update(0.016);
    expect(a._active.timeScale).toBeCloseTo(1.8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mocapAnimator.test.js`
Expected: FAIL — `MocapAnimator` not exported / module missing.

- [ ] **Step 3: Implement**

```js
// src/game/mocapAnimator.js — real mocap playback via THREE.AnimationMixer.
// Drop-in surface match for GlbCodeAnimator: play(name,{onContact,onDone,
// speedFactor,speed}), update(dt), ctx.speedFactor, name. Crossfade blending
// between states; loops follow ctx.speedFactor live (run cycle); one-shots
// fire onContact at the manifest-marked frame and onDone at the end.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import manifest from '../data/anims.manifest.json';

const FADE_S = 0.15;
const META = new Map(manifest.map((m) => [m.name, m]));

let clipsPromise = null;
/** Fetch + cache the shared animation set (one download for all characters). */
export function loadMocapClips(url = '/assets/anims/mocap.glb') {
  if (!clipsPromise) {
    clipsPromise = new GLTFLoader().loadAsync(url)
      .then((g) => g.animations)
      .catch((e) => { clipsPromise = null; throw e; });
  }
  return clipsPromise;
}

export class MocapAnimator {
  /** @param {THREE.Object3D} root character root containing the bone hierarchy
   *  @param {THREE.AnimationClip[]} clips retargeted clips named per the manifest */
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = new Map(clips.map((c) => [c.name, c]));
    this.ctx = { speedFactor: 1 };
    this.name = 'idle';
    this._active = null;
    this._meta = null;
    this._speed = 1;
    this.onContact = null; this.onDone = null;
    this._contactFired = false; this._doneFired = false;
    this._mixerFinished = () => {
      if (!this._doneFired) {
        this._doneFired = true;
        const d = this.onDone; this.onDone = null; d?.();
      }
    };
    this.mixer.addEventListener('finished', this._mixerFinished);
    if (this.clips.has('idle')) this.play('idle');
  }

  play(name, { onContact = null, onDone = null, speedFactor = 1, speed = 1 } = {}) {
    if (!this.clips.has(name)) name = 'idle';
    const clip = this.clips.get(name);
    if (!clip) return;
    const meta = META.get(name) ?? { loop: true };
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.enabled = true;
    action.setLoop(meta.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true; // hold the final pose until the next play()
    const base = (meta.rate ?? 1) * speed;
    action.timeScale = meta.loop ? base * Math.max(0.35, speedFactor) : base;
    if (this._active && this._active !== action) {
      this._active.crossFadeTo(action, FADE_S, false);
    }
    action.play();
    this._active = action;
    this._meta = meta;
    this._speed = base;
    this.name = name;
    this.ctx.speedFactor = speedFactor;
    this.onContact = onContact; this.onDone = onDone;
    this._contactFired = false; this._doneFired = false;
  }

  update(dt) {
    // loops track ctx.speedFactor live — matchScene writes it every frame for runs
    if (this._active && this._meta?.loop) {
      this._active.timeScale = this._speed * Math.max(0.35, this.ctx.speedFactor);
    }
    this.mixer.update(dt);
    if (this._active && !this._contactFired && this._meta?.contactAt != null) {
      const clip = this._active.getClip();
      if (this._active.time / clip.duration >= this._meta.contactAt) {
        this._contactFired = true;
        this.onContact?.();
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/mocapAnimator.test.js`
Expected: PASS (6 tests). If the `finished` event doesn't fire in the node env,
check that `update(dt)` is advancing action time past the clip duration
(LoopOnce + clampWhenFinished still emits `finished`).

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: all tests pass (76 existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/game/mocapAnimator.js tests/mocapAnimator.test.js
git commit -m "feat(anim): MocapAnimator — AnimationMixer playback with crossfades, contact events"
```

---

### Task 5: Wire MocapAnimator into character building (with fallback)

**Files:**
- Modify: `src/game/glbCharacters.js` (buildGlbCharacter ~line 275-325, buildTeamCharsGlb ~line 346)
- Test: `tests/glbAnimatorChoice.test.js`

**Interfaces:**
- Consumes: `MocapAnimator`, `loadMocapClips` (Task 4); `public/assets/anims/mocap.glb` (Task 3).
- Produces: `buildGlbCharacter(def, {heightM, clips})` — when `clips` is non-null the character gets a `MocapAnimator`, else the legacy `GlbCodeAnimator`. `chooseAnimator({clips, forceCode})` exported for tests. `buildTeamCharsGlb` loads clips once (null on failure / `?codeanim=1`).

- [ ] **Step 1: Write the failing test**

```js
// tests/glbAnimatorChoice.test.js
import { describe, it, expect } from 'vitest';
import { chooseAnimator } from '../src/game/glbCharacters.js';

describe('animator selection', () => {
  it('uses mocap when clips are available', () => {
    expect(chooseAnimator({ clips: [{}], forceCode: false })).toBe('mocap');
  });
  it('falls back to code animator when clips failed to load', () => {
    expect(chooseAnimator({ clips: null, forceCode: false })).toBe('code');
  });
  it('?codeanim=1 forces the code animator even with clips', () => {
    expect(chooseAnimator({ clips: [{}], forceCode: true })).toBe('code');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/glbAnimatorChoice.test.js`
Expected: FAIL — `chooseAnimator` is not exported.

- [ ] **Step 3: Implement the integration**

In `src/game/glbCharacters.js`:

Add imports at the top:

```js
import { MocapAnimator, loadMocapClips } from './mocapAnimator.js';
```

Add the pure selector (above `buildGlbCharacter`):

```js
/** Which animator a character gets. Pure — unit-tested. */
export function chooseAnimator({ clips, forceCode }) {
  return clips && !forceCode ? 'mocap' : 'code';
}
```

Change `buildGlbCharacter(def, { heightM = 2.05 } = {})` signature and its return:

```js
export async function buildGlbCharacter(def, { heightM = 2.05, clips = null } = {}) {
  // ... existing body unchanged until the return ...
  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });

  const which = chooseAnimator({ clips, forceCode: def.forceCode ?? false });
  const animator = which === 'mocap'
    ? new MocapAnimator(root, clips)
    : new GlbCodeAnimator(bones);
  return { group, animator };
}
```

Change `buildTeamCharsGlb` to load the shared clips once (crash-safe):

```js
export async function buildTeamCharsGlb(team, uniformColor) {
  const roster = team.roster ?? [];
  const primary = uniformColor ?? team.colors?.primary;
  const forceCode = new URLSearchParams(location.search).has('codeanim');
  let clips = null;
  if (!forceCode) {
    try { clips = await loadMocapClips(); }
    catch (e) { console.warn('[skk] mocap.glb unavailable, using code animator:', e); }
  }
  const out = [];
  for (let i = 0; i < roster.length; i++) {
    const p = roster[i];
    const archIdx = (p.archetype ?? i) % ARCHETYPES.length;
    let char;
    try {
      char = await buildGlbCharacter({ model: ARCHETYPES[archIdx], teamColor: primary }, { heightM: 2.05, clips });
    } catch {
      char = await buildGlbCharacter({ model: FALLBACK_MODEL }, { heightM: 2.05, clips });
    }
    char.data = p;
    char.number = p.number ?? JERSEY_NUMBERS[i % JERSEY_NUMBERS.length];
    char.gender = FEMALE_ARCHETYPES.has(archIdx) ? 'she' : 'he';
    char.hasBall = false;
    out.push(char);
  }
  return out;
}
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run`
Expected: all pass.
Run: `npm run build`
Expected: clean build.

- [ ] **Step 5: Visual check in the ?glb harness (claude-in-chrome)**

Open `http://localhost:5173/?match` in a real Chrome tab. Screenshot during play.
Expected: characters idle/run with mocap motion (visibly smoother, weight-shifted,
no robot arms). Then open `http://localhost:5173/?match&codeanim` — old code
animation still works (fallback intact).

- [ ] **Step 6: Commit**

```bash
git add src/game/glbCharacters.js tests/glbAnimatorChoice.test.js
git commit -m "feat(anim): characters use MocapAnimator with code-animator fallback (?codeanim=1)"
```

---

### Task 6: matchScene wiring — strafes, ball-in-hands, pitch clip

**Files:**
- Modify: `src/game/matchScene.js` (dead-feet block ~lines 1593-1611; updateDefense settle branch ~lines 1015-1021; `possessBall` ~line 1070; pitcher throw ~line 437)
- Test: `tests/kickerStride.test.js`

**Interfaces:**
- Consumes: animation names `strafeL`, `strafeR`, `holdball`, `pitch` (Tasks 1/3/4).
- Produces: `kickerStrideAnim(vxSigned)` exported from `matchScene.js` → `'strafeL' | 'strafeR' | null` (null = settled).

- [ ] **Step 1: Write the failing test**

```js
// tests/kickerStride.test.js
import { describe, it, expect } from 'vitest';
import { kickerStrideAnim } from '../src/game/matchScene.js';

describe('kicker stride selection', () => {
  it('moving +x (kicker faces the mound at -z, so +x is his right) -> strafeR', () => {
    expect(kickerStrideAnim(2.0)).toBe('strafeR');
  });
  it('moving -x -> strafeL', () => {
    expect(kickerStrideAnim(-2.0)).toBe('strafeL');
  });
  it('below the dead-zone -> null (settled)', () => {
    expect(kickerStrideAnim(0.3)).toBe(null);
    expect(kickerStrideAnim(-0.3)).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/kickerStride.test.js`
Expected: FAIL — `kickerStrideAnim` is not exported.

- [ ] **Step 3: Implement the wiring**

In `src/game/matchScene.js`:

(a) Add the pure helper near the top (after the `CAM` const):

```js
/** Directional stride for the kicker lining up: signed x-velocity (m/s) ->
 *  strafe clip name, or null when settled. Kicker faces the mound (-z), so
 *  +x movement is his RIGHT. Dead-zone matches the old dead-feet fix (0.6). */
export function kickerStrideAnim(vxSigned) {
  if (Math.abs(vxSigned) <= 0.6) return null;
  return vxSigned > 0 ? 'strafeR' : 'strafeL';
}
```

(b) Replace the dead-feet block (currently lines 1597-1608) with:

```js
    if (this.kicker && (this.phase === 'PITCH' || this.phase === 'SETUP')) {
      const kx = this.kicker.group.position.x;
      const prevX = this._kickerPrevX ?? kx;
      const vx = rawDt > 0 ? (kx - prevX) / rawDt : 0; // SIGNED — picks the strafe direction
      const anim = this.kicker.animator;
      const stride = kickerStrideAnim(vx);
      if (stride) {
        if (anim.name !== stride) anim.play(stride, { speedFactor: 0.6 + Math.min(1.4, Math.abs(vx) / 3) });
        anim.ctx.speedFactor = 0.6 + Math.min(1.4, Math.abs(vx) / 3);
      } else if (anim.name === 'strafeL' || anim.name === 'strafeR' || anim.name === 'run') {
        anim.play('plate'); // settled — back to the batter stance
      }
      this._kickerPrevX = kx;
    } else if (this.kicker) {
      this._kickerPrevX = this.kicker.group.position.x;
    }
```

(c) Ball-in-hands: in `possessBall` (line ~1070), chain into the hold stance:

```js
    c.animator.play('catch', { onDone: () => { if (c.hasBall) c.animator.play('holdball'); } });
```

(d) Ball-in-hands while covering: in the `updateDefense` settle branch
(currently line 1018-1021), prefer the hold stance when the fielder has the ball:

```js
      } else if (c.animator.name === 'run' && f.role !== 'chase') {
        c.animator.play(c.hasBall ? 'holdball' : 'crouch');
        this.faceTo(c, this.ball.pos);
      }
```

(e) Pitcher uses the underhand clip: line ~437 becomes:

```js
    pitcher.animator.play('pitch', { onDone: () => pitcher.animator.play('idle') });
```

NOTE: `GlbCodeAnimator` has no `pitch`/`holdball`/`strafeL`/`strafeR` clips — its
`play()` falls back to `idle` for unknown names, so the `?codeanim=1` path stays
safe with no further changes.

- [ ] **Step 4: Run the full suite + build**

Run: `npx vitest run`
Expected: all pass.
Run: `npm run build`
Expected: clean.

- [ ] **Step 5: REAL-PLAY verification (claude-in-chrome)**

Open `http://localhost:5173/?match` and play a half-inning for real. Verify by
driving inputs + screenshots:
- kicker side-steps with strafe clips while dragging to line up, settles to stance
- kick fires at the marked contact frame (ball leaves ON the foot swing — if the
  ball launches before/after the foot arrives, refine `contactAt` in the manifest)
- pitcher's delivery reads as the Goalie Throw release
- a fielder who scoops a grounder settles into the Goalkeeper-Idle hold stance
- runners run with mocap stride scaled to tap speed
- celebrations/dances play after the match
Then `http://localhost:5173/?match=field`: catch a fly (Baseball Catcher clip),
throw to a base (Throwing clip + contact-timed release).
If strafe directions read MIRRORED in play, swap the return values in
`kickerStrideAnim` (and update its test expectations to match the verified truth).

- [ ] **Step 6: Commit**

```bash
git add src/game/matchScene.js tests/kickerStride.test.js
git commit -m "feat(anim): strafe line-up, ball-in-hands stance, underhand pitch clip"
```

---

### Task 7: Full verification + PR

**Files:**
- Modify: none (verification only)

- [ ] **Step 1: Full suite + build**

Run: `npx vitest run && npm run build`
Expected: every test passes, build clean.

- [ ] **Step 2: Full real-play pass (claude-in-chrome)**

Play one complete match at `http://localhost:5173/?nosplash` (full flow: team
select → intros → coin toss → match → post-game). Screenshot each phase. Confirm
no animation state ever freezes/T-poses, and the fallback path
(`?match&codeanim`) still plays.

- [ ] **Step 3: Push branch + open PR (do NOT merge)**

```bash
git push -u origin feat/graphics-overhaul
gh pr create --title "Phase 1: real mocap animation (Mixamo -> Meshy retarget)" --body "$(cat <<'EOF'
## Summary
- Replaces hand-coded GlbCodeAnimator joint rotations with 17 real Mixamo mocap clips retargeted onto the shared Meshy archetype skeleton (one mocap.glb, all 6 archetypes)
- New MocapAnimator: AnimationMixer playback, crossfade blending, manifest-marked contact frames, live speedFactor run scaling
- Kicker lines up with directional strafes; fielders hold the ball in a Goalkeeper stance; pitcher gets a real underhand delivery
- Old animator kept behind ?codeanim=1 as emergency fallback
- Dev tools: tools/retarget.html harness + scripts/copy-anims.mjs

Phase 1 of docs/superpowers/specs/2026-07-01-graphics-overhaul-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01N6XuJPjuijE6P7Y3F7hm8Y
EOF
)"
```

- [ ] **Step 4: Hand off to the dev**

Tell the dev the PR is up and awaiting his phone playtest + "push" to deploy.

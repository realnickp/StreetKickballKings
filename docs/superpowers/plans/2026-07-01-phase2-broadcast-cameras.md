# Phase 2 — Broadcast Cameras + Instant Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three static camera presets + linear lerp with a broadcast shot system (cuts, telephoto, spring-damped motion), and replace the "horrendous" (dev) freeze-frame big-moment treatment with a true instant replay of the actual play.

**Architecture:** A new `CameraDirector` owns the match camera: named shots (functions of live game context → position/look/FOV), critically-damped springs for glide, hard `cut()` for broadcast cuts. matchScene keeps its situational knowledge but delegates all camera math. A new `ReplayRecorder` ring-buffers ~6s of bone-level character poses + ball state every frame; on a big moment (catch/homer/peg) the director plays the buffer back in slow-mo from a fresh cinematic angle with letterbox bars, then restores live state. The DOM speed-lines, spray-stamp slams over the action, and the dead ComicShader are deleted; calls move to the existing lower-third banner.

**Tech Stack:** Three.js r0.184, Vitest, existing EventBus/HUD/director script engine.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-01-graphics-overhaul-design.md` — Phase 2 only.
- "Input-critical views stay stable: pitch-trace and kick-timing windows never get a cut or FOV change mid-input." The `kick` and `pitchSelect` shots must equal today's framing (CAM.kick / CAM.pitch).
- "Portrait framing preserved (FOV widening for narrow aspect stays, per-shot)" — shots express FOV as a SCALE of the aspect-derived base FOV (74 narrow / 58 wide), not absolute values.
- Deleted for good: DOM speed-lines, spray-paint stamp slams over the action, `ComicShader`, `engine.setComic`. Calls (SAFE!/OUT!...) use the lower-third `hud.banner` style.
- Every new path degrades gracefully — a replay that can't run (buffer too short) skips to live play, never a blank screen or soft-lock.
- Visual claims verified by REAL browser play (claude-in-chrome); dev playtests live — his eye is the final gate.
- All existing tests keep passing; `npm run build` clean. Branch: `feat/graphics-overhaul-p2` off main. No merge without dev "push".

## File Structure

- Create `src/game/cameraDirector.js` — shots, springs, cuts. No knowledge of matchScene internals; consumes a plain ctx object.
- Create `src/cinematics/replay.js` — ReplayRecorder (capture) + ReplayPlayer (playback). No camera math beyond its own replay angle.
- Modify `src/game/matchScene.js` — replace the CAM presets + lerp block with CameraDirector calls; feed the recorder each frame.
- Modify `src/cinematics/director.js` — crowned/robbed/pegged become replays; perfectKick/coinToss stay; remove setComic call.
- Modify `src/engine/renderer.js` — remove ComicShader/setComic; expose `engine.baseFov` from resize.
- Modify `src/ui/screens/hud.js` + `src/ui/ui.css` — delete speed-lines; keep stamps ONLY for instructional flow text (SWITCH!, PICKLE!), route play CALLS through the lower-third banner.

---

### Task 1: CameraDirector — springs, shots, cuts (TDD)

**Files:**
- Create: `src/game/cameraDirector.js`
- Test: `tests/cameraDirector.test.js`

**Interfaces:**
- Produces: `class CameraDirector { constructor(camera, { baseFov }); request(shotName, ctx, { cut = false }); update(rawDt, ctx); setBaseFov(f); shot -> string }`
  - `ctx` (plain object, matchScene builds it): `{ ball: {pos, mode}, kicker, leadRunnerPos, activeFielderPos, phase }` — every field optional; shots fall back sanely.
  - Shot names: `'kick' | 'pitchSelect' | 'contact' | 'ballFlight' | 'runners' | 'defense' | 'crane' | 'foulTrail'`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/cameraDirector.test.js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraDirector, SHOTS } from '../src/game/cameraDirector.js';

const mkCam = () => new THREE.PerspectiveCamera(58, 0.6, 0.1, 500);
const ctx = (over = {}) => ({
  ball: { pos: new THREE.Vector3(0, 1, -10), mode: 'flying' },
  kickerPos: new THREE.Vector3(0, 0, 0.4),
  leadRunnerPos: new THREE.Vector3(6, 0, -6),
  activeFielderPos: new THREE.Vector3(2, 0, -14),
  ...over,
});

describe('CameraDirector', () => {
  it('kick shot matches the legacy CAM.kick framing exactly (input-critical)', () => {
    const s = SHOTS.kick(ctx());
    expect(s.pos.toArray()).toEqual([0, 3.4, 8.0]);
    expect(s.look.toArray()).toEqual([0, 1.2, -12]);
    expect(s.fovScale).toBe(1);
  });

  it('pitchSelect shot matches legacy CAM.pitch', () => {
    const s = SHOTS.pitchSelect(ctx());
    expect(s.pos.toArray()).toEqual([0, 5.0, -19.0]);
    expect(s.look.toArray()).toEqual([0, 1.1, -1.5]);
  });

  it('ballFlight is telephoto (fovScale < 0.75) and looks at the ball', () => {
    const c = ctx();
    const s = SHOTS.ballFlight(c);
    expect(s.fovScale).toBeLessThan(0.75);
    expect(s.look.distanceTo(c.ball.pos)).toBeLessThan(1.5);
  });

  it('cut() snaps instantly; smooth request glides', () => {
    const cam = mkCam();
    const d = new CameraDirector(cam, { baseFov: 58 });
    d.request('kick', ctx(), { cut: true });
    d.update(0.016, ctx());
    expect(cam.position.distanceTo(new THREE.Vector3(0, 3.4, 8.0))).toBeLessThan(0.01);
    d.request('pitchSelect', ctx()); // no cut
    d.update(0.016, ctx());
    // one frame of spring motion cannot cover the ~27m jump
    expect(cam.position.distanceTo(new THREE.Vector3(0, 5.0, -19.0))).toBeGreaterThan(5);
    for (let i = 0; i < 400; i++) d.update(0.016, ctx());
    expect(cam.position.distanceTo(new THREE.Vector3(0, 5.0, -19.0))).toBeLessThan(0.2);
  });

  it('fov follows the shot fovScale against baseFov', () => {
    const cam = mkCam();
    const d = new CameraDirector(cam, { baseFov: 58 });
    d.request('ballFlight', ctx(), { cut: true });
    d.update(0.016, ctx());
    expect(cam.fov).toBeLessThan(58 * 0.8);
    d.setBaseFov(74); // portrait resize mid-shot
    d.request('kick', ctx(), { cut: true });
    d.update(0.016, ctx());
    expect(cam.fov).toBeCloseTo(74, 0);
  });

  it('unknown shot or missing ctx fields never throw', () => {
    const cam = mkCam();
    const d = new CameraDirector(cam, { baseFov: 58 });
    d.request('nope', {});
    expect(() => d.update(0.016, {})).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cameraDirector.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```js
// src/game/cameraDirector.js — broadcast camera brain for the match.
// Named SHOTS are pure functions of live game context -> {pos, look, fovScale,
// stiffness?}. The director spring-damps position/look/fov toward the active
// shot every frame (critically damped -> settles without wobble) and can CUT
// (snap) like a real broadcast. matchScene owns WHICH shot plays; this owns HOW
// the camera moves. fovScale multiplies the aspect-derived base FOV so portrait
// framing survives (74 narrow / 58 wide, set by renderer resize).
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const SHOTS = {
  // INPUT-CRITICAL — identical to the legacy CAM presets. Never change framing.
  kick: () => ({ pos: V(0, 3.4, 8.0), look: V(0, 1.2, -12), fovScale: 1, stiffness: 30 }),
  pitchSelect: () => ({ pos: V(0, 5.0, -19.0), look: V(0, 1.1, -1.5), fovScale: 1, stiffness: 30 }),

  // hard CUT on contact: low hero cam beside the plate, looking up the lane
  contact: (c) => {
    const k = c.kickerPos ?? V(0, 0, 0.4);
    return { pos: V(k.x + 2.2, 0.9, k.z + 3.2), look: V(k.x, 1.3, k.z - 6), fovScale: 0.9, stiffness: 60 };
  },

  // telephoto ball tracker: far back + narrow lens = background compression
  ballFlight: (c) => {
    const b = c.ball?.pos ?? V(0, 2, -15);
    return {
      pos: V(b.x * 0.35, Math.max(4.5, b.y * 0.5 + 4), b.z + 26),
      look: b.clone(),
      fovScale: 0.55, stiffness: 14,
    };
  },

  // elevated sideline cam framing lead runner + infield
  runners: (c) => {
    const r = c.leadRunnerPos ?? V(0, 0, 0);
    const fx = r.x * 0.5;
    return { pos: V(fx + 9, 9.5, -3.5), look: V(fx * 0.6, 0.8, -8), fovScale: 0.85, stiffness: 8 };
  },

  // defense: frame your fielder + the ball (legacy live framing, spring-damped)
  defense: (c) => {
    const a = c.activeFielderPos ?? V(0, 0, -14);
    const b = c.ball?.pos ?? a;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const sep = Math.min(30, a.distanceTo(b));
    return { pos: V(mid.x * 0.5, Math.min(15, 8 + sep * 0.25), mid.z + 9 + sep * 0.25), look: V(mid.x, 0.5, mid.z), fovScale: 1, stiffness: 8 };
  },

  // deep ball: crane rising with the ball toward the fence
  crane: (c) => {
    const b = c.ball?.pos ?? V(0, 6, -30);
    return { pos: V(b.x * 0.6, Math.max(9, b.y + 4), b.z + 17), look: b.clone(), fovScale: 0.65, stiffness: 10 };
  },

  // foul: trail the ball so you see where it went (legacy behavior)
  foulTrail: (c) => {
    const b = c.ball?.pos ?? V(0, 2, 4);
    return { pos: V(b.x * 0.7, Math.max(6.5, b.y * 0.45 + 7.5), b.z + 11.5), look: V(b.x, Math.max(0.6, b.y * 0.5), b.z), fovScale: 1, stiffness: 10 };
  },
};

/** critically damped spring toward target (no overshoot wobble, real weight) */
function spring(current, vel, target, stiffness, dt) {
  const c = 2 * Math.sqrt(stiffness);
  const ax = stiffness * (target.x - current.x) - c * vel.x;
  const ay = stiffness * (target.y - current.y) - c * vel.y;
  const az = stiffness * (target.z - current.z) - c * vel.z;
  vel.x += ax * dt; vel.y += ay * dt; vel.z += az * dt;
  current.x += vel.x * dt; current.y += vel.y * dt; current.z += vel.z * dt;
}

export class CameraDirector {
  constructor(camera, { baseFov = 58 } = {}) {
    this.camera = camera;
    this.baseFov = baseFov;
    this.shot = 'kick';
    this.pos = camera.position.clone();
    this.look = new THREE.Vector3(0, 1, -10);
    this.posVel = new THREE.Vector3();
    this.lookVel = new THREE.Vector3();
    this.fov = baseFov;
    this.fovVel = 0;
  }

  setBaseFov(f) { this.baseFov = f; }

  /** switch shots; cut=true snaps this frame (broadcast cut) */
  request(name, ctx = {}, { cut = false } = {}) {
    if (!SHOTS[name]) return;
    this.shot = name;
    if (cut) {
      const t = SHOTS[name](ctx);
      this.pos.copy(t.pos); this.look.copy(t.look);
      this.posVel.set(0, 0, 0); this.lookVel.set(0, 0, 0);
      this.fov = this.baseFov * (t.fovScale ?? 1); this.fovVel = 0;
    }
  }

  update(rawDt, ctx = {}) {
    const def = SHOTS[this.shot];
    if (!def) return;
    const t = def(ctx);
    const dt = Math.min(rawDt, 0.05);
    const k = t.stiffness ?? 10;
    spring(this.pos, this.posVel, t.pos, k, dt);
    spring(this.look, this.lookVel, t.look, k, dt);
    const targetFov = this.baseFov * (t.fovScale ?? 1);
    const c = 2 * Math.sqrt(k);
    this.fovVel += (k * (targetFov - this.fov) - c * this.fovVel) * dt;
    this.fov += this.fovVel * dt;

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cameraDirector.test.js`
Expected: PASS (6 tests). If the glide test settles too slowly/fast, tune stiffness in the test's shot, not the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/game/cameraDirector.js tests/cameraDirector.test.js
git commit -m "feat(cam): CameraDirector - broadcast shots, critically-damped springs, cuts"
```

---

### Task 2: matchScene integration — shots per situation, contact cut, crane

**Files:**
- Modify: `src/game/matchScene.js` (CAM const ~line 37; camera block ~lines 1663-1694; kick-contact site where `ballCamUntil` is set; constructor)
- Modify: `src/engine/renderer.js` (resize: expose `engine.baseFov`)
- Test: `tests/cameraShotChoice.test.js`

**Interfaces:**
- Consumes: `CameraDirector`, `SHOTS` (Task 1).
- Produces: `chooseLiveShot({ phase, kickingIsPlayer, trailBall, ballMode, deepBall })` exported from `matchScene.js` → shot name string. matchScene gains `this.camDir` and `this.camCtx()`.

- [ ] **Step 1: Write the failing test**

```js
// tests/cameraShotChoice.test.js
import { describe, it, expect } from 'vitest';
import { chooseLiveShot } from '../src/game/matchScene.js';

describe('live shot selection', () => {
  it('foul -> foulTrail', () => {
    expect(chooseLiveShot({ phase: 'FOUL' })).toBe('foulTrail');
  });
  it('player kicked, ball flying near the fence -> crane', () => {
    expect(chooseLiveShot({ phase: 'LIVE', kickingIsPlayer: true, trailBall: true, deepBall: true })).toBe('crane');
  });
  it('player kicked, ball flying infield -> ballFlight telephoto', () => {
    expect(chooseLiveShot({ phase: 'LIVE', kickingIsPlayer: true, trailBall: true, deepBall: false })).toBe('ballFlight');
  });
  it('player offense after the trail window -> runners cam', () => {
    expect(chooseLiveShot({ phase: 'LIVE', kickingIsPlayer: true, trailBall: false })).toBe('runners');
  });
  it('defense -> defense cam', () => {
    expect(chooseLiveShot({ phase: 'LIVE', kickingIsPlayer: false, trailBall: false })).toBe('defense');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cameraShotChoice.test.js`
Expected: FAIL — `chooseLiveShot` not exported.

- [ ] **Step 3: Implement the integration**

(a) `src/engine/renderer.js` — in `resize()`, right after the fov assignment:

```js
    camera.fov = w / h < 0.65 ? 74 : 58;
    engine.baseFov = camera.fov; // CameraDirector multiplies shot fovScale onto this
```

(b) `src/game/matchScene.js` — add the pure selector near `kickerStrideAnim`:

```js
/** Which broadcast shot covers the live situation. Pure — unit-tested. */
export function chooseLiveShot({ phase, kickingIsPlayer, trailBall, deepBall }) {
  if (phase === 'FOUL') return 'foulTrail';
  if (kickingIsPlayer && trailBall) return deepBall ? 'crane' : 'ballFlight';
  if (kickingIsPlayer) return 'runners';
  return 'defense';
}
```

(c) constructor (after `this.camLook = ...`):

```js
    this.camDir = new CameraDirector(engine.camera, { baseFov: engine.baseFov ?? 58 });
```

with import: `import { CameraDirector } from './cameraDirector.js';`

(d) add a ctx builder method:

```js
  /** plain-object context the CameraDirector shots read */
  camCtx() {
    const lead = this.leadRunner?.() ?? this.runners.find((r) => r.state === 'held');
    return {
      ball: this.ball,
      kickerPos: this.kicker?.group.position,
      leadRunnerPos: lead ? this.runnerWorldPos(lead).p : FIELD_LAYOUT.home,
      activeFielderPos: (this.activeFielder ?? this.chaser ?? this.kicker)?.group.position,
    };
  }
```

(e) REPLACE the whole camera block (`if (!this.engine.cameraLock) { ... }` at ~1663-1694) with:

```js
    if (!this.engine.cameraLock) {
      this.camDir.setBaseFov(this.engine.baseFov ?? 58);
      if (this.phase === 'LIVE' || this.phase === 'RESOLVE' || this.phase === 'FOUL') {
        const trailBall = this.ball.mode === 'flying' && this.elapsed < (this.ballCamUntil ?? 0);
        const dist = Math.hypot(this.ball.pos.x, this.ball.pos.z);
        this.camDir.request(chooseLiveShot({
          phase: this.phase,
          kickingIsPlayer: this.kickingIsPlayer(),
          trailBall,
          deepBall: dist > this.fenceM * 0.55,
        }), this.camCtx());
      } else if (this.camTarget === CAM.kick) {
        this.camDir.request('kick', this.camCtx());
      } else if (this.camTarget === CAM.pitch) {
        this.camDir.request('pitchSelect', this.camCtx());
      }
      this.camDir.update(rawDt, this.camCtx());
    }
```

NOTE: `this.camTarget` assignments (CAM.kick / CAM.pitch) stay untouched everywhere
else — they now act as the role-view INTENT flag the block above translates into
shots. The `CAM` const, `this.camLook`, and `this.liveCam` stay for the legacy
assignments but the lerp lines are gone.

(f) the CONTACT CUT — at the kick-contact site (where `ballCamUntil` is set after a
kick launches; search `ballCamUntil =` in matchScene.js):

```js
    this.camDir.request('contact', this.camCtx(), { cut: true });
    this.after(0.4, () => {
      if (this.phase === 'LIVE') this.camDir.request('ballFlight', this.camCtx());
    });
```

- [ ] **Step 4: Run the suite + build**

Run: `npx vitest run && npm run build`
Expected: all pass, clean build.

- [ ] **Step 5: REAL-PLAY verification (claude-in-chrome)**

`http://localhost:5173/?match`: kick timing view identical to before (no framing
change while the pitch rolls); on contact a hard CUT to the low hero cam, then the
telephoto tracker glides onto the ball (visibly narrower lens — compressed
background); deep kicks get the rising crane; after the trail window the elevated
runners cam; `?match=field` gets the spring-damped defense cam. Camera never
teleports mid-glide except the intended contact cut.

- [ ] **Step 6: Commit**

```bash
git add src/game/matchScene.js src/engine/renderer.js tests/cameraShotChoice.test.js
git commit -m "feat(cam): matchScene drives broadcast shots - contact cut, telephoto tracker, crane"
```

---

### Task 3: ReplayRecorder — bone-level ring buffer (TDD)

**Files:**
- Create: `src/cinematics/replay.js`
- Test: `tests/replayRecorder.test.js`

**Interfaces:**
- Produces:
  - `class ReplayRecorder { constructor({ seconds = 6, hz = 30 }); track(chars, ball); capture(elapsed); clipLast(seconds) -> Frame[] | null; }`
  - `Frame = { t, ball: {x,y,z, visible}, chars: [{ px,pz,ry, bones: Float32Array }] }` (bones = quats+hips-pos packed per tracked bone)
  - `applyFrame(frame, chars, ball)` — write a frame back onto the live objects.
- Consumed by Task 4's ReplayPlayer.

- [ ] **Step 1: Write the failing tests**

```js
// tests/replayRecorder.test.js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ReplayRecorder, applyFrame } from '../src/cinematics/replay.js';

function mkChar(x = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, -5);
  const hips = new THREE.Bone(); hips.name = 'Hips';
  hips.position.set(0, 1, 0);
  group.add(hips);
  return { group };
}
const mkBall = () => ({ pos: new THREE.Vector3(0, 0.2, -8), mesh: { visible: true } });

describe('ReplayRecorder', () => {
  it('captures at the configured rate and clips the last N seconds', () => {
    const rec = new ReplayRecorder({ seconds: 2, hz: 30 });
    const chars = [mkChar()], ball = mkBall();
    rec.track(chars, ball);
    for (let t = 0; t < 3; t += 1 / 60) rec.capture(t); // 3s of 60fps -> 30hz kept
    const clip = rec.clipLast(1.0);
    expect(clip.length).toBeGreaterThanOrEqual(28);
    expect(clip.length).toBeLessThanOrEqual(32);
    expect(clip[0].t).toBeLessThan(clip[clip.length - 1].t);
  });

  it('returns null when the buffer is too short (never a broken replay)', () => {
    const rec = new ReplayRecorder({ seconds: 6, hz: 30 });
    rec.track([mkChar()], mkBall());
    rec.capture(0);
    expect(rec.clipLast(2.0)).toBe(null);
  });

  it('applyFrame restores recorded transforms', () => {
    const rec = new ReplayRecorder({ seconds: 2, hz: 30 });
    const chars = [mkChar(3)], ball = mkBall();
    rec.track(chars, ball);
    rec.capture(0);
    rec.capture(0.5);
    const clip = rec.clipLast(0.5);
    chars[0].group.position.x = 99; // play moved on
    ball.pos.set(9, 9, 9);
    applyFrame(clip[0], chars, ball);
    expect(chars[0].group.position.x).toBeCloseTo(3);
    expect(ball.pos.y).toBeCloseTo(0.2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/replayRecorder.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```js
// src/cinematics/replay.js — instant-replay capture/playback.
// ReplayRecorder ring-buffers the last N seconds of every tracked character's
// SKELETON pose (bone quats + hips position), group transform, and the ball.
// Playback re-drives those transforms directly — the replay IS the real play,
// not a canned animation. ~6s x 30hz x 16 chars x 24 bones ~= 1MB. Cheap.
import * as THREE from 'three';

export class ReplayRecorder {
  constructor({ seconds = 6, hz = 30 } = {}) {
    this.maxFrames = Math.ceil(seconds * hz);
    this.interval = 1 / hz;
    this.frames = [];
    this.lastT = -Infinity;
    this.chars = [];
    this.ball = null;
    this.bonesPerChar = [];
  }

  /** call once when the match builds its characters */
  track(chars, ball) {
    this.chars = chars;
    this.ball = ball;
    this.bonesPerChar = chars.map((c) => {
      const bones = [];
      c.group.traverse((o) => { if (o.isBone) bones.push(o); });
      return bones;
    });
  }

  capture(elapsed) {
    if (elapsed - this.lastT < this.interval) return;
    this.lastT = elapsed;
    const chars = this.chars.map((c, i) => {
      const bones = this.bonesPerChar[i];
      const data = new Float32Array(bones.length * 7);
      for (let b = 0; b < bones.length; b++) {
        bones[b].quaternion.toArray(data, b * 7);
        bones[b].position.toArray(data, b * 7 + 4);
      }
      return { px: c.group.position.x, py: c.group.position.y, pz: c.group.position.z, ry: c.group.rotation.y, bones: data };
    });
    this.frames.push({
      t: elapsed,
      ball: { x: this.ball.pos.x, y: this.ball.pos.y, z: this.ball.pos.z, visible: this.ball.mesh?.visible ?? true },
      chars,
    });
    if (this.frames.length > this.maxFrames) this.frames.shift();
  }

  /** last N seconds of frames, oldest first; null if not enough recorded */
  clipLast(seconds) {
    if (this.frames.length < 2) return null;
    const end = this.frames[this.frames.length - 1].t;
    const clip = this.frames.filter((f) => f.t >= end - seconds);
    if (clip.length < 2 || end - clip[0].t < seconds * 0.6) return null;
    return clip;
  }
}

/** write one recorded frame back onto the live objects */
export function applyFrame(frame, chars, ball, bonesPerChar = null) {
  for (let i = 0; i < frame.chars.length && i < chars.length; i++) {
    const fc = frame.chars[i];
    const c = chars[i];
    c.group.position.set(fc.px, fc.py, fc.pz);
    c.group.rotation.y = fc.ry;
    let bones = bonesPerChar?.[i];
    if (!bones) {
      bones = [];
      c.group.traverse((o) => { if (o.isBone) bones.push(o); });
    }
    for (let b = 0; b < bones.length && b * 7 + 6 < fc.bones.length + 1; b++) {
      bones[b].quaternion.fromArray(fc.bones, b * 7);
      bones[b].position.fromArray(fc.bones, b * 7 + 4);
    }
  }
  if (ball) {
    ball.pos.set(frame.ball.x, frame.ball.y, frame.ball.z);
    if (ball.mesh) {
      ball.mesh.position.copy(ball.pos);
      ball.mesh.visible = frame.ball.visible;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/replayRecorder.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cinematics/replay.js tests/replayRecorder.test.js
git commit -m "feat(replay): bone-level ring-buffer recorder + frame apply"
```

---

### Task 4: ReplayPlayer + director rewrite (robbed/crowned/pegged = real replays)

**Files:**
- Modify: `src/cinematics/replay.js` (add ReplayPlayer)
- Modify: `src/cinematics/director.js` (crowned/robbed/pegged use replays; delete cineFraming/cinematicMoment freeze treatment)
- Modify: `src/game/matchScene.js` (construct + feed recorder; pass to director)
- Modify: `src/main.js` (director wiring gets `replay`) — check how CinematicDirector is constructed and thread the recorder through.
- Test: `tests/replayPlayer.test.js`

**Interfaces:**
- Consumes: `ReplayRecorder`, `applyFrame` (Task 3); `CameraDirector` NOT used — the player owns its replay angle.
- Produces: `class ReplayPlayer { constructor({ engine, hud, bus }); play({ clip, chars, ball, focusIndex, banner, bannerKind, vo, speed = 0.4, onDone }) }`
  - Snapshots live state, letterboxes, steps recorded frames at `speed`, camera = low telephoto arc around `focusIndex`'s recorded path, restores everything, calls `onDone`.
  - `bus.emit('cine:start')/('cine:done')` exactly like the old script engine so `cinematicLock` keeps gating gameplay. Tap emits `cine:skip` (already wired) → player jumps to restore.

- [ ] **Step 1: Write the failing test**

```js
// tests/replayPlayer.test.js
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { ReplayRecorder, ReplayPlayer } from '../src/cinematics/replay.js';

function world() {
  const group = new THREE.Group();
  group.position.set(2, 0, -6);
  const hips = new THREE.Bone(); hips.name = 'Hips'; group.add(hips);
  const chars = [{ group }];
  const ball = { pos: new THREE.Vector3(1, 0.5, -7), mesh: new THREE.Mesh() };
  ball.mesh.visible = true;
  const cbs = new Set();
  const engine = {
    camera: new THREE.PerspectiveCamera(58, 0.6, 0.1, 500),
    cameraLock: false, timeScale: 1, paused: false, baseFov: 58,
    onFrame: (cb) => { cbs.add(cb); return () => cbs.delete(cb); },
    tick: (dt) => { for (const cb of [...cbs]) cb(dt, dt); },
  };
  const events = [];
  const bus = { emit: (e) => events.push(e), on: () => {} };
  const hud = { banner: vi.fn(), hideBanner: vi.fn(), setLetterbox: vi.fn() };
  return { chars, ball, engine, bus, hud, events };
}

describe('ReplayPlayer', () => {
  it('plays a clip, locks gameplay, restores state, fires onDone', () => {
    const w = world();
    const rec = new ReplayRecorder({ seconds: 4, hz: 30 });
    rec.track(w.chars, w.ball);
    for (let t = 0; t < 2; t += 1 / 30) { w.chars[0].group.position.x = 2 + t; rec.capture(t); }
    const liveX = w.chars[0].group.position.x;

    const player = new ReplayPlayer({ engine: w.engine, hud: w.hud, bus: w.bus });
    const onDone = vi.fn();
    player.play({ clip: rec.clipLast(1.5), chars: w.chars, ball: w.ball, focusIndex: 0, banner: 'ROBBED!', bannerKind: 'robbed', onDone });

    expect(w.engine.cameraLock).toBe(true);
    expect(w.events).toContain('cine:start');
    // drive fake frames until the replay finishes (1.5s clip at 0.4 speed < 5s)
    for (let i = 0; i < 400 && !onDone.mock.calls.length; i++) w.engine.tick(0.016);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(w.engine.cameraLock).toBe(false);
    expect(w.events).toContain('cine:done');
    expect(w.chars[0].group.position.x).toBeCloseTo(liveX); // live state restored
    expect(w.hud.setLetterbox).toHaveBeenCalledWith(true);
    expect(w.hud.setLetterbox).toHaveBeenCalledWith(false);
  });

  it('null clip = graceful skip (onDone immediately, no lock)', () => {
    const w = world();
    const player = new ReplayPlayer({ engine: w.engine, hud: w.hud, bus: w.bus });
    const onDone = vi.fn();
    player.play({ clip: null, chars: w.chars, ball: w.ball, focusIndex: 0, onDone });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(w.engine.cameraLock).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/replayPlayer.test.js`
Expected: FAIL — ReplayPlayer not exported.

- [ ] **Step 3: Implement ReplayPlayer (append to src/cinematics/replay.js)**

```js
/**
 * Plays a recorded clip back in slow motion from a fresh broadcast angle:
 * snapshot live state -> letterbox + banner -> step recorded frames at `speed`
 * with a low telephoto arc around the focus subject -> restore -> onDone.
 * Emits cine:start/cine:done so matchScene's cinematicLock gates gameplay.
 */
export class ReplayPlayer {
  constructor({ engine, hud, bus }) {
    this.engine = engine;
    this.hud = hud;
    this.bus = bus;
    this.active = null;
    bus.on?.('cine:skip', () => this.finish());
    engine.onFrame((dt, rawDt) => this.update(rawDt));
  }

  play({ clip, chars, ball, focusIndex = 0, banner, bannerKind, vo, sound, speed = 0.4, onDone }) {
    if (!clip) { onDone?.(); return; }
    // snapshot the LIVE state so the world resumes exactly where it was
    const rec = new ReplayRecorder({ seconds: 1, hz: 240 });
    rec.track(chars, ball);
    rec.capture(0);
    const liveSnapshot = rec.frames[0];

    if (vo) this.bus.emit('vo', vo);
    if (sound) this.bus.emit('sfx', sound);
    this.bus.emit('sfx', 'crowd-cheer');
    if (banner) this.hud.banner(banner, bannerKind);
    this.hud.setLetterbox(true);
    this.engine.cameraLock = true;
    this.bus.emit('cine:start');

    const prevFov = this.engine.camera.fov;
    this.active = {
      clip, chars, ball, focusIndex, speed, onDone, liveSnapshot, prevFov,
      t: clip[0].t, end: clip[clip.length - 1].t,
      bonesPerChar: chars.map((c) => { const b = []; c.group.traverse((o) => { if (o.isBone) b.push(o); }); return b; }),
    };
    this.engine.camera.fov = (this.engine.baseFov ?? 58) * 0.6; // telephoto replay lens
    this.engine.camera.updateProjectionMatrix();
  }

  update(rawDt) {
    const a = this.active;
    if (!a) return;
    a.t += rawDt * a.speed;
    if (a.t >= a.end) return this.finish();

    // find the frame at replay-time t (frames are oldest-first)
    let f = a.clip[0];
    for (const fr of a.clip) { if (fr.t <= a.t) f = fr; else break; }
    applyFrame(f, a.chars, a.ball, a.bonesPerChar);

    // low telephoto arc around the focus subject's recorded position
    const fc = f.chars[a.focusIndex] ?? f.chars[0];
    const k = (a.t - a.clip[0].t) / (a.end - a.clip[0].t);
    const ang = -0.5 + k * 0.75; // slow orbital drift across the replay
    const cx = fc.px + Math.sin(ang) * 6.5;
    const cz = fc.pz + Math.cos(ang) * 6.5;
    this.engine.camera.position.set(cx, 1.4, cz);
    this.engine.camera.lookAt(fc.px, 1.1, fc.pz);
  }

  finish() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    applyFrame(a.liveSnapshot, a.chars, a.ball, a.bonesPerChar); // world back to live
    this.engine.camera.fov = a.prevFov;
    this.engine.camera.updateProjectionMatrix();
    this.engine.cameraLock = false;
    this.hud.setLetterbox(false);
    this.hud.hideBanner();
    this.bus.emit('cine:done');
    a.onDone?.();
  }
}
```

- [ ] **Step 4: Rewire the director**

In `src/cinematics/director.js`:
- Constructor gains `{ engine, bus, hud, getBall, getReplay }` — `getReplay()` returns
  `{ recorder, chars, ball, player }` provided by matchScene.
- `crowned`, `robbed`, `pegged` become:

```js
  crowned({ kicker }) {
    this.replayMoment({ focusChar: kicker, seconds: 3.2, banner: 'HOME RUN!', bannerKind: 'homer', vo: { event: 'crowned', gender: kicker.gender } });
  }

  robbed({ fielder }) {
    this.replayMoment({ focusChar: fielder, seconds: 2.4, banner: 'ROBBED!', bannerKind: 'robbed', vo: 'robbed' });
  }

  pegged({ runner }) {
    this.replayMoment({ focusChar: runner, seconds: 2.2, banner: 'PEGGED!', bannerKind: 'pegged', vo: 'pegged', sound: 'peg' });
  }

  /** true instant replay of the actual play; skips gracefully if unrecorded */
  replayMoment({ focusChar, seconds, banner, bannerKind, vo, sound }) {
    const r = this.getReplay?.();
    if (!r) return;
    r.player.play({
      clip: r.recorder.clipLast(seconds),
      chars: r.chars, ball: r.ball,
      focusIndex: Math.max(0, r.chars.indexOf(focusChar)),
      banner, bannerKind, vo, sound,
      speed: 0.45,
    });
  }
```

- DELETE `cineFraming` and `cinematicMoment` (the freeze-mugshot treatment) and the
  `setComic(0)` line in `finish()`. `perfectKick`, `special`, `coinToss`, and the
  script engine (`run/skip/finish/update/cam`) stay.

- [ ] **Step 5: Feed the recorder from matchScene**

In `src/game/matchScene.js` constructor (after chars are added to the scene):

```js
    this.replayRecorder = new ReplayRecorder({ seconds: 6, hz: 30 });
    this.replayChars = [...this.chars.home, ...this.chars.away];
    this.replayRecorder.track(this.replayChars, this.ball);
```

In `update()` (end of the method, only while unlocked — never record the replay itself):

```js
    if (!this.cinematicLock) this.replayRecorder.capture(this.elapsed);
```

Find where `CinematicDirector` is constructed (search `new CinematicDirector` — in
`src/main.js`) and pass `getReplay` returning the scene's
`{ recorder: scene.replayRecorder, chars: scene.replayChars, ball: scene.ball, player }`,
with `const player = new ReplayPlayer({ engine, hud, bus })` built alongside the director.
Imports: `import { ReplayRecorder, ReplayPlayer } from '../cinematics/replay.js';` (path per file).

- [ ] **Step 6: Run tests + build; commit**

Run: `npx vitest run && npm run build`
Expected: all pass.

```bash
git add src/cinematics/replay.js src/cinematics/director.js src/game/matchScene.js src/main.js tests/replayPlayer.test.js
git commit -m "feat(replay): big moments play as true instant replays (catch/homer/peg)"
```

---

### Task 5: Kill the comic pass + speed lines; letterbox + lower-third calls

**Files:**
- Modify: `src/engine/renderer.js` (delete ComicShader, comicPass, setComic)
- Modify: `src/ui/screens/hud.js` (add `setLetterbox(on)`; route play CALLS through `banner`)
- Modify: `src/ui/ui.css` (delete `.speed-lines` rules; add `.letterbox`)
- Modify: `src/game/matchScene.js` + `src/ui/screens/hud.js` — remove speed-line triggers
- Test: existing suites (no new unit surface — DOM/CSS)

- [ ] **Step 1: renderer — delete the dead pass**

Remove the `ComicShader` definition, `comicPass` creation, its line in `rebuildChain()`,
`comicPass.uniforms.resolution` in `resize()`, `setComic` from the engine object, and
`comicPass` from `engine.fx`. Grep first: `grep -rn "setComic\|comicPass\|ComicShader" src/`
and clean every hit (director.js's `setComic(0)` already removed in Task 4).

- [ ] **Step 2: hud — letterbox + speed-line removal**

In `hud.js`: delete the speed-lines element/method (grep `speed-lines` / `speedLines`);
add:

```js
  /** cinematic letterbox bars for replays */
  setLetterbox(on) {
    if (!this.letterboxEl) {
      this.letterboxEl = document.createElement('div');
      this.letterboxEl.className = 'letterbox';
      this.el.appendChild(this.letterboxEl);
    }
    this.letterboxEl.classList.toggle('on', !!on);
  }
```

In `ui.css`: delete all `.speed-lines` blocks; add:

```css
/* replay letterbox: broadcast bars that slide in during instant replays */
.letterbox { position: absolute; inset: 0; pointer-events: none; z-index: 7; }
.letterbox::before, .letterbox::after {
  content: ''; position: absolute; left: 0; right: 0; height: 0;
  background: #000; transition: height .28s ease;
}
.letterbox::before { top: 0; }
.letterbox::after { bottom: 0; }
.letterbox.on::before, .letterbox.on::after { height: 9%; }
```

- [ ] **Step 3: play calls via lower-third**

In matchScene, the big play CALLS switch from `hud.stamp` to `hud.banner` +
auto-hide (banner already renders as the lower-third broadcast strip):
`'SAFE!'`, `'OUT!'`, `'DOUBLE PLAY!'`, `'TRIPLE PLAY!'`, `'FOUL!'`, `'NOBODY COVERING!'`.
Instructional flow text KEEPS `hud.stamp` (SWITCH! GLOVE UP!, PICKLE!, GET READY hints).
Grep `hud.stamp(` in matchScene.js and convert only the play calls; give `banner`
a 1.4s auto-hide option: `banner(text, kind, { autoHideMs = 0 })` → setTimeout hideBanner.

- [ ] **Step 4: Run everything; REAL-PLAY verification**

Run: `npx vitest run && npm run build` → all pass.
Real play: catch a fly in `?match=field` → letterboxed slow-mo replay of the actual
catch from a low orbital angle, ROBBED! lower-third, then play resumes exactly where
it was. Homer → same treatment with HOME RUN!. No speed lines anywhere; no comic
shader flash; SAFE!/OUT! appear as lower-third strips, not spray paint over the ball.

- [ ] **Step 5: Commit**

```bash
git add src/engine/renderer.js src/ui/screens/hud.js src/ui/ui.css src/game/matchScene.js
git commit -m "feat(present): letterboxed replays + lower-third calls; comic pass and speed lines deleted"
```

---

### Task 6: Full verification + PR

- [ ] **Step 1:** `npx vitest run && npm run build` — everything green.
- [ ] **Step 2:** Full real-play pass (claude-in-chrome, window foregrounded — remember rAF
  throttles when occluded): a complete half-inning each way at `?match` and `?match=field`;
  confirm every shot transition, a catch replay, and that `?codeanim` still plays.
- [ ] **Step 3:** Dev playtest gate — he watches live; iterate on his feedback (shot framing
  and replay speed are one-number tunes).
- [ ] **Step 4:** Push branch + `gh pr create` titled "Phase 2: broadcast cameras + instant replay".
  Do NOT merge — dev authorizes with "push".

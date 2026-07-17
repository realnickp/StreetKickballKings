# City Elements Implementation Plan (Street Rules — Pillar 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every field gets its city's signature gameplay element — fixed identity, per-inning rolled intensity, arcade-loud presentation — per the approved spec `docs/superpowers/specs/2026-07-16-street-rules-design.md`.

**Architecture:** A new headless `CityElements` engine (`src/game/cityElements.js`) owns per-inning rolls, timed procs, and pure modifier math. Existing systems query it: `ball.js` gains wind + restitution-scale hooks, `matchScene.js` applies carry/fielder/throw/steal scales at its existing call sites and resolves the new ground-rule double, `hud.js` shows the element chip. Zero rendering in the engine; all visuals ride existing FX (engine.shake, sprites, HUD CSS).

**Tech Stack:** Vanilla JS + three.js, vitest for tests (`npx vitest run` — gate on EXIT CODE, never `| grep`).

## Global Constraints

- Elements apply to BOTH teams (spec) — no per-side modifiers anywhere.
- No per-frame allocations in update paths (mobile perf rule).
- `cityElements.js` stays headless/pure — seedable `rng` injected, no three.js imports, no `Date.now()`.
- All 10 elements from the spec table, ids: `el-train`, `steam-vents`, `dj-drop`, `night-hustle`, `sea-breeze`, `motorcade`, `extra-bounce`, `the-hawk`, `heat-wave`, `heavy-air`.
- Coordinate note: home plate is at origin, outfield is −z (`launch()` uses `-Math.cos(dir)`), so "toward the fence" = negative z.
- Announcer VO for elements is a FOLLOW-UP asset step (ElevenLabs spend needs dev auth); code emits `vo` events that no-op gracefully until clips exist. HUD text is the guaranteed-visible channel.

---

### Task 1: Element definitions — data + registry

**Files:**
- Modify: `src/data/fields.json` (each of the 10 field objects)
- Create: `src/game/cityElements.js` (registry only in this task)
- Test: `tests/cityElements.test.js`

**Interfaces:**
- Produces: `ELEMENTS` (exported const object keyed by element id; each entry `{ label, blurb, kind }` where kind ∈ `'wind'|'carry'|'proc'|'bounce'|'steal'|'beat'|'steam'`), and each `fields.json` entry gains `"element": "<id>"`.

- [ ] **Step 1: Write the failing test**

```js
// tests/cityElements.test.js
import { describe, it, expect } from 'vitest';
import { ELEMENTS } from '../src/game/cityElements.js';
import fieldsData from '../src/data/fields.json';

const EXPECTED = {
  'blacktop': 'el-train',
  'subway-yard': 'steam-vents',
  'block-party': 'dj-drop',
  'neon-night-court': 'night-hustle',
  'boardwalk-kings': 'sea-breeze',
  'the-underpass': 'motorcade',
  'rubber-yard': 'extra-bounce',
  'winter-classic': 'the-hawk',
  'scorchyard': 'heat-wave',
  'the-crown': 'heavy-air',
};

describe('city element data', () => {
  const fields = fieldsData.fields ?? fieldsData;
  it('every field has its spec-approved element', () => {
    for (const f of fields) expect(f.element, f.id).toBe(EXPECTED[f.id]);
  });
  it('every element id resolves in the registry with label + blurb', () => {
    for (const f of fields) {
      const el = ELEMENTS[f.element];
      expect(el, f.element).toBeTruthy();
      expect(el.label.length).toBeGreaterThan(0);
      expect(el.blurb.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cityElements.test.js`
Expected: FAIL — cannot resolve `../src/game/cityElements.js`.

- [ ] **Step 3: Write minimal implementation**

Add `"element": "<id>"` to each field object in `src/data/fields.json` (top level of each entry, next to `"flavor"`), per the EXPECTED map above.

```js
// src/game/cityElements.js
// City Elements: each field's signature gameplay modifier (Street Rules pillar 1).
// Headless + seedable — matchScene queries modifiers, this file never renders.

export const ELEMENTS = {
  'el-train':     { label: 'El Train Rumble', kind: 'proc',
    blurb: 'The el roars past — timing wobbles while it rumbles.' },
  'steam-vents':  { label: 'Steam Vents', kind: 'steam',
    blurb: 'Outfield steam screens the fielders.' },
  'dj-drop':      { label: 'DJ Drop', kind: 'beat',
    blurb: 'Kick ON the beat for bonus power.' },
  'night-hustle': { label: 'Night Hustle', kind: 'steal',
    blurb: 'Runners get hot jumps under the neon.' },
  'sea-breeze':   { label: 'Sea Breeze', kind: 'wind',
    blurb: 'Onshore wind carries deep kicks out.' },
  'motorcade':    { label: 'Motorcade', kind: 'proc',
    blurb: 'Sirens sweep past — throws lose zip.' },
  'extra-bounce': { label: 'Extra Bounce', kind: 'bounce',
    blurb: 'Rubber ground: wild hops, bounce-out doubles.' },
  'the-hawk':     { label: 'The Hawk', kind: 'wind',
    blurb: 'Chicago wind bends every deep kick.' },
  'heat-wave':    { label: 'Heat Wave', kind: 'carry',
    blurb: 'Ball flies farther; fielders tire late.' },
  'heavy-air':    { label: 'Heavy Air', kind: 'carry',
    blurb: 'Harbor humidity kills deep kicks at the track.' },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cityElements.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/fields.json src/game/cityElements.js tests/cityElements.test.js
git commit -m "feat(elements): city element registry + per-field assignment"
```

---

### Task 2: CityElements engine — rolls, procs, modifiers

**Files:**
- Modify: `src/game/cityElements.js`
- Test: `tests/cityElements.test.js` (append)

**Interfaces:**
- Consumes: `ELEMENTS` from Task 1.
- Produces: `class CityElements` with this exact surface (matchScene and HUD rely on it):
  - `constructor({ elementId, rng = Math.random })`
  - `rollInning(inning)` → `{ id, label, intensity, windDirDeg }` (re-rolls state; inning is 1-based)
  - `update(dt)` → `null` or `{ proc: 'start'|'end' }` (el-train / motorcade only)
  - `procActive` (bool getter), `intensity` (0..1 getter)
  - `windAccel()` → `{ x, z }` m/s² (zero unless wind kind)
  - `carryScale()` → number (1 unless heat-wave 1→1.08 / heavy-air 1→0.91 by intensity)
  - `bounceScale()` → number (extra-bounce: 1.15→1.45 by intensity, else 1)
  - `fielderSpeedScale(inning)` → number (heat-wave fatigue: 1 − 0.05·intensity·(inning−1), floor 0.82; steam-vents: 0.75 handled positionally via `inSteam`, NOT here; else 1)
  - `throwZipScale()` → number (motorcade during proc: 0.78, else 1)
  - `stealHeadStartM()` → number (night-hustle: 1.5·intensity m, else 0)
  - `kickMods(nowS)` → `{ wobbleMs, beatBonus01 }` (el-train proc: sinusoidal ±45·intensity ms; dj-drop: +0.08 if within 70ms of a beat at 100 BPM, else 0)
  - `steamClouds()` → array of `{ x, z, r }` (steam-vents: 2 clouds rolled per inning in the outfield band, r = 7; else `[]`)
  - `inSteam(x, z)` → bool

- [ ] **Step 1: Write the failing tests (append to tests/cityElements.test.js)**

```js
import { CityElements } from '../src/game/cityElements.js';

// Deterministic rng from a fixed sequence (loops if exhausted).
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('CityElements engine', () => {
  it('rollInning returns identity + rolled intensity in [0.3, 1]', () => {
    const el = new CityElements({ elementId: 'the-hawk', rng: seq([0.5, 0.5]) });
    const r = el.rollInning(1);
    expect(r.id).toBe('the-hawk');
    expect(r.intensity).toBeGreaterThanOrEqual(0.3);
    expect(r.intensity).toBeLessThanOrEqual(1);
  });

  it('the-hawk wind direction re-rolls per inning and bends the ball', () => {
    const el = new CityElements({ elementId: 'the-hawk', rng: seq([0.9, 0.1, 0.2, 0.8]) });
    const a = el.rollInning(1).windDirDeg;
    const b = el.rollInning(2).windDirDeg;
    expect(a).not.toBe(b);
    const w = el.windAccel();
    expect(Math.hypot(w.x, w.z)).toBeGreaterThan(0.5);
  });

  it('sea-breeze always blows toward the outfield (negative z)', () => {
    const el = new CityElements({ elementId: 'sea-breeze', rng: seq([0.7]) });
    el.rollInning(1);
    expect(el.windAccel().z).toBeLessThan(0);
    expect(Math.abs(el.windAccel().x)).toBeLessThan(0.01);
  });

  it('heat-wave carries the ball and tires fielders late', () => {
    const el = new CityElements({ elementId: 'heat-wave', rng: seq([1]) });
    el.rollInning(1);
    expect(el.carryScale()).toBeGreaterThan(1.05);
    expect(el.fielderSpeedScale(1)).toBe(1);
    expect(el.fielderSpeedScale(5)).toBeLessThan(0.9);
    expect(el.fielderSpeedScale(9)).toBeGreaterThanOrEqual(0.82); // floor
  });

  it('heavy-air kills carry', () => {
    const el = new CityElements({ elementId: 'heavy-air', rng: seq([1]) });
    el.rollInning(1);
    expect(el.carryScale()).toBeLessThan(0.95);
  });

  it('extra-bounce raises restitution, others do not', () => {
    const eb = new CityElements({ elementId: 'extra-bounce', rng: seq([1]) });
    eb.rollInning(1);
    expect(eb.bounceScale()).toBeGreaterThan(1.2);
    const hw = new CityElements({ elementId: 'heat-wave', rng: seq([1]) });
    hw.rollInning(1);
    expect(hw.bounceScale()).toBe(1);
  });

  it('el-train proc cycles start→end and wobbles timing only while active', () => {
    const el = new CityElements({ elementId: 'el-train', rng: seq([0.5]) });
    el.rollInning(1);
    expect(el.procActive).toBe(false);
    expect(el.kickMods(0).wobbleMs).toBe(0);
    // march time until the proc starts (period ≤ 40s), then until it ends (≤ 6s more)
    let started = false, ended = false;
    for (let t = 0; t < 50 && !ended; t += 0.1) {
      const ev = el.update(0.1);
      if (ev?.proc === 'start') started = true;
      if (started && Math.abs(el.kickMods(t).wobbleMs) > 0) { /* wobbling */ }
      if (ev?.proc === 'end') ended = true;
    }
    expect(started).toBe(true);
    expect(ended).toBe(true);
    expect(el.procActive).toBe(false);
  });

  it('motorcade throw zip drops only during the proc', () => {
    const el = new CityElements({ elementId: 'motorcade', rng: seq([0.5]) });
    el.rollInning(1);
    expect(el.throwZipScale()).toBe(1);
    let sawDrop = false;
    for (let t = 0; t < 50; t += 0.1) {
      el.update(0.1);
      if (el.procActive) { sawDrop = el.throwZipScale() < 1; break; }
    }
    expect(sawDrop).toBe(true);
  });

  it('dj-drop pays bonus on the beat, nothing off-beat (100 BPM = 0.6s)', () => {
    const el = new CityElements({ elementId: 'dj-drop', rng: seq([1]) });
    el.rollInning(1);
    expect(el.kickMods(1.2).beatBonus01).toBeCloseTo(0.08); // exactly on beat 2
    expect(el.kickMods(1.5).beatBonus01).toBe(0);           // half-beat = off
  });

  it('night-hustle grants a steal head start, others none', () => {
    const nh = new CityElements({ elementId: 'night-hustle', rng: seq([1]) });
    nh.rollInning(1);
    expect(nh.stealHeadStartM()).toBeCloseTo(1.5);
    const sb = new CityElements({ elementId: 'sea-breeze', rng: seq([1]) });
    sb.rollInning(1);
    expect(sb.stealHeadStartM()).toBe(0);
  });

  it('steam-vents rolls 2 outfield clouds and inSteam hits inside them', () => {
    const el = new CityElements({ elementId: 'steam-vents', rng: seq([0.2, 0.6, 0.8, 0.3]) });
    el.rollInning(1);
    const clouds = el.steamClouds();
    expect(clouds.length).toBe(2);
    for (const c of clouds) {
      expect(c.z).toBeLessThan(-10);              // outfield band only
      expect(el.inSteam(c.x, c.z)).toBe(true);
      expect(el.inSteam(c.x + 20, c.z)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cityElements.test.js`
Expected: FAIL — `CityElements` not exported.

- [ ] **Step 3: Implement the engine (append to src/game/cityElements.js)**

```js
// ---- engine ----------------------------------------------------------------
// Timed-proc elements (el-train, motorcade) cycle: quiet gap → active window.
const PROC = { gapMinS: 14, gapMaxS: 34, activeS: 4.5 };
const BEAT_S = 0.6;          // dj-drop: 100 BPM
const BEAT_WINDOW_S = 0.07;  // ±70ms counts as "on the beat"
const BEAT_BONUS = 0.08;

export class CityElements {
  constructor({ elementId, rng = Math.random }) {
    this.id = elementId;
    this.def = ELEMENTS[elementId];
    this.rng = rng;
    this._intensity = 0;
    this.windDirDeg = 180; // default: blowing out (toward −z)
    this._procActive = false;
    this._procT = 0;
    this._nextProcAt = 0;
    this._clouds = [];
  }

  get intensity() { return this._intensity; }
  get procActive() { return this._procActive; }

  rollInning(inning) {
    this._intensity = 0.3 + this.rng() * 0.7;
    if (this.id === 'the-hawk') this.windDirDeg = Math.floor(this.rng() * 360);
    if (this.id === 'sea-breeze') this.windDirDeg = 180;
    if (this.id === 'steam-vents') {
      this._clouds = [0, 1].map(() => ({
        x: (this.rng() - 0.5) * 36,          // across the outfield
        z: -14 - this.rng() * 14,            // outfield band, −14…−28
        r: 7,
      }));
    }
    this._procActive = false;
    this._procT = 0;
    this._nextProcAt = PROC.gapMinS + this.rng() * (PROC.gapMaxS - PROC.gapMinS);
    return { id: this.id, label: this.def.label, intensity: this._intensity, windDirDeg: this.windDirDeg };
  }

  /** Advance proc clock. Returns {proc:'start'|'end'} on transitions, else null. */
  update(dt) {
    if (this.def.kind !== 'proc') return null;
    this._procT += dt;
    if (!this._procActive && this._procT >= this._nextProcAt) {
      this._procActive = true;
      this._procT = 0;
      return { proc: 'start' };
    }
    if (this._procActive && this._procT >= PROC.activeS) {
      this._procActive = false;
      this._procT = 0;
      this._nextProcAt = PROC.gapMinS + this.rng() * (PROC.gapMaxS - PROC.gapMinS);
      return { proc: 'end' };
    }
    return null;
  }

  /** Wind acceleration on a flying ball, m/s². windDirDeg = direction it blows TOWARD (0 = +z, 180 = −z/outfield). */
  windAccel() {
    if (this.def.kind !== 'wind' || this._intensity === 0) return { x: 0, z: 0 };
    const mag = (this.id === 'the-hawk' ? 3.4 : 2.2) * this._intensity;
    const rad = (this.windDirDeg * Math.PI) / 180;
    return { x: Math.sin(rad) * mag, z: Math.cos(rad) * mag };
  }

  carryScale() {
    if (this.id === 'heat-wave') return 1 + 0.08 * this._intensity;
    if (this.id === 'heavy-air') return 1 - 0.09 * this._intensity;
    return 1;
  }

  bounceScale() {
    return this.id === 'extra-bounce' ? 1.15 + 0.3 * this._intensity : 1;
  }

  fielderSpeedScale(inning) {
    if (this.id !== 'heat-wave') return 1;
    return Math.max(0.82, 1 - 0.05 * this._intensity * (inning - 1));
  }

  throwZipScale() {
    return this.id === 'motorcade' && this._procActive ? 0.78 : 1;
  }

  stealHeadStartM() {
    return this.id === 'night-hustle' ? 1.5 * this._intensity : 0;
  }

  /** Timing effects on the kick. nowS = scene clock seconds. */
  kickMods(nowS) {
    let wobbleMs = 0;
    let beatBonus01 = 0;
    if (this.id === 'el-train' && this._procActive) {
      wobbleMs = Math.sin(nowS * 9) * 45 * this._intensity;
    }
    if (this.id === 'dj-drop') {
      const off = Math.abs(nowS % BEAT_S);
      const toBeat = Math.min(off, BEAT_S - off);
      if (toBeat <= BEAT_WINDOW_S) beatBonus01 = BEAT_BONUS;
    }
    return { wobbleMs, beatBonus01 };
  }

  steamClouds() { return this._clouds; }

  inSteam(x, z) {
    for (const c of this._clouds) {
      if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) <= c.r * c.r) return true;
    }
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cityElements.test.js`
Expected: PASS (all tests). If the el-train proc test flakes on timing, the march loop above covers 50s > gapMax 34s + active 4.5s — check `update` transition logic, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/game/cityElements.js tests/cityElements.test.js
git commit -m "feat(elements): CityElements engine - rolls, procs, modifiers"
```

---

### Task 3: Ball physics — wind, live restitution, bounce-out detection

**Files:**
- Modify: `src/game/ball.js`
- Test: `tests/ball.test.js` (create)

**Interfaces:**
- Consumes: nothing new (pure physics).
- Produces (matchScene relies on these): `ball.wind = {x, z}` (m/s² accel, default `{x:0,z:0}`), `ball.restitutionScale = 1`, and `ball.exitedOverFence` (bool — set true the frame a ball passes the fence radius ABOVE `fenceTopY`; matchScene distinguishes homer vs ground-rule double via `ball.bounces`).

- [ ] **Step 1: Write the failing tests**

```js
// tests/ball.test.js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Ball } from '../src/game/ball.js';

const scene = { add() {} }; // Ball only calls scene.add(mesh)

function fly(ball, seconds) {
  for (let t = 0; t < seconds; t += 1 / 120) ball.update(1 / 120);
}

describe('ball element physics', () => {
  it('wind bends a flying ball sideways', () => {
    const calm = new Ball(scene);
    calm.place(new THREE.Vector3(0, 0.22, 0));
    calm.launch(20, 40, 0);
    fly(calm, 1.2);

    const windy = new Ball(scene);
    windy.place(new THREE.Vector3(0, 0.22, 0));
    windy.wind = { x: 3.0, z: 0 };
    windy.launch(20, 40, 0);
    fly(windy, 1.2);

    expect(windy.pos.x).toBeGreaterThan(calm.pos.x + 1.0);
    expect(Math.abs(calm.pos.x)).toBeLessThan(0.01);
  });

  it('restitutionScale makes bounces livelier', () => {
    const mk = (scale) => {
      const b = new Ball(scene);
      b.place(new THREE.Vector3(0, 0.22, 0));
      b.restitutionScale = scale;
      b.launch(16, 45, 0);
      // run until first bounce completes, then measure upward speed
      let last = 0;
      for (let t = 0; t < 4; t += 1 / 120) {
        b.update(1 / 120);
        if (b.bounces > 0) { last = b.vel.y; break; }
      }
      return last;
    };
    expect(mk(1.4)).toBeGreaterThan(mk(1) * 1.2);
  });

  it('a ball clearing the fence above the top sets exitedOverFence', () => {
    const b = new Ball(scene);
    b.setFence(30, 4);
    b.place(new THREE.Vector3(0, 0.22, 0));
    b.launch(26, 45, 0); // big fly, well past 30m
    fly(b, 3.5);
    expect(b.exitedOverFence).toBe(true);
  });

  it('a contained ball below the wall bounces back and never sets the flag', () => {
    const b = new Ball(scene);
    b.setFence(30, 40); // impossibly tall wall
    b.place(new THREE.Vector3(0, 0.22, 0));
    b.launch(26, 45, 0);
    fly(b, 4);
    expect(b.exitedOverFence).toBe(false);
    expect(Math.hypot(b.pos.x, b.pos.z)).toBeLessThan(30);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ball.test.js`
Expected: FAIL — wind has no effect / `exitedOverFence` undefined.

- [ ] **Step 3: Implement in src/game/ball.js**

In the constructor, after `this.fenceTopY = 9999;` add:

```js
    this.wind = { x: 0, z: 0 };      // element wind accel, m/s² (matchScene sets it)
    this.restitutionScale = 1;       // element bounce liveliness (extra-bounce > 1)
    this.exitedOverFence = false;    // set when the ball leaves the park above the wall
```

In `launch()`, after `this.onGround = false;` add:

```js
    this.exitedOverFence = false;
```

In `update()`, replace the flying-mode gravity line:

```js
    this.vel.y -= G * dt;
```

with:

```js
    this.vel.y -= G * dt;
    this.vel.x += this.wind.x * dt;
    this.vel.z += this.wind.z * dt;
```

In the fence block, the current containment only handles `y <= fenceTopY`. Add exit detection — replace:

```js
    if (this.fenceR < 900) {
      const d = Math.hypot(this.mesh.position.x, this.mesh.position.z);
      if (d >= this.fenceR && this.mesh.position.y <= this.fenceTopY) {
```

with:

```js
    if (this.fenceR < 900) {
      const d = Math.hypot(this.mesh.position.x, this.mesh.position.z);
      if (d >= this.fenceR && this.mesh.position.y > this.fenceTopY) this.exitedOverFence = true;
      if (d >= this.fenceR && this.mesh.position.y <= this.fenceTopY) {
```

In the ground-bounce branch, replace:

```js
        this.vel.y = -this.vel.y * RESTITUTION;
```

with:

```js
        this.vel.y = -this.vel.y * Math.min(0.9, RESTITUTION * this.restitutionScale);
```

(0.9 cap: a >1 coefficient would gain energy every hop and never settle.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ball.test.js`
Expected: PASS (4 tests). Then run the whole suite: `npx vitest run` — expect same pass count as `main` plus the new files (no regressions; check the EXIT CODE).

- [ ] **Step 5: Commit**

```bash
git add src/game/ball.js tests/ball.test.js
git commit -m "feat(elements): ball wind force, restitution scale, fence-exit flag"
```

---

### Task 4: MatchScene wiring — rolls, physics application, ground-rule double

**Files:**
- Modify: `src/game/matchScene.js`

**Interfaces:**
- Consumes: `CityElements` (Task 2), ball fields (Task 3), `fieldData.element` (Task 1).
- Produces: `this.elements` (a `CityElements`), bus events `element:roll` `{id, label, intensity, windDirDeg}` and `element:proc` `{id, label, active}` (HUD Task 6 listens), scene helper `this.throwSpeed()` (number, m/s).

No unit test carries this task (it's orchestration); Task 8's in-game verify covers it. Keep each step compiling — run `npx vitest run` after each to catch import slips.

- [ ] **Step 1: Construct + initial roll**

In the constructor (`src/game/matchScene.js:72`), import at top of file:

```js
import { CityElements } from './cityElements.js';
```

After `this.ball.setFence(this.fenceM, this.fenceTopY);` (line ~86):

```js
    // City element: this field's signature modifier (Street Rules pillar 1)
    this.elements = new CityElements({ elementId: fieldData.element ?? 'sea-breeze' });
    this.elementInning = 1;
    this.applyElementRoll();
```

Add these methods near the other small helpers:

```js
  applyElementRoll() {
    const roll = this.elements.rollInning(this.match.state.inning);
    const w = this.elements.windAccel();
    this.ball.wind = w;
    this.ball.restitutionScale = this.elements.bounceScale();
    this.bus.emit('element:roll', roll);
    this.bus.emit('vo', `element-${roll.id}`); // no-ops until VO assets exist
  }

  /** Element-aware throw speed — use instead of raw tuning at throw sites. */
  throwSpeed() {
    return this.tuning.throwing.throwSpeedMs * this.elements.throwZipScale();
  }
```

- [ ] **Step 2: Re-roll each new inning**

Find where the scene subscribes to `this.match.bus` (search `halfEnd` or `bus.on` in the constructor region near line 100–210). Add:

```js
    this.match.bus.on('halfEnd', () => {
      if (this.match.state.inning !== this.elementInning) {
        this.elementInning = this.match.state.inning;
        this.applyElementRoll();
      }
    });
```

- [ ] **Step 3: Drive procs from the scene update loop**

In `update(dt, rawDt)` (line ~2584), right before `this.ball.update(dt);` (line ~2592):

```js
    const procEv = this.elements.update(dt);
    if (procEv) {
      this.bus.emit('element:proc', { id: this.elements.id, label: this.elements.def.label, active: procEv.proc === 'start' });
      if (procEv.proc === 'start') this.engine.shake(this.elements.id === 'el-train' ? 0.35 : 0.15);
    }
    if (this.elements.procActive && this.elements.id === 'el-train') this.engine.shake(0.12);
```

- [ ] **Step 4: Carry scale on the kick**

In the kick resolution, immediately after `const launch = launchParams(...)` (line ~641–645):

```js
    launch.speed *= this.elements.carryScale();
```

(Both the real `this.ball.launch(...)` at line ~688 and `Ball.predictLanding(...)` at line ~693 read `launch.speed`, so flight and the fielder/foul prediction stay consistent.)

- [ ] **Step 5: Kick timing mods (wobble + beat)**

At the top of the kick-judging block (line ~600, right after `const errMs = ...`):

```js
    const mods = this.elements.kickMods(this.elapsed);
    const modErrMs = errMs + mods.wobbleMs;
```

Then replace subsequent uses of `errMs` in this function with `modErrMs` (the `effErr` calc at ~605, the `powerFromError` call at ~618, the `judgeKick` call at ~624 — keep the variable renames local to this function). After the `power01` line (~618), apply the beat bonus:

```js
    const boostedPower01 = power01 == null ? null : Math.min(1, power01 + mods.beatBonus01);
```

and pass `boostedPower01` where `power01` was used (the HR-eligibility check at ~638 and the `launchParams` opts at ~643). On-beat pay-off must be able to tip a kick into HR range — that is the fun.

- [ ] **Step 5b: AI kicks with the wind (home-advantage-by-skill, per spec)**

In `src/game/kickTiming.js`, `launchParams()`: add a wind bias to the AI aim line. After `const base = ...` / `const timingBias = ...`, change the return's direction to:

```js
    directionDeg: base + timingBias + (opts.windBiasDeg ?? 0),
```

Append to `tests/kickTiming.test.js`:

```js
it('windBiasDeg shifts the launch direction', () => {
  const judged = judgeKick(0, tuning);
  const calm = launchParams(judged, { aim: 'center', rng: () => 0.5 }, tuning);
  const windy = launchParams(judged, { aim: 'center', rng: () => 0.5, windBiasDeg: 10 }, tuning);
  expect(windy.directionDeg - calm.directionDeg).toBeCloseTo(10);
});
```

(Match the test file's existing tuning import/fixture style.) In `matchScene.js`, where the AI kick's aimSpec is assembled (search `aiKickError`, line ~568), pass the bias for AI kicks only — the human aims for themselves:

```js
    const w = this.elements.windAccel();
    if (!isPlayerKick && (w.x !== 0 || w.z !== 0)) {
      aimSpec.windBiasDeg = Math.max(-14, Math.min(14, w.x * 4)); // kick downwind
    }
```

Deeper element AI (stealing more on hustle innings, small ball in heavy air) is a listed follow-up, not this task.

- [ ] **Step 6: Fielder fatigue + steam slowdown**

Find the fielder speed accessor (search `dragSpeedMs` — line ~1428, a method that returns pursuit speed). Multiply its return value:

```js
    const elScale = this.scene?.elements
      ? this.scene.elements.fielderSpeedScale(this.scene.match.state.inning) * (this.scene.elements.inSteam(this.group.position.x, this.group.position.z) ? 0.75 : 1)
      : 1;
    return baseSpeed * elScale;
```

Adapt to the actual shape of that accessor: if it's a method on the scene itself (uses `this.tuning`), use `this.elements` / `this.match` directly and multiply every return path. If it's on a fielder unit object, give the unit a back-reference to the scene at construction (search `playerControlled` nearby to find where units are made).

- [ ] **Step 7: Throw zip (motorcade)**

Replace the raw reads of `this.tuning.throwing.throwSpeedMs` at the three throw sites with `this.throwSpeed()`:
- `flyBallToPitcher(speed = this.tuning.throwing.throwSpeedMs)` (line ~1343) → `flyBallToPitcher(speed = this.throwSpeed())`
- the duel `totalS` calc (line ~1887)
- the peg/base `this.ball.throwTo(p.clone().setY(0.9), ...)` (line ~2146)

Leave `resolveBaseThrow` (in `throwing.js`) untouched — it races abstract times; the visible throw and the race both slowing together matters more than the pure resolver, and the resolver is shared with tests. Instead, where `resolveBaseThrow` is called during an active motorcade proc, scale its input: pass `throwDistM: p.throwDistM / this.elements.throwZipScale()` (a slower throw ≡ a longer throw). Search `resolveBaseThrow(` for the call sites.

- [ ] **Step 8: Night Hustle steal head start**

Find where a steal run starts (search `new RunnerSim({ tuning: this.tuning, human: true })` at ~1086 — the steal initiation; confirm against the surrounding `stealing` state code). After the sim is created:

```js
    r.sim.progressM += this.elements.stealHeadStartM();
```

- [ ] **Step 9: Ground-rule double (extra-bounce payoff)**

In `update()` near the HR check (line ~2727), the homer requires `bounces === 0`. Add the bounced-exit branch right after it:

```js
      if (!this.grdFired && this.phase === 'LIVE' && this.ball.exitedOverFence && this.ball.bounces > 0) {
        this.grdFired = true;
        this.groundRuleDouble();
      }
```

Initialize `this.grdFired = false;` wherever `this.hrFired = false;` is set (line ~717), and add the method modeled on `homer()` (line ~2541) — read `homer()` first and mirror its play-stop/cleanup/cinematic pattern, but resolve via the rules engine's standard two-base advance:

```js
  groundRuleDouble() {
    this.hud.call('GROUND RULE DOUBLE!', 'crush');
    this.bus.emit('sfx', 'crush');
    // mirror homer()'s runner/sim cleanup here (whatever it does before applyOutcome)
    this.match.applyPlay({ type: 'double' });
    // mirror homer()'s return-to-next-at-bat flow (phase reset / serve scheduling)
  }
```

The exact cleanup lines must be copied from `homer()` at implementation time — that function is the canonical "the play ends now, everyone stop" flow.

- [ ] **Step 10: Run the suite + commit**

Run: `npx vitest run`
Expected: exit code 0, no regressions.

```bash
git add src/game/matchScene.js
git commit -m "feat(elements): wire city elements into match play - wind, carry, fatigue, zip, hustle, ground-rule double"
```

---

### Task 5: HUD — element chip, wind arrow, beat pulse, proc flash

**Files:**
- Modify: `src/ui/screens/hud.js`, `src/ui/ui.css`
- Modify: `src/game/matchScene.js` (two `bus.on` wires if HUD isn't already bus-subscribed — check how hud receives events; search `hud.` calls in matchScene)

**Interfaces:**
- Consumes: bus events `element:roll`, `element:proc` (Task 4).
- Produces: `hud.setElement({ label, intensity, windDirDeg, id })`, `hud.flashElement(active)`.

- [ ] **Step 1: Add the chip to hud.js**

Inside the `Hud` class (follow its existing DOM-building style — see how the scoreboard chips are built near the top of the class):

```js
  /** City element chip: label + intensity pips + wind arrow. */
  setElement({ id, label, intensity, windDirDeg }) {
    if (!this.elChip) {
      this.elChip = document.createElement('div');
      this.elChip.className = 'element-chip';
      this.root.appendChild(this.elChip);
    }
    const pips = '●'.repeat(Math.max(1, Math.round(intensity * 3))) + '○'.repeat(3 - Math.max(1, Math.round(intensity * 3)));
    const wind = (id === 'the-hawk' || id === 'sea-breeze')
      ? `<span class="element-wind" style="transform:rotate(${windDirDeg}deg)">➤</span>` : '';
    this.elChip.innerHTML = `${wind}<span class="element-label">${label}</span><span class="element-pips">${pips}</span>`;
  }

  flashElement(active) {
    this.elChip?.classList.toggle('element-live', active);
  }
```

- [ ] **Step 2: Style it (append to src/ui/ui.css)**

```css
/* city element chip: what's live on this block, and how hard it's blowing */
.element-chip {
  position: absolute; top: 64px; right: 10px;
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 14px;
  background: rgba(0,0,0,.55); color: #ffd75e;
  font: 700 12px/1 var(--skk-font, sans-serif);
  letter-spacing: .04em; text-transform: uppercase;
  pointer-events: none; z-index: 30;
}
.element-chip .element-pips { color: #fff; letter-spacing: .15em; }
.element-chip .element-wind { display: inline-block; font-size: 13px; }
.element-chip.element-live { animation: elementPulse .5s ease-in-out infinite alternate; }
@keyframes elementPulse { from { box-shadow: 0 0 0 0 rgba(255,215,94,.0); } to { box-shadow: 0 0 12px 2px rgba(255,215,94,.7); } }
```

(Adjust `top` if it collides with the existing scoreboard — check in the in-game verify.)

- [ ] **Step 3: Wire the bus events**

Wherever matchScene wires other hud reactions (search `this.bus.on(` in the constructor region):

```js
    this.bus.on('element:roll', (r) => this.hud.setElement(r));
    this.bus.on('element:proc', (p) => {
      this.hud.flashElement(p.active);
      if (p.active) this.hud.callout(p.label + '!', { x: window.innerWidth / 2, y: 90, dir: 'down', ttl: 1600, key: 'element-proc' });
    });
```

Emit the initial roll AFTER the hud exists: in the constructor, `applyElementRoll()` (Task 4 Step 1) must run after `this.hud` is assigned — move the call if needed.

- [ ] **Step 4: Suite + commit**

Run: `npx vitest run` — exit code 0.

```bash
git add src/ui/screens/hud.js src/ui/ui.css src/game/matchScene.js
git commit -m "feat(elements): HUD element chip with pips, wind arrow, proc flash"
```

---

### Task 6: World FX — steam puffs (the one new visual)

**Files:**
- Modify: `src/game/matchScene.js` (or `src/cinematics/fx.js` if a sprite-puff helper already fits there — read `fx.js` first and follow its pattern)

**Interfaces:**
- Consumes: `this.elements.steamClouds()` (Task 2).
- Produces: nothing downstream — pure visuals.

- [ ] **Step 1: Build the puffs**

On `element:roll` for `steam-vents` fields, place one soft sprite per cloud (reuse — never allocate per frame):

```js
  buildSteamSprites() {
    this.steamSprites ??= [];
    for (const s of this.steamSprites) s.visible = false;
    if (this.elements.id !== 'steam-vents') return;
    const clouds = this.elements.steamClouds();
    while (this.steamSprites.length < clouds.length) {
      const mat = new THREE.SpriteMaterial({ color: 0xdfe6ea, transparent: true, opacity: 0.34, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      // add to the same three.js scene object the Ball constructor received —
      // search `new Ball(` in matchScene for the correct reference name
      this.scene.add(sp);
      this.steamSprites.push(sp);
    }
    clouds.forEach((c, i) => {
      const sp = this.steamSprites[i];
      sp.position.set(c.x, 2.2, c.z);
      sp.scale.set(c.r * 2.2, c.r * 1.4, 1);
      sp.visible = true;
    });
  }
```

Call `this.buildSteamSprites()` at the end of `applyElementRoll()`. In `update()`, a gentle idle drift (no allocation):

```js
    if (this.steamSprites?.length && this.elements.id === 'steam-vents') {
      for (let i = 0; i < this.steamSprites.length; i++) {
        const sp = this.steamSprites[i];
        if (sp.visible) sp.material.opacity = 0.28 + Math.sin(this.elapsed * 0.7 + i * 2.1) * 0.08;
      }
    }
```

If a proper smoke texture exists in `public/assets/textures/` (check for smoke/fog/cloud), use it in the SpriteMaterial `map`; flat translucent grey is the acceptable fallback.

- [ ] **Step 2: Suite + commit**

Run: `npx vitest run` — exit code 0.

```bash
git add src/game/matchScene.js
git commit -m "feat(elements): steam vent sprites on Subway Yard"
```

---

### Task 7: In-game verification (the real gate) + session log + PR

**Files:**
- Modify: `SESSION_LOG.md` (append entry)

Per the verify-by-real-play rule: unit tests do NOT prove this works. Screenshot/play in the browser (claude-in-chrome — headless renders black, use the real Chrome).

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: exit code 0. Eyeball the failure-count line — never gate on grep.

- [ ] **Step 2: In-game spot checks (dev server + `?match&field=<id>`)**

For each, load the match view and verify BOTH the effect and the HUD chip:

1. `?match&field=winter-classic` — The Hawk: chip shows wind arrow + pips; kick a deep fly and watch it bend down-wind. Kick with and against the arrow — visibly different landings.
2. `?match&field=rubber-yard` — Extra Bounce: grounders visibly skip livelier; force a big bouncing hit toward the fence and confirm a GROUND RULE DOUBLE resolves (runners advance 2, next kicker steps up, no stuck phase).
3. `?match&field=scorchyard` — Heat Wave: chip present; kicks carry visibly deeper; by inning 3+ fielders visibly slower to balls.
4. `?match&field=block-party` — DJ Drop: chip present; verify an on-beat kick reports higher power than the same timing off-beat (log `power01` temporarily if needed — remove before commit).
5. `?match&field=blacktop` — El Train: within ~40s a rumble proc fires (chip pulses, callout pops, screen shakes); kicks during it feel wobbly.
6. `?match&field=subway-yard` — Steam Vents: two translucent puffs sit in the outfield, drifting; fielders slow inside them.
7. `?match&field=the-crown` and `?match&field=boardwalk-kings` — Heavy Air kills a near-wall bomb at the track / Sea Breeze carries one out.
8. Regression: play one full half-inning on `?match&field=blacktop` — pitching, kicking, fielding, base running, side switch all flow (the P0 watchdog probes still pass).

- [ ] **Step 3: Session log + PR**

Append a short SESSION_LOG.md entry (what shipped, spot-check results, known gaps). Then:

```bash
git add SESSION_LOG.md
git commit -m "docs: session log - city elements pillar 1"
gh pr create --title "feat: City Elements - every field plays different (Street Rules 1/4)" --body "..."
```

PR body: summarize the 10 elements, the physics honesty rule, and the verification evidence (screenshots). Deploy/merge stays gated on the dev's explicit "push".

---

## Follow-ups (explicitly NOT this plan)

- **Announcer VO**: generate `element-<id>` lines for Tony + Carter via `scripts/gen-announcer.mjs` (ElevenLabs spend — needs dev authorization), add to `public/assets/audio/announcer/manifest.json`.
- **Pillar 2 (Crew Heat)**: el-train perfect-through-rumble bonus emits into the heat meter when it exists.
- **Pillar 3 (Street Calls)**: uses the three new mocap clips already staged in `tools/anims-src/` (`Diving Catch.fbx`, `Fence Climb Up.fbx`, `Fence Climb Down.fbx`) — bake via `tools/retarget.html` + `scripts/anim-upload-server.mjs`.
- **Polish**: 3D wind flag/scarf mesh on the fence, heat-shimmer shader (mobile-perf gated), steam texture upgrade.

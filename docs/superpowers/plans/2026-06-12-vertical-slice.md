# Street Kickball Kings — Phase 1 Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A presentation-complete, playable vertical slice: splash video → title → team select (Monarchs vs Snappers) → coin toss → full 5-inning match on The Blacktop with touch-only controls, all cinematic types, announcer, and special moves → post-game screen.

**Architecture:** Vite SPA. WebGL canvas (Three.js + Rapier) renders only the match world; all menus/HUD are HTML/CSS overlays. Headless, unit-tested match logic in `/game` drives the 3D presentation through an event bus. All content data-driven from `/src/data/*.json`.

**Tech Stack:** Vite, Three.js (r160+), @dimforge/rapier3d-compat, Vitest, vanilla JS (no framework), HTML/CSS overlay UI. Spec: `docs/superpowers/specs/2026-06-12-street-kickball-kings-design.md`.

**Conventions for this plan:** ES modules, no TypeScript. Each logic module exports pure functions/classes with zero Three.js imports so it can be tested headlessly. Visual tasks end with a manual verification step on the touchscreen PC instead of unit tests. Commit after every task.

---

## File Structure (locked in)

```
index.html                      canvas + #ui-root overlay + portrait viewport meta
src/main.js                     boot: ScreenRouter, asset preload, engine init
src/engine/renderer.js          Three renderer, portrait camera rig, EffectComposer chain, quality toggle
src/engine/input.js             GestureInput: tap / mash-rate / swipe / drag from pointer events
src/engine/audio.js             AudioBus: music/sfx/vo channels, ducking, beat clock
src/engine/assets.js            AssetLoader: manifest-driven textures/audio/video/json
src/engine/events.js            EventBus (tiny pub/sub)
src/game/matchState.js          MatchEngine: innings/outs/score/bases state machine (headless)
src/game/kickTiming.js          timing-ring math → kick quality + launch params
src/game/baseRunning.js         runner advancement, mash→speed, juke, safe/out resolution
src/game/throwing.js            throw-to-base vs peg resolution
src/game/specialMoves.js        per-team meter charge + special kick trigger
src/game/ai.js                  pitcher pitch selection, fielder AI, AI kicker/runners
src/game/matchScene.js          3D orchestration: players, ball, physics, binds engine↔state
src/game/field.js               procedural Blacktop diorama builder (from fields.json)
src/game/characters.js          procedural low-poly humanoid + shared-skeleton animation clips
src/cinematics/director.js      camera rigs, time remap, FX spikes, graffiti stamps
src/cinematics/videoPlayer.js   fullscreen mp4 set-piece player (skippable)
src/ui/router.js                ScreenRouter: shows/hides screen modules
src/ui/screens/*.js + ui.css    splash, title, menu, teamSelect, coinToss, hud, postGame
src/meta/save.js                SaveManager (localStorage + in-memory + export codes)
src/data/teams.json             all 10 teams (Monarchs/Snappers complete w/ 8 players each)
src/data/fields.json            Blacktop complete, 9 stubs
src/data/tuning.json            every gameplay tuning value
public/assets/...               logos, video, audio, textures (supplied + Higgsfield)
tests/*.test.js                 Vitest suites per logic module
```

---

### Task 1: Scaffold project

**Files:** Create `package.json`, `vite.config.js`, `index.html`, `src/main.js`, `.gitignore`

- [ ] **Step 1:** Run:
```bash
npm create vite@latest . -- --template vanilla
npm i three @dimforge/rapier3d-compat
npm i -D vitest
```
- [ ] **Step 2:** Replace `index.html` body with:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<body>
  <canvas id="game-canvas"></canvas>
  <div id="ui-root"></div>
  <script type="module" src="/src/main.js"></script>
</body>
```
- [ ] **Step 3:** Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`. Add `vite.config.js` exporting `{ base: './' }` (Capacitor-friendly relative paths).
- [ ] **Step 4:** `npm run dev` → blank page, no console errors. `npm test` → "no test files found" (exit 0 with `--passWithNoTests` added to the script).
- [ ] **Step 5:** Commit: `chore: scaffold vite + three + rapier + vitest`

### Task 2: Import supplied assets

**Files:** Create `public/assets/**`, `src/data/assets.manifest.json`

- [ ] **Step 1:** Copy with PowerShell (note `teamssss` numbering → names):
```
Downloads\teamssss\2.png  → public/assets/logos/monarchs.png
Downloads\teamssss\3.png  → public/assets/logos/funk.png
Downloads\teamssss\4.png  → public/assets/logos/snappers.png
Downloads\teamssss\5.png  → public/assets/logos/marauders.png
Downloads\teamssss\6.png  → public/assets/logos/metros.png
Downloads\teamssss\7.png  → public/assets/logos/kestrals.png
Downloads\teamssss\8.png  → public/assets/logos/gilas.png
Downloads\teamssss\9.png  → public/assets/logos/hustlers.png
Downloads\teamssss\10.png → public/assets/logos/threshers.png
Downloads\Untitled design.png                      → public/assets/branding/logo-square.png
Downloads\ChatGPT Image Jun 3, 2026, 01_09_01 PM.png → public/assets/branding/logo-poster.png
Downloads\seedance-2.0_...mp4                      → public/assets/video/splash-intro.mp4
Downloads\Red Rubber Felony.mp3                    → public/assets/audio/theme-red-rubber-felony.mp3
```
- [ ] **Step 2:** Write `src/data/assets.manifest.json` listing each asset `{ id, type: "texture"|"audio"|"video"|"image", url }` for everything above.
- [ ] **Step 3:** Verify files exist in `public/assets` and load in browser (open one URL directly from the dev server).
- [ ] **Step 4:** Commit: `feat: import supplied logos, branding, splash video, theme song`

### Task 3: Tuning + team/field data

**Files:** Create `src/data/tuning.json`, `src/data/teams.json`, `src/data/fields.json`

- [ ] **Step 1:** `tuning.json` — every gameplay constant, exactly these keys (consumed by later tasks):
```json
{
  "match": { "innings": 5, "outsPerHalf": 3 },
  "pitch": {
    "types": {
      "fastball": { "speedMph": [78, 88], "curve": 0, "bounce": 0 },
      "curver":   { "speedMph": [62, 72], "curve": 0.6, "bounce": 0 },
      "bouncer":  { "speedMph": [58, 68], "curve": 0, "bounce": 0.8 },
      "changeup": { "speedMph": [48, 58], "curve": 0.15, "bounce": 0 }
    },
    "plateDistanceM": 12
  },
  "kick": {
    "perfectWindowMs": 45, "goodWindowMs": 110, "okWindowMs": 200,
    "power":   { "PERFECT": 1.0, "GOOD": 0.78, "OK": 0.55, "FOUL": 0.3 },
    "loftDeg": { "PERFECT": 32, "GOOD": 38, "OK": 24, "FOUL": 55 },
    "maxBallSpeedMs": 33, "aimSpreadDeg": 35
  },
  "running": {
    "baseSpeedMs": 4.0, "maxSpeedMs": 8.5, "speedPerTapHz": 0.9,
    "tapWindowMs": 1000, "jukeOffsetM": 1.2, "jukeCooldownMs": 600, "basePathM": 16
  },
  "throwing": { "throwSpeedMs": 22, "pegHitRadiusM": 0.55, "aiThrowErrorM": { "Rookie": 1.2, "Street": 0.6, "King": 0.25 } },
  "fielding": { "dragSpeedMs": 7.5, "catchCircleStartM": 2.2, "catchCircleMs": 900 },
  "special": { "meterMax": 100, "gain": { "PERFECT": 35, "catch": 25, "peg": 30, "homerun": 40 }, "powerMult": 1.35 },
  "ai": {
    "Rookie": { "kickTimingErrMs": [40, 160], "fieldReactMs": 550, "jukeChance": 0.15 },
    "Street": { "kickTimingErrMs": [20, 100], "fieldReactMs": 350, "jukeChance": 0.4 },
    "King":   { "kickTimingErrMs": [5, 60],  "fieldReactMs": 200, "jukeChance": 0.7 }
  }
}
```
- [ ] **Step 2:** `teams.json` — array of 10. Monarchs and Snappers complete; other 8 with identity fields filled and `"roster": []` + `"status": "phase3"`. Schema per team:
```json
{
  "id": "monarchs", "city": "Baltimore", "name": "Maryland Monarchs",
  "colors": { "primary": "#F5B312", "secondary": "#C8102E", "accent": "#111111" },
  "logo": "assets/logos/monarchs.png",
  "anthem": null, "introVideo": "assets/video/intro-monarchs.mp4",
  "musicGenre": "Baltimore club / boom bap",
  "special": { "id": "crown-crusher", "label": "CROWN CRUSHER" },
  "homeField": "the-crown",
  "roster": [
    { "id": "m1", "nick": "King Reese", "pos": "Captain", "stats": { "power": 9, "speed": 6, "arm": 7, "glove": 6 },
      "look": { "skin": 4, "hair": "locs", "build": "tank", "fit": "sleeveless", "accessory": "chain" } }
  ]
}
```
Invent 8 players each for Monarchs and Snappers (street nicknames, varied looks per spec §Teams, stats 3–9 averaging ~6, no two looks alike). Bullies entry uses `"logo": "assets/logos/bullies.png"` (generated in Task 16).
- [ ] **Step 3:** `fields.json` — The Blacktop complete: `{ "id": "blacktop", "label": "The Blacktop", "homeTeam": "bullies", "fenceM": 38, "flavor": "none", "sky": "day", "palette": {...}, "status": "ready" }`; the other 9 entries from the spec table with `"status": "phase3"`.
- [ ] **Step 4:** Add `tests/data.test.js`: parse all three JSON files; assert 10 teams, unique ids, Monarchs+Snappers rosters length 8, every `homeField` exists in fields.json, tuning has all top-level keys above. Run `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat: tuning, teams, fields data (Monarchs/Snappers complete)`

### Task 4: EventBus + SaveManager (TDD)

**Files:** Create `src/engine/events.js`, `src/meta/save.js`, `tests/save.test.js`

- [ ] **Step 1:** Write failing tests:
```js
import { describe, it, expect } from 'vitest';
import { EventBus } from '../src/engine/events.js';
import { SaveManager } from '../src/meta/save.js';

it('bus subscribes/emits/unsubscribes', () => {
  const bus = new EventBus(); let got = null;
  const off = bus.on('x', v => got = v);
  bus.emit('x', 42); expect(got).toBe(42);
  off(); bus.emit('x', 7); expect(got).toBe(42);
});
it('save roundtrips through memory backend and export codes', () => {
  const sm = new SaveManager({ backend: 'memory' });
  sm.set('xp', 120); sm.set('crowns', 35);
  expect(sm.get('xp')).toBe(120);
  const code = sm.exportCode();
  const sm2 = new SaveManager({ backend: 'memory' });
  sm2.importCode(code);
  expect(sm2.get('crowns')).toBe(35);
});
```
- [ ] **Step 2:** Run `npm test` → FAIL (modules missing).
- [ ] **Step 3:** Implement. `EventBus`: `on(evt, fn)→off()`, `emit(evt, payload)`. `SaveManager`: constructor picks `localStorage` if available else memory `Map`; `get/set/getAll`; `exportCode()` = base64(JSON), `importCode(code)` parses and replaces state. Wrap `localStorage` access in try/catch (private-mode safety).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat: event bus and save manager with export codes`

### Task 5: MatchEngine state machine (TDD)

**Files:** Create `src/game/matchState.js`, `tests/matchState.test.js`

The headless core. States: `PRE_PITCH → PITCHING → BALL_LIVE → RESOLVING → (PRE_PITCH | HALF_END | GAME_END)`. It knows nothing about 3D; `matchScene.js` feeds it resolved play outcomes.

- [ ] **Step 1:** Write failing tests covering the full rule set:
```js
import { MatchEngine } from '../src/game/matchState.js';
const cfg = { innings: 5, outsPerHalf: 3 };
const newGame = () => new MatchEngine({ home: 'monarchs', away: 'snappers' }, cfg);

it('starts top of 1st, away kicks first by default', () => {
  const m = newGame();
  expect(m.state.inning).toBe(1); expect(m.state.half).toBe('top');
  expect(m.kickingSide()).toBe('away');
});
it('coin toss winner can elect to kick', () => {
  const m = new MatchEngine({ home: 'monarchs', away: 'snappers' }, cfg, { firstKick: 'home' });
  expect(m.kickingSide()).toBe('home');
});
it('three outs flips the half and resets bases', () => {
  const m = newGame();
  m.applyPlay({ type: 'out' }); m.applyPlay({ type: 'out' });
  m.applyPlay({ type: 'single' });
  m.applyPlay({ type: 'out' });
  expect(m.state.half).toBe('bottom'); expect(m.state.outs).toBe(0);
  expect(m.state.bases).toEqual([null, null, null]);
});
it('home run scores runner + kicker', () => {
  const m = newGame();
  m.applyPlay({ type: 'single' }); m.applyPlay({ type: 'homerun' });
  expect(m.state.score.away).toBe(2);
});
it('single advances runners one base, forced runs score from third', () => {
  const m = newGame();
  m.applyPlay({ type: 'single' }); m.applyPlay({ type: 'single' }); m.applyPlay({ type: 'single' });
  expect(m.state.bases.filter(Boolean).length).toBe(3);
  m.applyPlay({ type: 'single' });
  expect(m.state.score.away).toBe(1);
});
it('game ends after configured innings with a winner', () => {
  const m = newGame();
  for (let half = 0; half < 10; half++) {
    if (m.kickingSide() === 'away' && m.state.inning === 1 && m.state.half === 'top') m.applyPlay({ type: 'homerun' });
    for (let o = 0; o < 3; o++) m.applyPlay({ type: 'out' });
  }
  expect(m.state.phase).toBe('GAME_END'); expect(m.winner()).toBe('away');
});
it('emits events for cinematics', () => {
  const m = newGame(); const seen = [];
  m.bus.on('play', p => seen.push(p.type));
  m.applyPlay({ type: 'homerun' });
  expect(seen).toEqual(['homerun']);
});
```
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `MatchEngine`: `state = { inning, half, outs, score: {home, away}, bases: [k1,k2,k3], phase, kickerIdx: {home:0, away:0} }`. `applyPlay({type})` handles `out | single | double | triple | homerun | walkoff-irrelevant`; advances/forces runners (single=1 base, double=2, triple=3); increments outs and flips half at `outsPerHalf` (reset bases, rotate kicking order); ends game after final bottom half unless tied (extra innings until not tied); `bus = new EventBus()`, emits `play`, `halfEnd`, `gameEnd`, `score`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat: headless match engine with full kickball rules`

### Task 6: Kick timing math (TDD)

**Files:** Create `src/game/kickTiming.js`, `tests/kickTiming.test.js`

- [ ] **Step 1:** Failing tests:
```js
import { judgeKick, launchParams } from '../src/game/kickTiming.js';
import tuning from '../src/data/tuning.json';
it('classifies timing error into quality bands', () => {
  expect(judgeKick(0, tuning).quality).toBe('PERFECT');
  expect(judgeKick(-44, tuning).quality).toBe('PERFECT');
  expect(judgeKick(80, tuning).quality).toBe('GOOD');
  expect(judgeKick(-150, tuning).quality).toBe('OK');
  expect(judgeKick(300, tuning).quality).toBe('FOUL');
});
it('perfect kick gets max power and slow-mo flag', () => {
  const k = judgeKick(10, tuning);
  expect(k.power).toBe(1.0); expect(k.cinematic).toBe(true);
});
it('launchParams maps quality+aim to a velocity vector', () => {
  const v = launchParams(judgeKick(0, tuning), { aim: 'center' }, tuning);
  expect(v.speed).toBeCloseTo(tuning.kick.maxBallSpeedMs);
  expect(v.loftDeg).toBe(tuning.kick.loftDeg.PERFECT);
  expect(Math.abs(v.directionDeg)).toBeLessThan(5);
});
```
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement: `judgeKick(errorMs, tuning)` → `{ quality, power, cinematic }` using window thresholds (abs error). `launchParams(judged, {aim}, tuning)` → `{ speed, loftDeg, directionDeg }`; aim `left|center|right|bunt` maps to −spread/0/+spread degrees, bunt = OK loft at 0.25 power. Early/late errors bias direction (late pulls toward aim side opposite handedness — keep simple: late = +8°, early = −8°).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat: kick timing judgment and launch params`

### Task 7: Base running + mash/juke (TDD)

**Files:** Create `src/game/baseRunning.js`, `tests/baseRunning.test.js`

- [ ] **Step 1:** Failing tests:
```js
import { mashSpeed, RunnerSim } from '../src/game/baseRunning.js';
import tuning from '../src/data/tuning.json';
it('tap rate maps to speed, capped', () => {
  expect(mashSpeed(0, tuning)).toBe(tuning.running.baseSpeedMs);
  expect(mashSpeed(3, tuning)).toBeCloseTo(4.0 + 3 * 0.9);
  expect(mashSpeed(20, tuning)).toBe(tuning.running.maxSpeedMs);
});
it('runner advances along base path over time and arrives', () => {
  const r = new RunnerSim({ fromBase: 0, tuning });
  for (let t = 0; t < 60; t++) r.tick(0.1, 6 /*taps/sec*/);
  expect(r.arrived).toBe(true);
});
it('juke applies lateral offset then decays, with cooldown', () => {
  const r = new RunnerSim({ fromBase: 0, tuning });
  expect(r.juke('left')).toBe(true);
  expect(r.lateral).toBeCloseTo(-tuning.running.jukeOffsetM);
  expect(r.juke('right')).toBe(false); // cooldown
});
```
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement: `mashSpeed(tapsPerSec, tuning)`; `RunnerSim` with `progressM` along `basePathM`, `tick(dt, tapsPerSec)`, `arrived`, `lateral` (decays toward 0 at 3 m/s), `juke(dir)` honoring `jukeCooldownMs` via accumulated time.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat: base running sim with tap-mash speed and jukes`

### Task 8: Throwing + peg resolution (TDD)

**Files:** Create `src/game/throwing.js`, `tests/throwing.test.js`

- [ ] **Step 1:** Failing tests:
```js
import { resolveBaseThrow, resolvePeg } from '../src/game/throwing.js';
import tuning from '../src/data/tuning.json';
it('out when ball beats runner to the base', () => {
  const r = resolveBaseThrow({ throwDistM: 15, runnerRemainingM: 8, runnerSpeedMs: 5 }, tuning);
  expect(r.out).toBe(false); // runner needs 1.6s, ball needs 0.68s → wait: out should be true
});
it('peg hits when predicted runner position within radius (no juke)', () => {
  const r = resolvePeg({ throwDistM: 10, runnerLateralM: 0 }, tuning);
  expect(r.hit).toBe(true);
});
it('juke lateral offset dodges the peg', () => {
  const r = resolvePeg({ throwDistM: 10, runnerLateralM: 1.2 }, tuning);
  expect(r.hit).toBe(false);
});
```
(Fix the first assertion to `expect(r.out).toBe(true)` — ball arrives first.)
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement: `resolveBaseThrow` compares `throwDistM / throwSpeedMs` vs `runnerRemainingM / runnerSpeedMs` → `{ out, marginS }` (tie goes to runner). `resolvePeg` → `{ hit }` when `abs(runnerLateralM) < pegHitRadiusM`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat: throw and peg resolution`

### Task 9: Special move meter (TDD)

**Files:** Create `src/game/specialMoves.js`, `tests/specialMoves.test.js`

- [ ] **Step 1:** Failing tests: meter starts 0; `add('PERFECT')` adds 35; caps at 100; `ready` true at 100; `consume()` resets and returns team special `{ id, label, powerMult: 1.35 }` from teams.json entry.
- [ ] **Step 2:** FAIL → **Step 3:** implement `SpecialMeter(teamData, tuning)` → **Step 4:** PASS → **Step 5:** Commit: `feat: special move meter`.

### Task 10: GestureInput (TDD)

**Files:** Create `src/engine/input.js`, `tests/input.test.js`

- [ ] **Step 1:** Failing tests drive it with synthetic events (no DOM — feed `handleDown/Move/Up(x, y, tMs)` directly):
```js
import { GestureInput } from '../src/engine/input.js';
it('detects tap (short, no travel)', () => {
  const g = new GestureInput(); const got = [];
  g.on('tap', e => got.push(e));
  g.handleDown(100, 100, 0); g.handleUp(102, 101, 120);
  expect(got.length).toBe(1);
});
it('detects horizontal swipe direction', () => {
  const g = new GestureInput(); let dir = null;
  g.on('swipe', e => dir = e.dir);
  g.handleDown(200, 300, 0); g.handleMove(120, 305, 80); g.handleUp(90, 306, 140);
  expect(dir).toBe('left');
});
it('tracks taps-per-second over a rolling window', () => {
  const g = new GestureInput();
  for (let i = 0; i < 5; i++) { g.handleDown(50, 50, i * 100); g.handleUp(50, 50, i * 100 + 40); }
  expect(g.tapRate(500)).toBeGreaterThan(4);
});
it('emits continuous drag positions', () => {
  const g = new GestureInput(); const pts = [];
  g.on('drag', e => pts.push(e));
  g.handleDown(10, 10, 0); g.handleMove(40, 60, 100); g.handleMove(80, 90, 200); g.handleUp(80, 90, 300);
  expect(pts.length).toBe(2);
});
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement thresholds: tap = up within 250ms and <12px travel; swipe = >60px horizontal travel within 300ms, `dir` by sign; drag = any move while down beyond 12px emits `{x, y, dx, dy}`; `tapRate(windowMs, nowMs?)` counts recent taps from a ring buffer. Add `attach(element)` that maps `pointerdown/move/up` → handlers (touch and mouse both arrive as pointer events; this is the touch-parity guarantee).
- [ ] **Step 4:** PASS. **Step 5:** Commit: `feat: unified touch gesture input (tap/mash/swipe/drag)`

### Task 11: Renderer + post-FX + Blacktop field

**Files:** Create `src/engine/renderer.js`, `src/game/field.js`, modify `src/main.js`

- [ ] **Step 1:** `renderer.js`: `createEngine(canvas)` → `{ scene, camera, composer, setQuality(q), onFrame(cb), shake(intensity), timeScale }`. Portrait camera: FOV 55, positioned behind/above home plate looking toward the pitcher (mockup framing). EffectComposer: RenderPass + UnrealBloomPass (strength 0.6, radius 0.4, threshold 0.85); High quality adds vignette+chromatic-aberration ShaderPass (write a single combined fragment shader). `timeScale` multiplies the dt passed to `onFrame` subscribers (cinematics use this for slow-mo). `shake(i)` applies decaying random camera offset.
- [ ] **Step 2:** `field.js`: `buildField(fieldData, scene)` builds The Blacktop procedurally: asphalt plane w/ painted diamond + hand-painted base squares (canvas-generated texture), chain-link fences (alpha-mapped planes) at `fenceM`, 2 brick wall facades, bleachers with instanced crowd billboards (InstancedMesh, ≥120 sprites), hemisphere + directional light (daytime), sky gradient dome. Budget: log `renderer.info.render.triangles` and assert < 200k in console.
- [ ] **Step 3:** Wire `main.js` to boot the engine and render the empty field.
- [ ] **Step 4:** Manual verify (touchscreen PC): field renders in portrait, 60fps (devtools FPS meter), bloom visible on bright surfaces, triangle count logged < 200k.
- [ ] **Step 5:** Commit: `feat: renderer with post-fx chain and procedural Blacktop field`

### Task 12: Procedural characters + animation

**Files:** Create `src/game/characters.js`

- [ ] **Step 1:** `buildPlayer(look, colors)` → THREE.Group low-poly humanoid (~3k tris) from primitives: capsule torso (jersey color), head sphere (skin tone palette index), hair mesh by type (`locs|afro|braids|fade|durag|cap`), boxy sneakers (accent color), optional chain/headband. Store joints (`hips, torso, head, armL/R, legL/R`) for animation.
- [ ] **Step 2:** `Animator` — procedural keyframe poses interpolated per joint, clips: `idle` (sway + personality variant by `look.build`), `run` (leg/arm cycle scaled by speed), `windup`+`kick` (plant leg, swing leg arc — contact frame exposed as `onContact` callback so the ball launches exactly when the foot meets it), `throw`, `catch`, `stumble` (peg reaction), `dance1..4` (distinct hip-hop loops: shoot-dance-style arm swing, shuffle, spin+pose, bounce+arm-wave), `dejected` (slumped walk, head down, hands to head intro). Each clip is a function of normalized time → joint rotations; no external animation files.
- [ ] **Step 3:** Dev harness: temporary `?dance=1` URL param renders one player cycling all clips on the field.
- [ ] **Step 4:** Manual verify: 2 distinct-looking players, kick contact frame visibly connects foot to a sphere at plate height, all 4 dances and dejected read clearly.
- [ ] **Step 5:** Commit: `feat: procedural characters with full animation set`

### Task 13: Match scene — playable game

**Files:** Create `src/game/matchScene.js`, `src/game/ai.js`, `src/ui/screens/hud.js`, `src/ui/ui.css`

This is the big integration task: MatchEngine + Rapier ball + characters + gestures + HUD = a playable match (no cinematics yet — stub the bus listeners).

- [ ] **Step 1:** Rapier world: ground collider, ball rigid body (radius 0.35m, restitution 0.55). `kickBall(launchParams)` sets velocity from speed/loft/direction. Ball trail: short ribbon mesh.
- [ ] **Step 2:** Kicking flow: AI pitcher rolls ball (pitch type + speed from `ai.js` pickPitch; speed readout event to HUD). Aim set by pre-pitch drag (left/center/right zones + down-flick = bunt). Tap during approach → `judgeKick(ballArrivalT - tapT)`; play `kick` clip; launch on `onContact` frame. FOUL/MISS handling: strike counter, 3 strikes = out.
- [ ] **Step 3:** Defense resolution (player kicks): AI fielders run to predicted landing point (react delay from tuning), catch circle on flies (`catch` → out event), else field + AI throw decision (lead base, error radius by difficulty). Runner control: HUD shows TAP TO RUN zone; `tapRate` drives `RunnerSim`; swipe = juke; peg attempts resolved via `resolvePeg` with live runner lateral.
- [ ] **Step 4:** Offense↔defense flip: player fields with drag-to-move (fielder seeks finger ground-projection), auto-switch nearest fielder, catch via shrinking circle tap timing, then **base indicator overlay: 1ST / 2ND / 3RD / HOME buttons in a diamond + center PEG button**; AI runners decide advance/hold and juke by difficulty.
- [ ] **Step 5:** `hud.js`: score bug (LED bodega style), inning + spray-dot outs, pitch readout ("FASTBALL 82 MPH"), timing ring (DOM circle animated around the ball's screen position), special meter, TAP TO RUN / throw overlays. All DOM, styled mockup-dark + graffiti accents.
- [ ] **Step 6:** Wire play outcomes into `MatchEngine.applyPlay`, game over → `gameEnd` event.
- [ ] **Step 7:** Manual verify checklist: full 5-inning match playable touch-only — kick, run (mash + juke), field (drag), throw (base buttons + PEG), score updates, game ends with winner. 60fps held.
- [ ] **Step 8:** Commit: `feat: fully playable match loop with touch controls`

### Task 14: Cinematic director + all cutscene types

**Files:** Create `src/cinematics/director.js`, graffiti stamp CSS in `ui.css`

- [ ] **Step 1:** `CinematicDirector(engine, bus)`: subscribes to match events; runs camera scripts (lerp rigs: orbit, low hero, crash zoom, ball-follow dolly) with `engine.timeScale` ramping; FX spikes (bloom strength surge, vignette pulse); DOM graffiti stamps (spray-in animation via CSS mask + scale/rotate keyframes) + sound sting hooks. All skippable on tap (restore timeScale/camera instantly).
- [ ] **Step 2:** Implement the five scripted moments from the spec:
  - **Perfect kick:** 0.2x ramp at contact, crash zoom on foot, **fire + lightning on the ball** (fire = additive-blended sprite particles, lightning = jagged line segments regenerating every 50ms around the ball, both attached while quality === PERFECT), bass-drop hook, screen shake.
  - **CROWNED! (home run):** dolly follows ball arc, stamp, then kicker `dance{1-4}` celebration close-up.
  - **ROBBED! (catch out):** hero angle on the catch, cut to kicker `dejected` clip close-up.
  - **PEGGED!:** stumble replay from low angle, comic stamp.
  - **Coin toss:** both captains at the plate, slow-mo spinning coin (cylinder + 0.15x ramp), announcer call, crowd swell — returns the toss result to the flow.
- [ ] **Step 3:** Manual verify: trigger each via a dev panel (`?cine=crowned` etc.) and in real play; all tap-skippable.
- [ ] **Step 4:** Commit: `feat: cinematic director with all five scripted moments`

### Task 15: UI screens + audio + full flow

**Files:** Create `src/ui/router.js`, `src/ui/screens/{splash,title,menu,teamSelect,coinToss,postGame}.js`, `src/cinematics/videoPlayer.js`, `src/engine/audio.js`, `src/engine/assets.js`

- [ ] **Step 1:** `ScreenRouter`: one active screen module in `#ui-root`, `go(name, params)`; screens are `{ mount(root, ctx), unmount() }`.
- [ ] **Step 2:** Flow per spec: **Splash** (`videoPlayer` plays `splash-intro.mp4` fullscreen every launch, tap-skip) → **Title** (poster-style logo, *Red Rubber Felony* starts on first user gesture, TAP TO START pulsing to the beat — `AudioBus.beatClock` from a fixed BPM constant per track) → **Menu** (mockup home layout: profile strip, daily-challenge card stub, big PLAY) → **TeamSelect** (two-column: logos, colors, spray-paint stat bars from roster averages, rotating 3D showcase of team captain rendered to an offscreen canvas, intro-video button) → **CoinToss** (in-engine ceremony from Task 14; winner picks KICK FIRST / FIELD FIRST) → match → **PostGame** (mixtape tracklist: line score, MVP, XP + Crowns earned via SaveManager).
- [ ] **Step 3:** `AudioBus`: music/sfx/vo gain nodes, `duck(channel)` during VO, record-scratch transition stinger between screens (placeholder synth until Task 16 assets).
- [ ] **Step 4:** Manual verify: complete loop splash→title→menu→select→toss→match→postgame→menu without reload; theme plays; menus bounce on beat; everything tappable.
- [ ] **Step 5:** Commit: `feat: complete screen flow with audio bus`

### Task 16: Higgsfield asset batch 1 + integration

**Files:** Create `public/assets/{logos/bullies.png, video/intro-monarchs.mp4, video/intro-snappers.mp4, audio/vo/*.mp3, audio/sfx/*.mp3, textures/blacktop/*}`; modify manifest + teams.json

Generated via Higgsfield MCP (`generate_image`, `generate_video`, `generate_audio`), per the "go all out" decision. Poll `job_status`, download results into `public/assets`.

- [ ] **Step 1:** **Bullies logo** — `generate_image`: graffiti-style red kickball with gold crown, "BROOKLYN BULLIES" brush script, matching the supplied mockup logo and the 9 retro sports logos; transparent/black background, square.
- [ ] **Step 2:** **Team intro videos** (Monarchs, Snappers) — `generate_video` in the style of the supplied seedance splash: team colors, logo reveal, street kickball energy, ~6–8s, portrait-friendly.
- [ ] **Step 3:** **Announcer VO** — `generate_audio` (or TTS-style audio gen): hype radio-DJ reads, ≥3 variants each: play-ball, perfect-kick reaction, "OHHHH HE GOT PEGGED!", home-run call ("CROWNED!"), robbed call, coin-toss intro, game-over call.
- [ ] **Step 4:** **Blacktop textures + sky** — asphalt w/ painted lines, graffiti decals for fences/walls, day skybox panorama; apply in `field.js` via manifest (replacing canvas-generated placeholders where better).
- [ ] **Step 5:** **SFX/music beds** — bass-drop sting, record scratch, crowd swell loop, in-match beat loop.
- [ ] **Step 6:** Wire everything through `assets.manifest.json`; VO triggers on director events with channel ducking.
- [ ] **Step 7:** Manual verify: intros play from team select; announcer fires on events; field wears generated textures; no missing-asset 404s.
- [ ] **Step 8:** Commit: `feat: first Higgsfield asset batch (Bullies logo, intros, VO, textures)`

### Task 17: Slice hardening

**Files:** Modify as needed; create `docs/superpowers/specs/playtest-checklist.md`

- [ ] **Step 1:** Quality toggle verified: Low = bloom-only path, High = full chain; settings screen sliders persist via SaveManager.
- [ ] **Step 2:** Run full Vitest suite → PASS. Fix anything broken by integration.
- [ ] **Step 3:** Full playtest checklist doc (every control, every cinematic, every screen) — walk it once on the touchscreen PC, fix what fails, check off.
- [ ] **Step 4:** Commit: `chore: vertical slice hardening + playtest checklist`. Tag `v0.1-slice`.

---

## Self-review notes

- Spec coverage: controls (§Controls — Tasks 10/13), rules (§Match rules — Task 5), special moves (Task 9/13), all five cinematics incl. fire+lightning, dance, dejected, coin toss (§Cinematics — Task 14), flow + theme song + splash-every-launch (§UI/UX — Task 15), announcer + Bullies logo + intro videos + textures (§Higgsfield plan — Task 16), SaveManager/XP/Crowns earn-out (Task 4/15), 60fps + quality toggle + budgets (Tasks 11/17). Daily challenges, streaks, chemistry, gear shop, season, derby, practice = Phases 3–4 by design (menu shows stubs only).
- Type consistency: `judgeKick → {quality, power, cinematic}` consumed by `launchParams` and Task 13/14; `RunnerSim.lateral` consumed by `resolvePeg`; tuning keys in Task 3 match all consumers.

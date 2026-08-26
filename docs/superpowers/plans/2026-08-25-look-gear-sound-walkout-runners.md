# Look, Gear, Sound, Walk-up & Runners — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 2026-08-25 punch-list round: MSAA + a global light lift; gear that is usable and visible (POWER KICK charges, cleat speed + trail + ring, YOUR GEAR strip, Locker turntable preview, 7 new kicks + 5 taunts with realistic unlocks); sound on every event; the lineup show replaced by splash cards and a per-at-bat kicker walk-up + taunt; a no-repeat HR dance bag; off-screen runner arrows + a live diamond.

**Architecture:** Every new behavior gets a headless pure module under vitest (`perfWatchdog`, `powerKicks`, `DanceBag`, `gearLine`, `walkup`, `pregame`, `runnerArrows`) and `MatchScene`/`Hud`/renderer only wire them. New clips ship as a lazy pack `mocap-k-<arch>.glb` through the existing bake tool (generalized to N packs). SFX flow stays `bus.emit('sfx', alias)` → `AudioBus` alias table. The Locker preview is a self-contained mini renderer that reuses the match character builder.

**Tech Stack:** Vite 8, three r184 (EffectComposer / WebGLRenderTarget MSAA, GLTF/FBX loaders), vitest 4, Playwright WebKit harness (`scripts/*-e2e.mjs`), ElevenLabs sound-generation (`scripts/gen-sfx.mjs`, key in `.env.local`), bake harness `tools/retarget.html` + sink `scripts/anim-upload-server.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-25-look-gear-sound-walkout-runners-design.md`

## Global Constraints

- Phone-first: every feature must be SEEN / UNDERSTOOD / FELT on a portrait phone (spec law).
- MSAA `samples: 4` default; `?msaa=N` override (0/2/4); watchdog threshold **24 ms** over a **3 s** window, steps 4 → 2 → 0, one-way per session.
- Light lift (verbatim): ambient ×1.65, hemisphere ×1.4, rim 0.28 → 0.5, env 0.3 → 0.5 (backdrop env 0.55 → 0.7), exposure 1.22 → 1.35, grain 0.028 → 0.008, CA → 0, vignette 0.3 → 0.18, saturation 1.12 → 1.2, character emissive → 0.4, roughness → 0.7.
- POWER KICK: equipped kick = **2 charges** at match start; full crown meter = **+1 charge** and meter resets; charge consumed **at launch**; arming refunds on the next at-bat.
- Cleat `speedMult`: fire 1.06, ice 1.06 (+ `stealMult` 1.1), volt 1.08, royal 1.08, black 1.10, gold 1.12. Trail above **80 %** of `tuning.running.maxSpeedMs`. `CLEAT_BOOST` 1.6.
- SFX aliases (exact): `ui-tap`, `ui-confirm`, `score`, `safe`, `out`, `tag`, `foul`, `inning`, `crown-tick`, `crown-arm`, `countdown`, `unlock`, `stomp`, `cheer-big`, `boo`. Regenerate `kick`, `catch`, `peg`, `crowd-cheer`. Every name goes in `FILES.sfx` **and** `SFX_ALIAS` **and** `WARM_LIST` — an unmapped alias is silently dropped.
- Pack k clip names (exact): `kickMartelo`, `kickArmada`, `kickScissor`, `kickPunt`, `kickFlip`, `kickBicycle`, `kickKipUp`, `tauntPoint`, `tauntCry`, `tauntChest`, `tauntGesture`, `tauntLoser`. Kicks: `loop:false, inPlace:true, rate:1.1, contactAt` from the analyzer. Taunts: `loop:false, inPlace:true, bakeHz:15, trim ≤ 1.8 s`. Budget 900 KB per archetype.
- Gear ids (exact): `kick-martelo`, `kick-armada`, `kick-scissor`, `kick-punt`, `kick-flip`, `kick-bicycle`, `kick-kipup`, `taunt-point` (stock), `taunt-cry`, `taunt-chest`, `taunt-gesture`, `taunt-loser`. New career counters `games`, `perfects`.
- Walk-up: start x **−3.4**, plate x **−0.9**, **1.6 m/s**, taunt **1.5 s**, tap skips, serve **0.3 s** after the walk-up ends. Pre-game: stamp → away splash 1.9 s → home splash 1.9 s → GAME TIME break (1.6 s, unchanged).
- Dance bag: draw without replacement; never repeat the last one on refill; persist last 4 under save key `dance.recent`.
- Runner arrows: inset 24 px, max 3 chips, hidden during `cinematicLock` / `walkoutActive` / `walkup`. Diamond 44 × 30.
- Commit after every task. Deploy only on the dev's explicit "push" — never from this plan.
- Windows/PowerShell host: `node scripts/<name>.mjs`; dev server `npm run dev` (port 5173); `tools/anims-src/` is gitignored (sources never commit; baked GLBs do).

---

### Task 0: Verify and commit the pending booth/sound/contact round

**Files:**
- Commit: everything `git status` shows modified/untracked EXCEPT `.codex/`

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: all test files pass. If any fail, stop and report — do not proceed.

- [ ] **Step 2: Start the dev server in the background**

Run (PowerShell): `Start-Process -NoNewWindow -FilePath npm -ArgumentList 'run','dev' ; Start-Sleep 4 ; (Invoke-WebRequest http://localhost:5173 -UseBasicParsing).StatusCode`
Expected: `200`

- [ ] **Step 3: Run the booth e2e harness**

Run: `node scripts/booth-sound-e2e.mjs`
Expected: every line `PASS`, exit 0. If a scenario fails, stop and report the failing scenario verbatim — do not commit.

- [ ] **Step 4: Commit the round**

```bash
git add public/assets/audio/announcer scripts/gen-announcer.mjs scripts/gen-sfx.mjs scripts/booth-sound-e2e.mjs public/assets/audio/sfx src/cinematics/director.js src/engine/audio.js src/game/ball.js src/game/matchScene.js src/main.js src/ui/screens/hud.js src/ui/ui.css
git commit -m "feat(booth): VO single-mic queue, gendered line pools, SFX expansion, GAME TIME break, whiff swings, PEG pad states"
```
Run: `git status --short | grep -v '^?? .codex'` → empty.

---

### Task 1: MSAA on the composer + perf watchdog + grade values

**Files:**
- Create: `src/engine/perfWatchdog.js`
- Modify: `src/engine/renderer.js` (GradeShader uniforms lines 20-26; exposure line 71; env intensities; composer construction line 95; `engine` object; `loop()`)
- Test: `tests/perfWatchdog.test.js`

**Interfaces:**
- Produces: `class PerfWatchdog { constructor({ windowS = 3, thresholdMs = 24, steps = [4, 2, 0], warmupS = 5 }); level; tick(rawDt) → number | null }`; `engine.setSamples(n)`, `engine.samples`.

- [ ] **Step 1: Write the failing watchdog test**

`tests/perfWatchdog.test.js`:
```js
import { it, expect } from 'vitest';
import { PerfWatchdog } from '../src/engine/perfWatchdog.js';

const feed = (w, dtS, seconds) => {
  let out = null;
  for (let t = 0; t < seconds; t += dtS) { const r = w.tick(dtS); if (r !== null) out = r; }
  return out;
};

it('never fires during warm-up or on smooth frames', () => {
  const w = new PerfWatchdog();
  expect(feed(w, 0.030, 4)).toBe(null);
  expect(feed(w, 0.016, 10)).toBe(null);
  expect(w.level).toBe(4);
});

it('steps 4 -> 2 -> 0 on sustained slow frames, one step per window', () => {
  const w = new PerfWatchdog();
  feed(w, 0.016, 6);
  expect(feed(w, 0.030, 3.2)).toBe(2);
  expect(feed(w, 0.030, 3.2)).toBe(0);
  expect(feed(w, 0.030, 3.2)).toBe(null);
  expect(w.level).toBe(0);
});

it('is one-way: smooth frames after a drop never raise the level', () => {
  const w = new PerfWatchdog({ warmupS: 0 });
  feed(w, 0.030, 3.2);
  expect(w.level).toBe(2);
  feed(w, 0.010, 10);
  expect(w.level).toBe(2);
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/perfWatchdog.test.js`: module not found)

- [ ] **Step 3: Implement the watchdog**

`src/engine/perfWatchdog.js`:
```js
// Frame-time watchdog for the MSAA budget. A phone that can't hold 4x MSAA
// steps down 4 -> 2 -> 0 (one step per window, never back up) so smooth edges
// never cost the game its frame rate. Pure — no DOM, unit-tested.
export class PerfWatchdog {
  constructor({ windowS = 3, thresholdMs = 24, steps = [4, 2, 0], warmupS = 5 } = {}) {
    this.windowS = windowS; this.thresholdMs = thresholdMs; this.steps = steps; this.warmupS = warmupS;
    this.level = steps[0];
    this._i = 0; this._t = 0; this._acc = 0; this._n = 0;
  }
  /** @param {number} rawDt seconds @returns {number|null} the new level when a downgrade fires */
  tick(rawDt) {
    this._t += rawDt;
    if (this._t < this.warmupS) return null;
    this._acc += rawDt; this._n += 1;
    if (this._acc < this.windowS) return null;
    const avgMs = (this._acc / this._n) * 1000;
    this._acc = 0; this._n = 0;
    if (avgMs <= this.thresholdMs || this._i >= this.steps.length - 1) return null;
    this._i += 1;
    this.level = this.steps[this._i];
    return this.level;
  }
}
```

- [ ] **Step 4: Run → 3 passed**

- [ ] **Step 5: Wire MSAA + watchdog + grade values into the renderer**

In `src/engine/renderer.js`:

(a) After the GTAOPass import: `import { PerfWatchdog } from './perfWatchdog.js';`

(b) GradeShader uniforms → `vignette 0.18`, `caAmount 0.0`, `sat 1.2`, `grain 0.008`.

(c) `renderer.toneMappingExposure = 1.35;`; `scene.environmentIntensity = 0.3;` → `0.5`; in `setSceneEnvironment` `0.55` → `0.7`.

(d) Replace `const composer = new EffectComposer(renderer);` with:
```js
  // MSAA lives on the COMPOSER's target: every frame renders through the
  // post chain, so the WebGLRenderer's own antialias flag never applied
  // (effective AA was none — the jagged edges the dev saw). ?msaa=N overrides.
  const msaaParam = new URLSearchParams(location.search).get('msaa');
  let samples = msaaParam != null ? Math.max(0, Math.min(4, Number(msaaParam) || 0)) : 4;
  const composer = new EffectComposer(renderer,
    new THREE.WebGLRenderTarget(1, 1, { samples, type: THREE.HalfFloatType }));
  const watchdog = new PerfWatchdog();
```

(e) In the `engine` object after `setQuality(q) {...},`:
```js
    get samples() { return samples; },
    /** Drop the composer's MSAA sample count in place (targets re-allocate lazily). */
    setSamples(n) {
      samples = n;
      for (const rt of [composer.renderTarget1, composer.renderTarget2]) { rt.samples = n; rt.dispose(); }
      if (n === 0) engine.setQuality('low'); // no MSAA = a phone on its knees: shed the grade pass too
      console.info(`[skk] msaa samples -> ${n}`);
    },
```

(f) In `loop(ts)` right after `const rawDt = ...`:
```js
    if (!document.hidden && msaaParam == null) {
      const drop = watchdog.tick(rawDt);
      if (drop !== null) engine.setSamples(drop);
    }
```

- [ ] **Step 6: Verify** — `npm test` green; in Chrome (`?match&nosplash`) `__engine.composer.renderTarget1.samples === 4`; `__engine.setSamples(2)` logs and keeps rendering; a silhouette screenshot shows no stair-steps.

- [ ] **Step 7: Commit**

```bash
git add src/engine/perfWatchdog.js src/engine/renderer.js tests/perfWatchdog.test.js
git commit -m "feat(look): MSAA on the composer target + perf watchdog, grain/CA/vignette down, exposure and IBL up"
```

---

### Task 2: Global light lift, character materials, geometry

**Files:**
- Modify: `src/game/field.js` (SKY_PRESETS line 19; lighting block ~481-514; plate line 92)
- Modify: `src/game/glbCharacters.js` (material block ~390-400; `applyCleatVertexTint` colour fill)
- Modify: `src/game/ball.js:14`, `src/game/characters.js` segment counts
- Test: `tests/lightLift.test.js`

**Interfaces:**
- Produces: `export const LIGHT_LIFT = { amb: 1.65, hemi: 1.4, rim: 0.5 }`, `export const SKY_PRESETS` (field.js); `export const CLEAT_BOOST = 1.6` (glbCharacters.js).

- [ ] **Step 1: Failing test** — `tests/lightLift.test.js`:
```js
import { it, expect } from 'vitest';
import { LIGHT_LIFT, SKY_PRESETS } from '../src/game/field.js';

it('the lift is one global table applied to every sky preset', () => {
  expect(LIGHT_LIFT).toEqual({ amb: 1.65, hemi: 1.4, rim: 0.5 });
  for (const [name, p] of Object.entries(SKY_PRESETS)) {
    expect(p.ambI * LIGHT_LIFT.amb, name).toBeGreaterThanOrEqual(0.4);
    expect(p.hemiI * LIGHT_LIFT.hemi, name).toBeGreaterThanOrEqual(1.8);
  }
});
```
- [ ] **Step 2: Run → FAIL** (not exported)
- [ ] **Step 3: field.js** — `export const SKY_PRESETS`, add above it:
```js
// Global light lift (dev, 2026-08-25: "characters and surfaces brighter"):
// ONE table so all ten skies move together.
export const LIGHT_LIFT = { amb: 1.65, hemi: 1.4, rim: 0.5 };
```
Lighting block: `new THREE.HemisphereLight(lp.hemiSky, lp.hemiGround, lp.hemiI * LIGHT_LIFT.hemi)`; `new THREE.AmbientLight(lp.amb ?? '#55585f', (lp.ambI ?? 0.3) * LIGHT_LIFT.amb)`; `new THREE.DirectionalLight(lp.hemiSky, LIGHT_LIFT.rim)`. Plate: `CylinderGeometry(0.55, 0.55, 0.06, 24)`.
- [ ] **Step 4: glbCharacters.js** — roughness `0.85 → 0.7`; both `emissiveIntensity` → `0.4`. Above `applyCleatVertexTint`: `export const CLEAT_BOOST = 1.6;` and the colour writes become `(c.r / 255) * CLEAT_BOOST` etc.
- [ ] **Step 5: Geometry** — `ball.js`: `SphereGeometry(BALL_R, 32, 24)`. `characters.js`: sphere segments ×2 (`(0.1*b.w, 20, 16)`, skull `(0.17, 32, 24)`, ear `(0.032, 14, 12)`, hand `(0.055, 16, 14)`, afro `(0.21, 20, 16)`), capsules `(…, 3, 8)` → `(…, 6, 16)`, thigh `(…, 3, 9)` → `(…, 6, 18)`, locs cylinder `5` → `10`.
- [ ] **Step 6: `npm test` green; screenshot: brighter faces/kits, round ball, clean plate.**
- [ ] **Step 7: Commit**
```bash
git add src/game/field.js src/game/glbCharacters.js src/game/ball.js src/game/characters.js tests/lightLift.test.js
git commit -m "feat(look): global light lift across all skies, softer self-glow, round ball/plate, smoother procedural bodies"
```

---

### Task 3: Generate the new SFX and register them

**Files:**
- Modify: `scripts/gen-sfx.mjs`, `src/engine/audio.js`
- Test: `tests/sfxRegistry.test.js`
- Assets: `public/assets/audio/sfx/*.mp3`

**Interfaces:**
- Produces: `export const SFX_FILES`, `export const SFX_ALIAS`, `export const WARM_LIST` from `audio.js`.

- [ ] **Step 1: Failing test** — `tests/sfxRegistry.test.js`:
```js
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { SFX_FILES, SFX_ALIAS, WARM_LIST } from '../src/engine/audio.js';

const NEW = ['ui-tap', 'ui-confirm', 'score', 'safe', 'out', 'tag', 'foul', 'inning',
  'crown-tick', 'crown-arm', 'countdown', 'unlock', 'stomp', 'cheer-big', 'boo'];

it('every alias resolves to a registered file that exists on disk', () => {
  for (const [alias, a] of Object.entries(SFX_ALIAS)) {
    if (a.synth) continue;
    expect(SFX_FILES[a.file], alias).toBeTruthy();
    expect(fs.existsSync(`public/${SFX_FILES[a.file]}`), `${alias} -> ${SFX_FILES[a.file]}`).toBe(true);
  }
});

it("the round's new sounds are all aliased and warmed", () => {
  for (const n of NEW) { expect(SFX_ALIAS[n], n).toBeTruthy(); expect(WARM_LIST, n).toContain(n); }
});
```
- [ ] **Step 2: Run → FAIL** (not exported)
- [ ] **Step 3: Generation entries** — append to `SFX` in `scripts/gen-sfx.mjs`:
```js
  // Sound-for-everything round (dev, 2026-08-25). One style line so they layer:
  // arcade-loud, punchy, dry, single hit, no music.
  { file: 'ui-tap.mp3',     text: 'A crisp arcade button tap, short bright click with a tiny low thump, one single hit, dry, no music', dur: 0.3, infl: 0.7 },
  { file: 'ui-confirm.mp3', text: 'A punchy arcade confirm blip, two quick rising tones locking in, short, dry, no music', dur: 0.4, infl: 0.7 },
  { file: 'score.mp3',      text: 'A triumphant arcade score sting, bright rising chime with a deep bass hit underneath, short, punchy, no music', dur: 1.0, infl: 0.6 },
  { file: 'safe.mp3',       text: 'A ballplayer sliding into a base with a sharp slap of a hand on the bag, gritty scrape then slap, one single hit, dry, no music', dur: 0.8, infl: 0.7 },
  { file: 'out.mp3',        text: 'A sharp referee whistle blast followed immediately by a deep dull thud, one single hit, dry, no music', dur: 0.8, infl: 0.7 },
  { file: 'tag.mp3',        text: 'A leather glove slapping hard against a person, sharp leather smack, one single hit, dry, close-up, no music', dur: 0.5, infl: 0.7 },
  { file: 'foul.mp3',       text: 'A dull hollow rubber thunk of a ball hitting the ground wrong followed by a short sharp whistle chirp, one hit, dry, no music', dur: 0.8, infl: 0.7 },
  { file: 'inning.mp3',     text: 'A short stadium horn blast, two quick punchy notes, big and bright, no music', dur: 1.2, infl: 0.6 },
  { file: 'crown-tick.mp3', text: 'A short bright rising arcade ping, single energetic power-up tick, dry, no music', dur: 0.4, infl: 0.7 },
  { file: 'crown-arm.mp3',  text: 'A powerful arcade power-up charge sound, rising electric whoosh into a solid metallic lock click, short, punchy, no music', dur: 1.0, infl: 0.6 },
  { file: 'countdown.mp3',  text: 'A single short sharp countdown beep, high clean digital tone, dry, no music', dur: 0.3, infl: 0.7 },
  { file: 'unlock.mp3',     text: 'A bright arcade unlock chime with a cash register ding and sparkle, short and rewarding, no music', dur: 1.2, infl: 0.6 },
  { file: 'stomp.mp3',      text: 'A single person walking with a confident swagger on asphalt, heavy sneaker footsteps, steady rhythm, two seconds, dry, no music', dur: 2.0, infl: 0.7 },
  { file: 'cheer-big.mp3',  text: 'A huge street crowd erupting in a massive roaring cheer with whistles and shouts, explosive and wide, no music', dur: 3.0, infl: 0.6 },
  { file: 'boo.mp3',        text: 'A street crowd booing loudly together, deep disapproving BOOO, one collective wave, no music', dur: 1.6, infl: 0.7 },
```
Replace the four existing prompts (add a `crowd-cheer.mp3` entry if absent):
```js
  { file: 'kick.mp3',        text: 'A rubber playground kickball blasted with a massive kick, huge deep punchy thump with a sharp rubber snap on top, one single hit, dry, close-up, no music', dur: 1.0, infl: 0.7 },
  { file: 'peg.mp3',         text: "A rubber ball smacking violently into a person's back, loud wet rubber slap with a deep body thud, one single hit, dry, no music", dur: 0.8, infl: 0.7 },
  { file: 'catch.mp3',       text: 'A fastball smacking into a leather glove, loud sharp leather pop with a crack, one single hit, dry, close-up, no music', dur: 0.7, infl: 0.7 },
  { file: 'crowd-cheer.mp3', text: 'A big street crowd bursting into a loud excited cheer with claps and whistles, wide and energetic, no music', dur: 2.5, infl: 0.6 },
```
- [ ] **Step 4: Generate** — `Remove-Item public/assets/audio/sfx/kick.mp3, public/assets/audio/sfx/peg.mp3, public/assets/audio/sfx/catch.mp3, public/assets/audio/sfx/crowd-cheer.mp3 ; node scripts/gen-sfx.mjs` → `DONE — ok=19 fail=0`. On a failure re-run once (resumable); if still failing `git checkout -- public/assets/audio/sfx/<old>` for that file and report.
- [ ] **Step 5: Register** — `FILES.sfx` gains the 15 new `name: 'assets/audio/sfx/<name>.mp3'` entries; `SFX_ALIAS` gains:
```js
  'ui-tap': { file: 'ui-tap', gain: 0.55 }, 'ui-confirm': { file: 'ui-confirm', gain: 0.7 },
  score: { file: 'score', gain: 1.0 }, safe: { file: 'safe', gain: 1.0 }, out: { file: 'out', gain: 1.0 },
  tag: { file: 'tag', gain: 1.0 }, foul: { file: 'foul', gain: 0.9 }, inning: { file: 'inning', gain: 0.9 },
  'crown-tick': { file: 'crown-tick', gain: 0.7 }, 'crown-arm': { file: 'crown-arm', gain: 1.0 },
  countdown: { file: 'countdown', gain: 0.6 }, unlock: { file: 'unlock', gain: 0.9 }, stomp: { file: 'stomp', gain: 0.5 },
  'cheer-big': { file: 'cheer-big', gain: 1.1 }, boo: { file: 'boo', gain: 0.8 },
```
Above `export class AudioBus`:
```js
export const WARM_LIST = ['kick', 'peg', 'fireball', 'catch', 'bounce', 'fence', 'slide',
  'homer', 'crowd-ooh', 'whoosh', 'swish', 'squeak', 'roll', 'crowd-cheer', 'bassdrop', 'scratch',
  'ui-tap', 'ui-confirm', 'score', 'safe', 'out', 'tag', 'foul', 'inning', 'crown-tick', 'crown-arm',
  'countdown', 'unlock', 'stomp', 'cheer-big', 'boo'];
export const SFX_FILES = FILES.sfx;
export { SFX_ALIAS };
```
`warm()` → `for (const name of WARM_LIST) if (FILES.sfx[name]) this.buffer(FILES.sfx[name]);`
- [ ] **Step 6: `npx vitest run tests/sfxRegistry.test.js` → 2 passed; `npm test` green**
- [ ] **Step 7: Commit**
```bash
git add scripts/gen-sfx.mjs src/engine/audio.js tests/sfxRegistry.test.js public/assets/audio/sfx
git commit -m "feat(sound): 15 new SFX + harder kick/catch/peg/cheer, registered, aliased and warmed"
```

---

### Task 4: Wire sound to every silent event

**Files:**
- Modify: `src/ui/screens/hud.js`, `src/game/matchScene.js`, `src/ui/screens/screens.js`

**Interfaces:**
- Produces: `hud.onSfx(name)`; `hud._tap(name)`; `MatchScene.scoreRun(r, { silent })`; `r.scoredAt` (Task 15 reads it).

- [ ] **Step 1: HUD tap helper** — in the constructor after `this.onGo = null;`:
```js
    // every HUD press is HEARD (dev, 2026-08-25): the scene routes these to the bus
    this.onSfx = null;
    this._tap = (name = 'ui-tap') => this.onSfx?.(name);
```
First statement inside each handler: `goBtn` → `this._tap('ui-confirm')`; `pitchSelect`/`aimBar` (after the `if (!btn) return;`) → `this._tap()`; `throwPad` → `this._tap('ui-confirm')`; `specialBtn`, `duelBtn`, `reverseBtn` → `this._tap()`; `callBtn` → `this._tap('ui-confirm')`; skip chip → `this._tap()` before `onTap?.()`; steal chips → `this._tap('ui-confirm')` before `this.onSteal?.(b)`.
`setTraceTimer(frac)`: keep the fill update, add
```js
    const step = Math.ceil(Math.max(0, Math.min(1, frac)) * 10);
    if (step <= 3 && step >= 1 && step !== this._ttStep) this._tap('countdown');
    this._ttStep = step;
```
- [ ] **Step 2: Scene routing + scoreRun** — ctor next to `this.hud.onSteal = ...`: `this.hud.onSfx = (name) => this.bus.emit('sfx', name);`. Above `leadRunner()`:
```js
  /** A runner crosses the plate: state + the score sting (silent = the homer
   *  already blasted its own horn). Stamps scoredAt for the live diamond. */
  scoreRun(r, { silent = false } = {}) {
    if (r.state === 'scored') return;
    r.state = 'scored';
    r.scoredAt = this.elapsed;
    if (silent) return;
    this.bus.emit('sfx', 'score');
    if (!this.kickingIsPlayer()) this.bus.emit('sfx', 'boo'); // they scored on YOU
  }
```
Replace `r.state = 'scored';` (~1975, ~2508) with `this.scoreRun(r);`, `victim.state = 'scored';` (~3166) with `this.scoreRun(victim);`, and in `homer()`:
```js
    for (const r of this.runners) {
      if (r.state === 'running' || r.state === 'held') { runs += 1; this.scoreRun(r, { silent: true }); }
      r.char.group.visible = r.char === this.kicker;
    }
```
plus `'crowd-cheer'` → `'cheer-big'` in `homer()`.
- [ ] **Step 3: Rulings, outs, foul, inning, unlock** — `safe` VO sites (~2130, ~2867, ~3186): add `this.bus.emit('sfx', 'safe');` before each. `runnerOut` else-branch: `this.bus.emit('sfx', reason === 'tag' ? 'tag' : 'catchpop'); this.bus.emit('sfx', 'out');`; the `crowd-ooh` branch becomes
```js
    else {
      this.bus.emit('sfx', 'crowd-ooh');
      if (this.runners.some((o) => o !== runner && (o.state === 'running' || o.state === 'held'))) this.bus.emit('sfx', 'boo');
    }
```
Strikeout site (~1336): add `this.bus.emit('sfx', 'out');`. Foul (~1428): `this.bus.emit('sfx', 'foul');` before the VO. `halfEnd` handler: first line `this.bus.emit('sfx', 'inning');`. `victoryLap`: add `this.bus.emit('sfx', 'cheer-big');` beside its `crowd-cheer`. `screens.js` post-game after `root.appendChild(s);`: `fresh.forEach((_, i) => setTimeout(() => ctx.bus.emit('sfx', 'unlock'), 400 + i * 260));`
- [ ] **Step 4: `npm test` green; browser: throw-pad tap logs `ui-confirm`, a foul logs `foul`, an out logs `out`.**
- [ ] **Step 5: Commit**
```bash
git add src/ui/screens/hud.js src/game/matchScene.js src/ui/screens/screens.js
git commit -m "feat(sound): every HUD press, run, ruling, out, foul, inning change, countdown and unlock is heard"
```

---

### Task 5: POWER KICK — one button, charges

**Files:**
- Create: `src/game/powerKicks.js`
- Modify: `src/game/matchScene.js` (ctor 134-135, 246-252, 296; `crownFeed`; kick consume 1131-1150; `refreshHud`; `nextAtBat`)
- Modify: `src/ui/screens/hud.js` (markup line 52; `setSpecial` → `setPowerKick`), `src/ui/ui.css`
- Test: `tests/powerKicks.test.js`

**Interfaces:**
- Produces: `class PowerKicks { constructor({ meter, gear }); charges; armed; name; lit; feed(event) → boolean; arm() → boolean; disarm(); consume() → { gear, powerMult, label } | null; hudState() }`; `hud.setPowerKick({ name, charges, armed, meterFill })`; `scene.power`.

- [ ] **Step 1: Failing test** — `tests/powerKicks.test.js`:
```js
import { it, expect } from 'vitest';
import { PowerKicks } from '../src/game/powerKicks.js';
import { SpecialMeter } from '../src/game/specialMoves.js';
import tuning from '../src/data/tuning.json';
import teams from '../src/data/teams.json';

const monarchs = teams.teams.find((t) => t.id === 'monarchs');
const flair = { id: 'kick-flair', name: 'THE FLAIR', clip: 'kickFlair', mods: { powerMult: 1.45 } };
const mk = (gear = null) => new PowerKicks({ meter: new SpecialMeter(monarchs, tuning), gear });

it('an equipped kick starts the match with 2 charges; stock starts with 0', () => {
  expect(mk(flair).charges).toBe(2);
  expect(mk().charges).toBe(0);
  expect(mk().lit).toBe(false);
  expect(mk().name).toBe('CROWN KICK');
  expect(mk(flair).name).toBe('THE FLAIR');
});

it('a full crown meter mints +1 charge and resets', () => {
  const p = mk();
  expect(p.feed('PERFECT')).toBe(false);
  expect(p.feed('homerun')).toBe(false);
  expect(p.feed('peg')).toBe(true);
  expect(p.charges).toBe(1);
  expect(p.meter.value).toBe(0);
  expect(p.hudState().meterFill).toBe(0);
});

it('arm needs a charge; consume spends it at launch; disarm refunds', () => {
  const p = mk();
  expect(p.arm()).toBe(false);
  p.feed('pickleEscape'); p.feed('homerun');
  expect(p.arm()).toBe(true);
  p.disarm();
  expect(p.charges).toBe(1);
  p.arm();
  const sp = p.consume();
  expect(sp.powerMult).toBe(tuning.special.powerMult);
  expect(sp.gear).toBe(null);
  expect(sp.label).toBe(monarchs.special.label);
  expect(p.charges).toBe(0);
  expect(p.consume()).toBe(null);
});

it('gear rides the consume: its mods replace the stock power', () => {
  const p = mk(flair);
  p.arm();
  const sp = p.consume();
  expect(sp.gear).toBe(flair);
  expect(sp.powerMult).toBe(1.45);
  expect(sp.label).toBe('THE FLAIR');
  expect(p.hudState()).toEqual({ name: 'THE FLAIR', charges: 1, armed: false, meterFill: 0 });
});
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** `src/game/powerKicks.js`:
```js
// POWER KICK (dev, 2026-08-25: "you can't use what you unlock"). One button,
// one rule: CHARGES. An equipped locker kick brings two per game; a full crown
// meter mints one more and resets. Arm on your at-bat, spend at launch.
export class PowerKicks {
  constructor({ meter, gear = null }) {
    this.meter = meter; this.gear = gear ?? null;
    this.charges = this.gear ? 2 : 0; this.armed = false;
  }
  get name() { return this.gear?.name ?? 'CROWN KICK'; }
  get lit() { return this.charges > 0; }
  /** Crown-meter gain. @returns {boolean} true when the meter filled and minted a charge */
  feed(event) {
    this.meter.add(event);
    if (!this.meter.ready) return false;
    this.meter.value = 0; this.charges += 1; return true;
  }
  arm() { if (!this.lit || this.armed) return false; this.armed = true; return true; }
  /** Un-arm without spending — the kick never happened. */
  disarm() { this.armed = false; }
  consume() {
    if (!this.armed || this.charges <= 0) { this.armed = false; return null; }
    this.charges -= 1; this.armed = false;
    return {
      gear: this.gear,
      powerMult: this.gear?.mods?.powerMult ?? this.meter.tuning.special.powerMult,
      label: this.gear?.name ?? this.meter.team.special.label,
    };
  }
  hudState() {
    return { name: this.name, charges: this.charges, armed: this.armed,
      meterFill: (this.meter.value / this.meter.tuning.special.meterMax) * 100 };
  }
}
```
- [ ] **Step 4: Run → 4 passed**
- [ ] **Step 5: Wire the scene** — import `PowerKicks`; ctor: `this.power = new PowerKicks({ meter: this.special, gear: gear?.kick ?? null });` (delete `this.specialArmed = false;`). `hud.onSpecial`:
```js
    this.hud.onSpecial = () => {
      if (!this.kickingIsPlayer() || !this.power.arm()) return;
      this.bus.emit('sfx', 'crown-arm');
      this.hud.hint(`${this.power.name} ARMED — LET IT RIP`);
      this.refreshHud();
    };
```
Line 296 → `this.power.disarm();`. `refreshHud` → `this.hud.setPowerKick(this.power.hudState());`. `crownFeed`:
```js
  crownFeed(event) {
    const minted = this.power.feed(event);
    this.hud.crownPulse?.();
    if (minted) {
      this.hud.stamp('CROWN CHARGED! +1', 'crowned');
      this.hud.hint(`TAP THE 👑 — ${this.power.name} READY`);
      this.bus.emit('sfx', 'bassdrop');
    } else {
      this.bus.emit('sfx', 'crown-tick');
    }
    this.refreshHud();
  }
```
Kick consume block:
```js
    let powerMult = 1;
    this.specialKickGear = null;
    if (this.kickingIsPlayer() && this.power.armed) {
      const sp = this.power.consume();
      if (sp) {
        powerMult = sp.powerMult;
        this.kickWasSpecial = true;
        if (sp.gear) {
          this.specialKickGear = sp.gear;
          if (sp.gear.mods?.curl) aimDeg = Math.max(-60, Math.min(60, aimDeg * sp.gear.mods.curl));
          this.hud.call(`${sp.gear.name}!`, 'crowned');
        }
        this.bus.emit('cine:special', { label: sp.label, kicker: this.kicker });
      }
    }
```
`nextAtBat` after `this.runners = [];`: `this.power.disarm(); // an armed-but-unkicked charge is refunded`. `grep -n "specialArmed\|_crownReadyCalled" src/game/matchScene.js` → nothing.
- [ ] **Step 6: HUD** — markup: `<div class="special-btn"><div class="core">👑</div><span class="pk-label"></span></div>`; replace `setSpecial` with:
```js
  setPowerKick({ name, charges, armed, meterFill }) {
    this.specialBtn.style.setProperty('--fill', Math.round(meterFill));
    this.specialBtn.classList.toggle('ready', charges > 0);
    this.specialBtn.classList.toggle('armed', armed);
    this.specialBtn.querySelector('.pk-label').textContent = charges > 0 ? `${name} ×${charges}` : name;
    this.specialBtn.title = name;
  }
```
`grep -rn setSpecial src tests` → none. CSS after `.special-btn.armed .core {...}`:
```css
.special-btn .pk-label {
  position: absolute; top: calc(100% + 4px); left: 50%; transform: translateX(-50%);
  font-family: var(--sans); font-weight: 900; font-size: 10px; letter-spacing: .6px; white-space: nowrap;
  color: #8b90a3; text-shadow: 0 1px 0 #000;
}
.special-btn.ready .pk-label { color: var(--gold); }
.special-btn.armed { border-color: #fff; box-shadow: 0 0 28px rgba(245,179,18,1); }
```
- [ ] **Step 7: `npm test` green; browser: `__skk.power.charges = 1; __skk.refreshHud()` lights the button with `CROWN KICK ×1`; tap → `crown-arm`, gold; kick → `cine:special`, charges 0.**
- [ ] **Step 8: Commit**
```bash
git add src/game/powerKicks.js src/game/matchScene.js src/ui/screens/hud.js src/ui/ui.css tests/powerKicks.test.js
git commit -m "feat(gear): POWER KICK charges — equipped kicks are usable on demand, the crown meter mints more"
```

---

### Task 6: Cleats — real speed + speed trail

**Files:**
- Modify: `src/meta/unlocks.js` (cleat + uniform entries), `src/game/baseRunning.js`, `src/game/matchScene.js`
- Create: `src/game/fx/speedTrail.js`
- Test: `tests/baseRunning.test.js` (append), `tests/unlocks.test.js` (append)

**Interfaces:**
- Produces: `RunnerSim({ tuning, human, speedMult })`, `sim.speedMs`; `class SpeedTrail { constructor(scene, hex); update(pos, dir, active, nowS); hide(); busy; mesh }`; `scene.cleatSpeedMult`, `scene.cleatStealMult`, `scene.cleatHex`, `scene.trailPool`, `r.trail`.

- [ ] **Step 1: Failing tests** — append to `tests/baseRunning.test.js` (reuse existing imports if present):
```js
import { RunnerSim } from '../src/game/baseRunning.js';
import tuning from '../src/data/tuning.json';

it('cleat speedMult scales the leg and is reported on the sim', () => {
  const plain = new RunnerSim({ tuning });
  const fast = new RunnerSim({ tuning, speedMult: 1.12 });
  plain.tick(0.5, 8); fast.tick(0.5, 8);
  expect(fast.progressM).toBeCloseTo(plain.progressM * 1.12, 5);
  expect(fast.speedMs).toBeCloseTo(plain.speedMs * 1.12, 5);
});
```
Append to `tests/unlocks.test.js`:
```js
it('every cleat carries a real speed multiplier', () => {
  const cleats = GEAR.filter((g) => g.cat === 'cleats');
  expect(cleats.map((g) => g.speedMult)).toEqual([1.06, 1.06, 1.08, 1.08, 1.10, 1.12]);
  expect(gearById('cleats-ice').stealMult).toBe(1.1);
});
```
- [ ] **Step 2: Run → both FAIL**
- [ ] **Step 3: Implement** — `unlocks.js` cleats: add `speedMult` (1.06/1.06+`stealMult: 1.1`/1.08/1.08/1.10/1.12) and `play` ('+6% speed on the bases', '+6% speed · +10% steal jump', '+8% …', '+8% …', '+10% …', '+12% …'); uniforms `play: "your crew's kit"`.
`baseRunning.js` `RunnerSim`: ctor `({ tuning, human = false, speedMult = 1 })` storing `this.speedMult = speedMult; this.speedMs = 0;`; in `tick`: `const speed = (this.human ? humanRunSpeed(...) : mashSpeed(...)) * this.speedMult; this.speedMs = speed;`.
`src/game/fx/speedTrail.js`:
```js
// Cleat speed trail: a short additive ribbon in the cleat colour behind a
// sprinting runner's feet — the LOCKER cleats must be SEEN doing something.
import * as THREE from 'three';
const N = 10, WIDTH = 0.28, LIFE_S = 0.32;
export class SpeedTrail {
  constructor(scene, hex) {
    this.samples = []; this.busy = false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.color = new THREE.Color(hex);
    scene.add(this.mesh);
  }
  update(pos, dir, active, nowS) {
    if (active) this.samples.unshift({ p: pos.clone().setY(0.12), t: nowS });
    while (this.samples.length > N || (this.samples.length && nowS - this.samples[this.samples.length - 1].t > LIFE_S)) this.samples.pop();
    if (this.samples.length < 2) { this.mesh.visible = false; return; }
    const pos3 = this.mesh.geometry.getAttribute('position'), col = this.mesh.geometry.getAttribute('color');
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    for (let i = 0; i < N; i++) {
      const s = this.samples[Math.min(i, this.samples.length - 1)];
      const k = 1 - i / (N - 1), w = WIDTH * k, a = k * k;
      pos3.setXYZ(i * 2, s.p.x + perp.x * w, s.p.y, s.p.z + perp.z * w);
      pos3.setXYZ(i * 2 + 1, s.p.x - perp.x * w, s.p.y, s.p.z - perp.z * w);
      col.setXYZ(i * 2, this.color.r * a, this.color.g * a, this.color.b * a);
      col.setXYZ(i * 2 + 1, this.color.r * a, this.color.g * a, this.color.b * a);
    }
    pos3.needsUpdate = true; col.needsUpdate = true; this.mesh.visible = true;
  }
  hide() { this.samples.length = 0; this.mesh.visible = false; }
}
```
`matchScene.js`: import `SpeedTrail`; ctor after `this.playerGear = gear;`:
```js
    // LOCKER cleats: a real leg on the bases + a coloured trail so it's SEEN
    this.cleatSpeedMult = gear?.cleats?.speedMult ?? 1;
    this.cleatStealMult = gear?.cleats?.stealMult ?? 1;
    this.cleatHex = gear?.cleats?.hex ?? null;
    this.trailPool = this.cleatHex ? Array.from({ length: 4 }, () => new SpeedTrail(engine.scene, this.cleatHex)) : [];
```
`makeRunner`: build `const r = { ..., sim: new RunnerSim({ tuning: this.tuning, human: this.kickingIsPlayer(), speedMult: this.kickingIsPlayer() ? this.cleatSpeedMult : 1 }), trail: this.kickingIsPlayer() ? (this.trailPool.find((t) => !t.busy) ?? null) : null, ... }; if (r.trail) r.trail.busy = true; return r;`.
`updateStealRunner`: `r.sim.tick(dt, rate * (this.kickingIsPlayer() ? this.cleatStealMult : 1));`.
Runner loop after `r.char.group.position.set(p.x, 0, p.z);`: `r.trail?.update(p, dir, r.sim.speedMs > this.tuning.running.maxSpeedMs * 0.8, this.elapsed);`.
`nextAtBat` next to `this.runners = [];`: `for (const t of this.trailPool) { t.hide(); t.busy = false; }`. `destroy()`: `for (const t of this.trailPool) this.engine.scene.remove(t.mesh);`.
- [ ] **Step 4: `npm test` green; browser with Fire Reds equipped (`?match&nosplash&nointro&cleats=ff3b1f` previews the tint; equip via the Locker for the speed): red ribbon behind a sprinting runner.**
- [ ] **Step 5: Commit**
```bash
git add src/meta/unlocks.js src/game/baseRunning.js src/game/fx/speedTrail.js src/game/matchScene.js tests/baseRunning.test.js tests/unlocks.test.js
git commit -m "feat(gear): cleats give real base speed and leave a coloured speed trail"
```

---

### Task 7: YOUR GEAR strip (walk-up card + first-at-bat toast)

**Files:**
- Create: `src/meta/gearLine.js`
- Modify: `src/ui/screens/hud.js` (`walkoutShow`; new `gearToast`), `src/ui/ui.css`, `src/game/matchScene.js` (`nextAtBat` NOW KICKING card + toast)
- Test: `tests/gearLine.test.js`

**Interfaces:**
- Produces: `gearLine(gear) → string`; `hud.gearToast(line)`; `walkoutShow({ ..., gear })`.

- [ ] **Step 1: Failing test** — `tests/gearLine.test.js`:
```js
import { it, expect } from 'vitest';
import { gearLine } from '../src/meta/gearLine.js';

it('names the three slots, stock where empty', () => {
  expect(gearLine({ kick: null, cleats: null, uniform: null })).toBe('STOCK KICK · STOCK CLEATS · STOCK KIT');
  expect(gearLine({ kick: { name: 'THE FLAIR' }, cleats: { name: 'FIRE REDS' }, uniform: { name: 'BLACKOUT KIT' } }))
    .toBe('THE FLAIR · FIRE REDS · BLACKOUT KIT');
  expect(gearLine(null)).toBe('STOCK KICK · STOCK CLEATS · STOCK KIT');
});
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** — `src/meta/gearLine.js`:
```js
/** One line naming what the player is wearing — the NOW KICKING card and the
 *  first-at-bat toast both read it (dev, 2026-08-25: gear must be SEEN). */
export function gearLine(gear) {
  const g = gear ?? {};
  return [g.kick?.name ?? 'STOCK KICK', g.cleats?.name ?? 'STOCK CLEATS', g.uniform?.name ?? 'STOCK KIT'].join(' · ');
}
```
`hud.walkoutShow({ nick, number, pos, stats, color, label, mini = false, gear = null })`: append `(gear ? `<div class="wo-gear">YOUR GEAR — ${gear}</div>` : '')` to the innerHTML (plain text from `gearLine`). Add after `walkoutHide()`:
```js
  gearToast(line) {
    const t = document.createElement('div');
    t.className = 'gear-toast';
    t.textContent = `YOUR GEAR — ${line}`;
    this.el.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => t.remove(), 2800);
  }
```
CSS:
```css
.wo-gear { margin-top: 6px; font-family: var(--sans); font-weight: 900; font-size: 10px; letter-spacing: .6px; color: var(--gold); }
.gear-toast {
  position: absolute; left: 50%; top: calc(150px + env(safe-area-inset-top)); transform: translate(-50%, -8px);
  font-family: var(--sans); font-weight: 900; font-size: 12px; letter-spacing: .6px; color: var(--gold);
  background: rgba(8,9,13,.85); border: 2px solid var(--gold); border-radius: 999px; padding: 6px 14px;
  opacity: 0; transition: opacity .25s, transform .25s; pointer-events: none; white-space: nowrap; z-index: 8;
}
.gear-toast.show { opacity: 1; transform: translate(-50%, 0); }
```
`matchScene.js`: import `gearLine`; in `nextAtBat` the NOW KICKING `walkoutShow` call gains `gear: this.kickingIsPlayer() ? gearLine(this.playerGear) : null,`; after `this.power.disarm();`:
```js
    if (this.kickingIsPlayer() && this.playerGear && !this._gearToasted) {
      this._gearToasted = true;
      this.after(0.8, () => this.hud.gearToast(gearLine(this.playerGear)));
    }
```
- [ ] **Step 4: `npm test` green; commit**
```bash
git add src/meta/gearLine.js src/ui/screens/hud.js src/ui/ui.css src/game/matchScene.js tests/gearLine.test.js
git commit -m "feat(gear): YOUR GEAR strip on the NOW KICKING card and at the first at-bat"
```

---

### Task 8: Animation pack k — 7 kicks + 5 taunts baked

**Files:**
- Modify: `src/data/anims.manifest.json`, `tools/retarget.js`, `scripts/anim-upload-server.mjs`, `scripts/verify-anims.mjs`, `src/game/animExtras.js`, `src/game/glbCharacters.js` (CLIPS aliases), `tests/animsManifest.test.js`
- Assets: `public/assets/anims/mocap-k-<arch>.glb` × 19
- Sources (already copied, gitignored): `tools/anims-src/{Martelo Do Chau, Armada To Esquiva, Inverted Double Kick To Kip Up, Kicking 1, Scissor Kick, Flying Bicycle Kick, Flip Kick, Taunt, Standing Taunt Battlecry, Standing Taunt Chest Thump, Taunt Gesture, Loser}.fbx`

**Interfaces:**
- Produces: manifest names listed in Global Constraints; `loadExtrasFor` loads `x` and `k`; `PACKS = ['x', 'k']` exported from `animExtras.js`.

- [ ] **Step 1: Manifest test update (fails first)** — in `tests/animsManifest.test.js`: add to `REQUIRED` `'tauntPoint', 'tauntCry', 'tauntChest', 'tauntGesture', 'tauntLoser'`; change `expect(m.pack).toBe('x');` → `expect(['x', 'k']).toContain(m.pack);`; add:
```js
  it('taunts are one-shot, in-place, short', () => {
    for (const n of ['tauntPoint', 'tauntCry', 'tauntChest', 'tauntGesture', 'tauntLoser']) {
      const m = manifest.find((x) => x.name === n);
      expect(m.pack).toBe('k'); expect(m.loop).toBe(false); expect(m.inPlace).toBe(true);
      expect(m.trim[1] - m.trim[0]).toBeLessThanOrEqual(1.8);
    }
  });
```
Run: `npx vitest run tests/animsManifest.test.js` → FAIL (taunts missing).

- [ ] **Step 2: Manifest entries** — append to `src/data/anims.manifest.json` (contactAt values are FIRST GUESSES, corrected in Step 6):
```json
  { "file": "Martelo Do Chau.fbx", "name": "kickMartelo", "loop": false, "contactAt": 0.5, "inPlace": true, "pack": "k", "rate": 1.1 },
  { "file": "Armada To Esquiva.fbx", "name": "kickArmada", "loop": false, "contactAt": 0.5, "inPlace": true, "pack": "k", "rate": 1.1 },
  { "file": "Scissor Kick.fbx", "name": "kickScissor", "loop": false, "contactAt": 0.5, "inPlace": true, "pack": "k", "rate": 1.1 },
  { "file": "Kicking 1.fbx", "name": "kickPunt", "loop": false, "contactAt": 0.5, "inPlace": true, "pack": "k", "rate": 1.1 },
  { "file": "Flip Kick.fbx", "name": "kickFlip", "loop": false, "contactAt": 0.5, "inPlace": true, "pack": "k", "rate": 1.1 },
  { "file": "Flying Bicycle Kick.fbx", "name": "kickBicycle", "loop": false, "contactAt": 0.5, "inPlace": true, "pack": "k", "rate": 1.1 },
  { "file": "Inverted Double Kick To Kip Up.fbx", "name": "kickKipUp", "loop": false, "contactAt": 0.5, "inPlace": true, "pack": "k", "rate": 1.1 },
  { "file": "Taunt.fbx", "name": "tauntPoint", "loop": false, "inPlace": true, "pack": "k", "bakeHz": 15, "trim": [0.2, 1.9] },
  { "file": "Standing Taunt Battlecry.fbx", "name": "tauntCry", "loop": false, "inPlace": true, "pack": "k", "bakeHz": 15, "trim": [0.2, 1.9] },
  { "file": "Standing Taunt Chest Thump.fbx", "name": "tauntChest", "loop": false, "inPlace": true, "pack": "k", "bakeHz": 15, "trim": [0.2, 1.9] },
  { "file": "Taunt Gesture.fbx", "name": "tauntGesture", "loop": false, "inPlace": true, "pack": "k", "bakeHz": 15, "trim": [0.2, 1.9] },
  { "file": "Loser.fbx", "name": "tauntLoser", "loop": false, "inPlace": true, "pack": "k", "bakeHz": 15, "trim": [0.2, 1.9] }
```
Run the manifest test → passes.

- [ ] **Step 3: Generalize the bake tool to N packs** — `tools/retarget.js`:
  - `rig.packs = { base: [], x: [] };` → `rig.packs = {};` and the push → `(rig.packs[entry.pack ?? 'base'] ??= []).push(clip);`; the log line → ``log(`baked ${rig.clips.length} clips for arch-${arch} (${Object.entries(rig.packs).map(([p, c]) => `${p} ${c.length}`).join(' + ')}, hip restY ${rig.hipY.toExponential(2)})`)``.
  - Contact analyzer filter `if (!m.contactAt || m.pack !== 'x') continue;` → `if (!m.contactAt || !m.pack) continue;`.
  - `exportArch`: `const outName = pack === 'base' ? `mocap-${arch}.glb` : `mocap-${pack}-${arch}.glb`;`.
  - Buttons: `for (const pack of Object.keys(rigs.get(arch).packs))` with label ``EXPORT-${pack.toUpperCase()} ${arch}``.
  - Auto mode honours `?packs=k` (comma list; default all): 
```js
const PACKS = PARAMS.get('packs')?.split(',').filter(Boolean) ?? null;
async function autoExport() {
  for (const arch of rigs.keys()) {
    for (const pack of Object.keys(rigs.get(arch).packs)) {
      if (PACKS && !PACKS.includes(pack)) continue;
      await exportArch(arch, pack);
    }
  }
  log('AUTO EXPORT DONE'); document.title = 'retarget: AUTO DONE';
}
```
  - `scripts/anim-upload-server.mjs` regex → `/^(mocap(-[a-z])?|world)-[a-z]+\.glb$/`.
  - `scripts/verify-anims.mjs`: `const PACKS = [...new Set(manifest.map((m) => m.pack).filter(Boolean))];` `const BUDGET = { x: 1100, k: 900 };` archs from files: `.replace(/^mocap-([a-z]-)?/, '')`; the inner list becomes `[[`mocap-${arch}.glb`, wantBase, BASE_BUDGET_KB], ...PACKS.map((p) => [`mocap-${p}-${arch}.glb`, manifest.filter((m) => m.pack === p).map((m) => m.name), BUDGET[p] ?? 1000])]`; add the seven new kicks to `LOW_OK` (`kickMartelo`, `kickArmada`, `kickScissor`, `kickFlip`, `kickBicycle`, `kickKipUp`, `kickPunt`) — floor-touching moves; final log says `× ${1 + PACKS.length} packs`.

- [ ] **Step 4: Runtime loaders** — `src/game/animExtras.js`:
```js
export const PACKS = ['x', 'k']; // x = dances/special kicks, k = the 2026-08-25 kicks + taunts
export function loadExtrasFor(chars) {
  const jobs = [];
  for (const c of chars ?? []) {
    if (!c?.archKey || !c.animator?.addClips) continue;
    for (const p of PACKS) {
      jobs.push(loadMocapClips(`/assets/anims/mocap-${p}-${c.archKey}.glb`)
        .then((clips) => c.animator.addClips(clips))
        .catch((e) => console.warn(`[skk] extras mocap-${p}-${c.archKey}.glb unavailable:`, e?.message ?? e)));
    }
  }
  return Promise.allSettled(jobs);
}
```
`glbCharacters.js` after `CLIPS.kickFlair = CLIPS.kick; ...` add: `for (const n of ['kickMartelo', 'kickArmada', 'kickScissor', 'kickPunt', 'kickFlip', 'kickBicycle', 'kickKipUp']) CLIPS[n] = CLIPS.kick; for (const n of ['tauntPoint', 'tauntCry', 'tauntChest', 'tauntGesture', 'tauntLoser']) CLIPS[n] = CLIPS.idle;`.

- [ ] **Step 5: Bake** — start the sink: `Start-Process -NoNewWindow -FilePath node -ArgumentList 'scripts/anim-upload-server.mjs'`; dev server up; open `http://localhost:5173/tools/retarget.html?auto=1&packs=k` in Chrome (claude-in-chrome — needs real WebGL; headless WebKit renders black). Wait for the tab title `retarget: AUTO DONE` (~2-4 min for 19 archetypes). Expected: 19 files `public/assets/anims/mocap-k-*.glb`, each ≤ 900 KB.

- [ ] **Step 6: Contact frames from the analyzer** — in the same page read the log lines `CONTACT kickMartelo (…): RightToeBase peak … @ …s (0.xxx frac)  LeftToeBase …`. For each of the seven kicks set `contactAt` to the **larger-speed foot's frac** (round to 3 dp). Then preview each clip in the tool (ARCH button + clip button) and eyeball: the foot should be at full extension at the contact frame; adjust ±0.03 if needed. Taunts: preview each; if a taunt runs past 1.8 s of meaningful motion tighten `trim`, if it's cut off extend `trim[1]` up to `[0.2, 2.0]` (spec ≤ 1.8 s of clip → keep `trim[1]-trim[0] ≤ 1.8`). Re-run `npx vitest run tests/animsManifest.test.js` → green. (contactAt/trim are runtime meta — no re-bake needed for contactAt; a trim change DOES need a re-bake of pack k: re-run Step 5.)

- [ ] **Step 7: QA + commit** — `node scripts/verify-anims.mjs` → `ALL GOOD`; `npm test` green; browser `?match&nosplash&nointro`: `__skk.chars.away[0].animator.hasClip('tauntPoint') === true` after a few seconds.
```bash
git add src/data/anims.manifest.json tools/retarget.js scripts/anim-upload-server.mjs scripts/verify-anims.mjs src/game/animExtras.js src/game/glbCharacters.js tests/animsManifest.test.js public/assets/anims/mocap-k-*.glb
git commit -m "feat(anims): pack k — seven new special kicks and five taunts baked for every archetype"
```

---

### Task 9: Unlock catalog — new kicks, taunts, stock items, new counters

**Files:**
- Modify: `src/meta/unlocks.js`, `src/game/matchScene.js` (matchStats + PERFECT site), `src/ui/screens/screens.js` (post-game `careerAdd`, Locker categories + copy, menu card count)
- Test: `tests/unlocks.test.js` (append)

**Interfaces:**
- Produces: GEAR entries per Global Constraints; `stock: true` items; `equippedGear(save).taunt`; career counters `games`, `perfects`; `matchStats.perfects`.

- [ ] **Step 1: Failing tests** — append to `tests/unlocks.test.js`:
```js
it('stock items are owned from day one, never toast, and fill an empty slot', () => {
  const s = mem();
  expect(isUnlocked(s, 'taunt-point')).toBe(true);
  expect(checkUnlocks(s).map((g) => g.id)).not.toContain('taunt-point');
  expect(equippedGear(s).taunt?.id).toBe('taunt-point');
  expect(equipGear(s, 'taunt', 'taunt-cry')).toBe(false);          // not earned
  careerAdd(s, { wins: 1 }); checkUnlocks(s);
  expect(equipGear(s, 'taunt', 'taunt-cry')).toBe(true);
  expect(equippedGear(s).taunt.id).toBe('taunt-cry');
});

it('the new kicks and taunts unlock on realistic career marks', () => {
  const s = mem();
  careerAdd(s, { games: 5, runs: 20 });
  expect(checkUnlocks(s).map((g) => g.id).sort()).toEqual(['kick-armada', 'kick-martelo']);
  careerAdd(s, { perfects: 10, hr: 25, blowouts: 3, wins: 10, runs: 30, games: 5 });
  const ids = checkUnlocks(s).map((g) => g.id);
  for (const id of ['kick-punt', 'kick-kipup', 'kick-flip', 'kick-scissor', 'kick-bicycle', 'taunt-gesture', 'taunt-chest', 'taunt-cry']) expect(ids).toContain(id);
  expect(careerGet(s).games).toBe(10);
});
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Catalog** — in `unlocks.js` append to `GEAR` (after the existing kicks):
```js
  // ---- pack k kicks (dev, 2026-08-25): earned on realistic career marks
  { id: 'kick-martelo', cat: 'kick', name: 'MARTELO', clip: 'kickMartelo', mods: { powerMult: 1.4, loftDeg: 6 }, unlock: { stat: 'runs', n: 20 }, hint: '20 career runs', play: '2 power kicks a game · ×1.4 power, +6° loft' },
  { id: 'kick-armada', cat: 'kick', name: 'ARMADA', clip: 'kickArmada', mods: { powerMult: 1.38, curl: 1.3 }, unlock: { stat: 'games', n: 5 }, hint: 'Play 5 games', play: '2 power kicks a game · ×1.38 power, curl ×1.3' },
  { id: 'kick-scissor', cat: 'kick', name: 'SCISSOR KICK', clip: 'kickScissor', mods: { powerMult: 1.4, speed: 1.1 }, unlock: { stat: 'wins', n: 10 }, hint: '10 career wins', play: '2 power kicks a game · ×1.4 power, ×1.1 speed' },
  { id: 'kick-punt', cat: 'kick', name: 'STREET PUNT', clip: 'kickPunt', mods: { powerMult: 1.35, loftDeg: 12 }, unlock: { stat: 'perfects', n: 10 }, hint: '10 PERFECT kicks', play: '2 power kicks a game · ×1.35 power, +12° sky ball' },
  { id: 'kick-flip', cat: 'kick', name: 'FLIP KICK', clip: 'kickFlip', mods: { powerMult: 1.42, curl: -1.3 }, unlock: { stat: 'blowouts', n: 3 }, hint: 'Win 3 games by 5+', play: '2 power kicks a game · ×1.42 power, reverse curl' },
  { id: 'kick-bicycle', cat: 'kick', name: 'BICYCLE KICK', clip: 'kickBicycle', mods: { powerMult: 1.48, loftDeg: 8 }, unlock: { stat: 'runs', n: 50 }, hint: '50 career runs', play: '2 power kicks a game · ×1.48 power, +8° loft' },
  { id: 'kick-kipup', cat: 'kick', name: 'KIP-UP DOUBLE', clip: 'kickKipUp', mods: { powerMult: 1.5 }, unlock: { stat: 'hr', n: 25 }, hint: '25 career home runs', play: '2 power kicks a game · ×1.5 power — the biggest boot in the game' },
  // ---- taunts: the walk-up move before every kick
  { id: 'taunt-point', cat: 'taunt', name: 'THE POINT', clip: 'tauntPoint', stock: true, unlock: null, hint: 'Yours from day one', play: 'your walk-up taunt' },
  { id: 'taunt-cry', cat: 'taunt', name: 'BATTLE CRY', clip: 'tauntCry', unlock: { stat: 'wins', n: 1 }, hint: 'Win your first game', play: 'your walk-up taunt' },
  { id: 'taunt-chest', cat: 'taunt', name: 'CHEST THUMP', clip: 'tauntChest', unlock: { stat: 'hr', n: 5 }, hint: '5 career home runs', play: 'your walk-up taunt' },
  { id: 'taunt-gesture', cat: 'taunt', name: 'COME AT ME', clip: 'tauntGesture', unlock: { stat: 'games', n: 10 }, hint: 'Play 10 games', play: 'your walk-up taunt' },
  { id: 'taunt-loser', cat: 'taunt', name: 'THE L', clip: 'tauntLoser', unlock: { stat: 'crews', n: 3 }, hint: 'Beat 3 crews on their turf', play: 'your walk-up taunt' },
```
Add the existing 8 kicks' `play` lines too (Task 5 §7 text) if not done. Then:
```js
export const TAUNT_IDS = GEAR.filter((g) => g.cat === 'taunt').map((g) => g.id);
```
`careerGet` defaults gain `games: 0, perfects: 0`. `checkUnlocks` filter → `!g.stock && !owned.includes(g.id) && g.unlock && (career[g.unlock.stat] ?? 0) >= g.unlock.n`. `isUnlocked` → `!!gearById(id)?.stock || save.get('gear.unlocked', []).includes(id)`. `equippedGear`: `pick` falls back to the category's stock item: `const g = eq[cat] != null ? gearById(eq[cat]) : null; if (g && isUnlocked(save, g.id)) return g; return GEAR.find((x) => x.cat === cat && x.stock) ?? null;` and return `{ kick, cleats, uniform, taunt: pick('taunt') }`. Update the doc comment's save-key list with `taunt`.
- [ ] **Step 4: Counters** — `matchScene.js` both `matchStats = {...}` sites gain `perfects: 0`; at the PERFECT site (~1385 `if (this.kickingIsPlayer()) this.crownFeed('PERFECT');`) add `if (this.kickingIsPlayer()) this.matchStats.perfects += 1;`. `screens.js` post-game `careerAdd` gains `games: 1, perfects: stats?.perfects ?? 0`.
- [ ] **Step 5: Locker + menu** — `CATS` → `[['kick', 'SPECIAL KICKS — 2 POWER KICKS A GAME · THE CROWN METER MINTS MORE'], ['taunt', 'TAUNTS — YOUR WALK-UP MOVE'], ['cleats', 'CLEATS — REAL SPEED ON THE BASES'], ['uniform', 'UNIFORMS']]`; the bare chip label map `{ kick: 'STOCK KICK', taunt: null, cleats: 'CLASSIC', uniform: 'CLASSIC' }` — skip the bare chip when null (taunt has a stock item in the catalog); chip `<small>` → `${own ? (g.play ?? '') : g.hint.toUpperCase()}`; colour chips (`cleats`/`uniform`) get a swatch: prepend `<i class="swatch" style="background:${g.hex}"></i>` inside the chip. CSS: `.locker-chip .swatch { display:block; width: 100%; height: 14px; border-radius: 6px; margin-bottom: 4px; border: 1px solid rgba(255,255,255,.25); }`. Menu card: ``${save.get('gear.unlocked', []).length}/${ctx.unlocks.GEAR.filter((g) => !g.stock).length} EARNED``.
- [ ] **Step 6: `npm test` green (the `ids.size === GEAR.length` test still holds); commit**
```bash
git add src/meta/unlocks.js src/game/matchScene.js src/ui/screens/screens.js src/ui/ui.css tests/unlocks.test.js
git commit -m "feat(locker): seven new kicks and five taunts with realistic unlocks, stock items, games/perfects counters"
```

---

### Task 10: Locker preview — your captain in the equipped kit and cleats

**Files:**
- Create: `src/ui/lockerPreview.js`
- Modify: `src/game/glbCharacters.js` (export `buildCaptainPreview`), `src/ui/screens/screens.js` (LockerScreen mount/unmount), `src/ui/ui.css`

**Interfaces:**
- Consumes: `buildGlbCharacter`, `loadMocapClips`, `ARCHETYPES`, `BENCHED`, `FEMALE_ARCHETYPES` internals via the new export.
- Produces: `buildCaptainPreview(team, uniformHex, gear) → Promise<char>`; `class LockerPreview { constructor(canvas); show({ team, uniformHex, cleatHex }); destroy() }`.

- [ ] **Step 1: `buildCaptainPreview`** — in `glbCharacters.js`, factor the archetype index math out of `buildTeamCharsGlb` into `function archIdxFor(team, i)` (team offset hash + `BENCHED` remap, identical arithmetic) and use it in both places. Add:
```js
/** The captain (roster[0]) alone, wearing a kit colour + cleats — the Locker
 *  preview. Same model/recolour/tint path as the match so what you see is
 *  what you field. */
export async function buildCaptainPreview(team, uniformHex, gear = null) {
  const idx = archIdxFor(team, 0);
  let clips = null;
  try { clips = await loadMocapClips(`/assets/anims/mocap-${ARCHETYPES[idx].match(/arch-(\w+)\.glb/)?.[1]}.glb`); } catch { clips = null; }
  const char = await buildGlbCharacter({ model: ARCHETYPES[idx], teamColor: uniformHex ?? team.colors?.primary, cleatHex: gear?.cleats?.hex ?? null }, { heightM: 2.05, clips });
  char.data = team.roster?.[0] ?? null;
  return char;
}
```
- [ ] **Step 2: `src/ui/lockerPreview.js`**
```js
// Locker turntable: the player's captain, the real match GLB, in the equipped
// kit + cleats — a kit or cleat change must be SEEN the second it's tapped
// (dev, 2026-08-25). Own tiny renderer: screens sit on an opaque background,
// so the main engine canvas can't show through.
import * as THREE from 'three';
import { buildCaptainPreview } from '../game/glbCharacters.js';

export class LockerPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth || 220, canvas.clientHeight || 260, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.35;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#6a6058', 1.6));
    const key = new THREE.DirectionalLight('#fff4e0', 2.2); key.position.set(2, 4, 3); this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9fd0ff', 0.8); rim.position.set(-3, 3, -3); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(30, (canvas.clientWidth || 220) / (canvas.clientHeight || 260), 0.1, 50);
    this.camera.position.set(0, 1.15, 4.2); this.camera.lookAt(0, 1.0, 0);
    this.char = null; this.token = 0; this.clock = new THREE.Clock(); this.running = true;
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (this.char) { this.char.group.rotation.y += dt * 0.6; this.char.animator?.update?.(dt); }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  async show({ team, uniformHex, gear }) {
    const token = ++this.token;
    const next = await buildCaptainPreview(team, uniformHex, gear);
    if (token !== this.token) return; // a newer equip won the race
    if (this.char) this.scene.remove(this.char.group);
    this.char = next;
    this.char.group.position.set(0, 0, 0);
    this.char.animator?.play?.('idle');
    this.scene.add(this.char.group);
  }

  destroy() { this.running = false; this.renderer.dispose(); }
}
```
- [ ] **Step 3: LockerScreen** — in `mount`: after the `<p class="map-sub">` line add `<div class="locker-stage"><canvas class="locker-preview" width="440" height="520"></canvas><p class="locker-stage-cap"></p></div>`; after `root.appendChild(s)`:
```js
      const team = ctx.playerTeam ?? ctx.data.teams[0];
      const cap = s.querySelector('.locker-stage-cap');
      cap.textContent = `${(team.roster?.[0]?.nick ?? 'YOUR CAPTAIN').toUpperCase()} — ${eq.uniform?.name ?? 'STOCK KIT'} · ${eq.cleats?.name ?? 'STOCK CLEATS'}`;
      try {
        this.preview = new LockerPreview(s.querySelector('.locker-preview'));
        this.preview.show({ team, uniformHex: eq.uniform?.hex ?? null, gear: eq });
      } catch (e) { console.warn('[skk] locker preview unavailable:', e); }
```
and add `unmount() { this.preview?.destroy(); this.preview = null; }` to the returned screen object (check `router.js` calls `unmount` on the previous screen; if it only removes DOM, call `destroy` from a `MutationObserver`-free path: keep a module-level `let livePreview` and destroy it at the top of `mount`). Import `LockerPreview` at the top of `screens.js`.
CSS: `.locker-stage { display:flex; flex-direction:column; align-items:center; gap:4px; } .locker-preview { width: 220px; height: 260px; border-radius: 14px; background: radial-gradient(ellipse at 50% 80%, rgba(245,179,18,.18), transparent 60%); } .locker-stage-cap { font-family: var(--sans); font-weight: 900; font-size: 11px; letter-spacing: .6px; color: var(--gold); }`
- [ ] **Step 4: Verify** — `?nosplash&go=locker`: the captain turns in the stage; equipping Blackout kit re-renders black; equipping a cleat re-renders the shoes. `npm test` green.
- [ ] **Step 5: Commit**
```bash
git add src/ui/lockerPreview.js src/game/glbCharacters.js src/ui/screens/screens.js src/ui/ui.css
git commit -m "feat(locker): live captain turntable in the equipped kit and cleats"
```

---

### Task 11: HR dance bag — never the same twice

**Files:**
- Modify: `src/game/animExtras.js` (`DanceBag`), `src/cinematics/director.js`, `src/game/matchScene.js`, `src/main.js`
- Test: `tests/animExtras.test.js` (append)

**Interfaces:**
- Produces: `class DanceBag { constructor({ recent = [], random = Math.random, onDraw = null }); recent; draw(char) → clipName }`; `MatchScene({ ..., danceBag })`; `cine:crowned { kicker, team, dance }`.

- [ ] **Step 1: Failing tests** (append):
```js
import { DanceBag } from '../src/game/animExtras.js';

it('DanceBag exhausts every loaded dance before any repeat', () => {
  const bag = new DanceBag(); const c = char(X);
  const draws = Array.from({ length: 14 }, () => bag.draw(c));
  expect(new Set(draws).size).toBe(14);
  expect(draws.sort()).toEqual([...X, ...BASE].sort());
});

it('DanceBag never repeats the last dance across a refill', () => {
  for (let trial = 0; trial < 50; trial++) {
    const bag = new DanceBag(); const c = char();
    const draws = Array.from({ length: 12 }, () => bag.draw(c));
    for (let i = 1; i < draws.length; i++) expect(draws[i]).not.toBe(draws[i - 1]);
  }
});

it('DanceBag keeps the saved recent list out of the first draws and reports draws', () => {
  const seen = [];
  const bag = new DanceBag({ recent: ['dance1', 'dance2', 'dance3'], onDraw: (r) => seen.push([...r]) });
  expect(bag.draw(char())).toBe('dance4');
  expect(seen[0]).toEqual(['dance1', 'dance2', 'dance3', 'dance4']);
});

it('DanceBag only hands a character clips it can play', () => {
  const bag = new DanceBag(); const rich = char(X), poor = char();
  bag.draw(rich);
  for (let i = 0; i < 10; i++) expect(BASE).toContain(bag.draw(poor));
});
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** (append to `animExtras.js`):
```js
/** No-repeat dance draws for the HR show (dev, 2026-08-25: "different dance
 *  every time"). A shuffled bag of every playable dance, drawn without
 *  replacement; a refill never leads with the last dance played. `recent`
 *  (saved between matches) is pushed to the back so game one isn't a rerun. */
export class DanceBag {
  constructor({ recent = [], random = Math.random, onDraw = null } = {}) {
    this.recent = [...recent].slice(-4); this.random = random; this.onDraw = onDraw;
    this.known = new Set(); this.bag = [];
  }
  _shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list;
  }
  _learn(char) {
    const fresh = [...X_DANCES.filter((n) => hasClip(char, n)), ...BASE_DANCES].filter((n) => !this.known.has(n));
    if (!fresh.length) return;
    for (const n of fresh) this.known.add(n);
    this.bag = this._shuffle([...this.bag, ...fresh]);
    this.bag = [...this.bag.filter((n) => !this.recent.includes(n)), ...this.bag.filter((n) => this.recent.includes(n))];
  }
  _refill() {
    this.bag = this._shuffle([...this.known]);
    const last = this.recent[this.recent.length - 1];
    if (this.bag.length > 1 && this.bag[0] === last) [this.bag[0], this.bag[1]] = [this.bag[1], this.bag[0]];
  }
  draw(char) {
    this._learn(char);
    if (!this.bag.length) this._refill();
    const playable = (n) => hasClip(char, n) || BASE_DANCES.includes(n);
    let i = this.bag.findIndex(playable);
    if (i < 0) { this._refill(); i = this.bag.findIndex(playable); }
    if (i < 0) return BASE_DANCES[0];
    const [pick] = this.bag.splice(i, 1);
    this.recent = [...this.recent, pick].slice(-4);
    this.onDraw?.(this.recent);
    return pick;
  }
}
```
- [ ] **Step 4: Run → green**
- [ ] **Step 5: Wire** — `director.crowned({ kicker, dance = null })`: `const pick = dance ?? pickDance(kicker);` used at `play(pick)` / `name === pick`. `matchScene` ctor option `danceBag = null` → `this.danceBag = danceBag;`; `homer()` emit gains `dance: this.danceBag?.draw(this.kicker) ?? null`. `main.js`: import `DanceBag`; both `new MatchScene({...})` sites (match + drills ~`:406`) get `danceBag: new DanceBag({ recent: save.get('dance.recent', []), onDraw: (r) => save.set('dance.recent', r) }),`.
- [ ] **Step 6: `npm test` green; commit**
```bash
git add src/game/animExtras.js src/cinematics/director.js src/game/matchScene.js src/main.js tests/animExtras.test.js
git commit -m "feat(show): HR dance draws from a no-repeat bag, history saved between matches"
```

---

### Task 12: Pre-game = splash cards only; the lineup show is deleted

**Files:**
- Create: `src/game/pregame.js`
- Modify: `src/game/matchScene.js` (`lineupIntro` 310-513; `update()` walkout block ~3880-3915; imports; `onTap` comment), `src/main.js` (comment)
- Delete: `src/game/walkoutRoutines.js`, `tests/walkoutRoutines.test.js`
- Test: `tests/pregame.test.js`

**Interfaces:**
- Produces: `PREGAME = { openS: 0.2, splashS: 1.9 }`; `pregameTimeline() → { events: [{ t, kind, side? }], totalS }` with kinds `open`, `splash`, `cleanup`.

- [ ] **Step 1: Failing test** — `tests/pregame.test.js`:
```js
import { it, expect } from 'vitest';
import { PREGAME, pregameTimeline } from '../src/game/pregame.js';

it('stamp, away splash, home splash, then the break — under six seconds', () => {
  const { events, totalS } = pregameTimeline();
  expect(events.map((e) => `${e.kind}${e.side ? ':' + e.side : ''}`)).toEqual(['open', 'splash:away', 'splash:home', 'cleanup']);
  expect(events[1].t).toBe(PREGAME.openS + 0.3);
  expect(events[2].t).toBeCloseTo(events[1].t + PREGAME.splashS);
  expect(totalS).toBeCloseTo(events[2].t + PREGAME.splashS);
  expect(totalS).toBeLessThan(6);
});
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** — `src/game/pregame.js`:
```js
// Match open (dev, 2026-08-25: the lineup dance number is gone — walk-ups
// replace it). STARTING LINEUPS stamp, away crest, home crest, GAME TIME.
export const PREGAME = { openS: 0.2, splashS: 1.9 };
export function pregameTimeline() {
  const ev = [];
  let t = PREGAME.openS; ev.push({ t, kind: 'open' });
  t += 0.3; ev.push({ t, kind: 'splash', side: 'away' });
  t += PREGAME.splashS; ev.push({ t, kind: 'splash', side: 'home' });
  t += PREGAME.splashS; ev.push({ t, kind: 'cleanup' });
  return { events: ev, totalS: t };
}
```
- [ ] **Step 4: Rewrite `lineupIntro`** — keep the `?nointro`/`?drill` early return, `walkoutActive/cinematicLock/cameraLock/letterbox/hint/skip chip/hide everyone` setup, and `cleanup` (the GAME TIME break) verbatim. Delete `starsOf`, `beat`, `BEAT`, `SLOTS`, `squadOn`, `squadPart`, `squadOff`, `card`, `scheduleShow`, the gate, the legacy parade, and the `if (!away.length && !home.length) return done();` guard. Keep `splash` and schedule:
```js
    for (const e of pregameTimeline().events) {
      switch (e.kind) {
        case 'open': this.after(e.t, () => { if (this.walkoutActive) { this.bus.emit('vo', 'lineups'); this.hud.stamp('STARTING LINEUPS', 'crowned'); } }); break;
        case 'splash': splash(this.teams[e.side], e.t); break;
        case 'cleanup': this.after(e.t, cleanup); break;
      }
    }
```
Imports: delete `routineFor`; add `import { pregameTimeline } from './pregame.js';`; drop `allHaveClip` from the animExtras import if unused. Rewrite the method doc comment. In `update()`, delete the whole `if (this.walkoutSquad) {...} else if (this.walkout?.char) {...}` block; delete `this.walkout = null; this.walkoutSquad = null;` lines in `cleanup`/`splash` (grep `this.walkout\b` and `walkoutSquad` → no remaining references except `walkoutActive`).
- [ ] **Step 5: Delete routines** — `git rm src/game/walkoutRoutines.js tests/walkoutRoutines.test.js`; `grep -rn "walkoutRoutines\|routineFor" src tests` → nothing. `main.js` comment near `extrasReady = loadExtrasFor(...)` → "nothing gates on it; the HR dance bag and the walk-up taunts use clips as they land".
- [ ] **Step 6: `npm test` green; browser `?match&nosplash`: stamp → away crest → home crest → GAME TIME → first pitch, ~7 s; SKIP chip works.**
- [ ] **Step 7: Commit**
```bash
git add src/game/pregame.js src/game/matchScene.js src/main.js tests/pregame.test.js
git commit -m "feat(show): pre-game is splash cards + GAME TIME — the lineup dance, routines, shot table and gate are gone"
```

---

### Task 13: Kicker walk-up + taunt before every kick

**Files:**
- Create: `src/game/walkup.js`
- Modify: `src/game/matchScene.js` (`nextAtBat` kicker placement + serve timers; `update()`; `onTap`; `serve()`; ctor/`destroy` for the cleat ring), `src/game/animExtras.js` (`TAUNTS` list)
- Test: `tests/walkup.test.js`

**Interfaces:**
- Consumes: `equippedGear(save).taunt` via `gear.taunt` passed into the scene (`main.js` already passes `gear`), `hasClip`, `stomp`/`boo`/`crowd-cheer` aliases, `hud.walkoutShow` (NOW KICKING card), `gearLine`.
- Produces: `WALKUP = { startX: -3.4, plateX: -0.9, z: 0.4, mps: 1.6, tauntS: 1.5, serveDelayS: 0.3 }`; `walkS()`; `pickTaunt({ isPlayer, equipped, random }) → clipName`; `scene.walkup` state `{ char, phase: 'walk'|'taunt', until, taunt }`; `scene.endWalkup(skipped)`.

- [ ] **Step 1: Failing test** — `tests/walkup.test.js`:
```js
import { it, expect } from 'vitest';
import { WALKUP, walkS, pickTaunt, TAUNTS } from '../src/game/walkup.js';

it('the walk covers start -> plate at the walk speed', () => {
  expect(walkS()).toBeCloseTo((WALKUP.plateX - WALKUP.startX) / WALKUP.mps);
  expect(walkS()).toBeLessThan(1.7);
});

it('your kicker uses the equipped taunt (stock by default); the CPU draws from all five', () => {
  expect(pickTaunt({ isPlayer: true, equipped: { clip: 'tauntCry' } })).toBe('tauntCry');
  expect(pickTaunt({ isPlayer: true, equipped: null })).toBe('tauntPoint');
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickTaunt({ isPlayer: false, equipped: { clip: 'tauntCry' } }));
  expect([...seen].sort()).toEqual([...TAUNTS].sort());
});
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** — `src/game/walkup.js`:
```js
// The kicker's walk-up (dev, 2026-08-25: "they should walk out before they
// kick" + a taunt). Pure numbers + the taunt pick; matchScene moves the body.
export const TAUNTS = ['tauntPoint', 'tauntCry', 'tauntChest', 'tauntGesture', 'tauntLoser'];
export const WALKUP = { startX: -3.4, plateX: -0.9, z: 0.4, mps: 1.6, tauntS: 1.5, serveDelayS: 0.3 };
export const walkS = () => (WALKUP.plateX - WALKUP.startX) / WALKUP.mps;
/** Your kicker: the equipped taunt (THE POINT is stock). CPU: any of the five. */
export function pickTaunt({ isPlayer, equipped, random = Math.random }) {
  if (isPlayer) return equipped?.clip ?? 'tauntPoint';
  return TAUNTS[Math.floor(random() * TAUNTS.length)];
}
```
- [ ] **Step 4: Run → green**
- [ ] **Step 5: Scene wiring** — imports: `import { WALKUP, walkS, pickTaunt } from './walkup.js';`.
  - Ctor after the trail pool: 
```js
    // walk-up cleat ring: a flat ring in the cleat colour under the kicker's feet
    this.cleatRing = null;
    if (this.cleatHex) {
      this.cleatRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.6, 40), new THREE.MeshBasicMaterial({ color: this.cleatHex, transparent: true, opacity: 0.85, depthWrite: false }));
      this.cleatRing.rotation.x = -Math.PI / 2; this.cleatRing.position.y = 0.02; this.cleatRing.visible = false;
      engine.scene.add(this.cleatRing);
    }
    this.walkup = null;
```
  - `destroy()`: `if (this.cleatRing) this.engine.scene.remove(this.cleatRing);`.
  - In `nextAtBat`, replace `this.kicker.group.position.set(-0.9, 0, 0.4); this.faceTo(this.kicker, FIELD_LAYOUT.pitcher, true); this.kicker.animator.play('plate');` with `this.startWalkup();` and replace both `this.after(1.4, () => this.serve());` / `this.after(1.2, () => this.serve());` with nothing (the walk-up serves). Keep the camera/hint lines.
  - New methods (place after `nextAtBat`):
```js
  /** Every kicker walks up to the plate and hits a taunt before the pitch;
   *  a tap skips straight to the plate. Drills skip it. */
  startWalkup() {
    const k = this.kicker;
    const drill = new URLSearchParams(location.search).has('drill') || this.tutorialNoHomer;
    if (drill) { this.placeKickerAtPlate(); this.after(1.2, () => this.serve()); return; }
    const isPlayer = this.kickingIsPlayer();
    k.group.position.set(WALKUP.startX, 0, WALKUP.z);
    this.faceTo(k, new THREE.Vector3(WALKUP.plateX, 0, WALKUP.z), true);
    k.animator.play('walk', { speedFactor: 1 });
    const taunt = pickTaunt({ isPlayer, equipped: this.playerGear?.taunt ?? null });
    this.walkup = { char: k, phase: 'walk', until: this.elapsed + walkS(), taunt: k.animator.hasClip?.(taunt) ? taunt : null, isPlayer };
    this.bus.emit('sfx', 'stomp');
    if (this.cleatRing && isPlayer) { this.cleatRing.visible = true; }
  }

  placeKickerAtPlate() {
    const k = this.kicker;
    k.group.position.set(WALKUP.plateX, 0, WALKUP.z);
    this.faceTo(k, FIELD_LAYOUT.pitcher, true);
    k.animator.play('plate');
    if (this.cleatRing) this.cleatRing.visible = false;
  }

  /** Advance the walk-up; called from update(). */
  updateWalkup(dt) {
    const w = this.walkup;
    if (!w) return;
    const k = w.char;
    if (w.phase === 'walk') {
      k.group.position.x = Math.min(WALKUP.plateX, k.group.position.x + WALKUP.mps * dt);
      if (this.cleatRing?.visible) this.cleatRing.position.set(k.group.position.x, 0.02, k.group.position.z);
      if (this.elapsed >= w.until || k.group.position.x >= WALKUP.plateX) {
        k.group.position.x = WALKUP.plateX;
        if (!w.taunt) return this.endWalkup(false);
        w.phase = 'taunt';
        w.until = this.elapsed + WALKUP.tauntS;
        this.faceCam(k);
        k.animator.play(w.taunt, { onDone: () => { if (this.walkup === w) this.endWalkup(false); } });
        this.bus.emit('sfx', w.isPlayer ? 'crowd-cheer' : 'boo');
        this.field.crowdEnergy = Math.max(this.field.crowdEnergy ?? 0, 0.7);
      }
    } else if (this.elapsed >= w.until) {
      this.endWalkup(false);
    }
  }

  endWalkup(skipped) {
    if (!this.walkup) return;
    this.walkup = null;
    this.placeKickerAtPlate();
    this.after(skipped ? WALKUP.serveDelayS : 0.2, () => this.serve());
  }
```
  - `update()`: call `this.updateWalkup(dt);` right after the pickle-freeze block at the top.
  - `onTap`: after the `cinematicLock` branch add `if (this.walkup) { this.endWalkup(true); return; }`.
  - `serve()`: add `if (this.walkup) return;` to the guards (a stale timer must never serve mid-walk-up).
  - Steal taps during the walk-up are already blocked by the tap returning early; `updateStealRunner` is untouched.
  - The NOW KICKING card (`walkoutShow`) hides after 2.4 s today — extend to `walkS() + WALKUP.tauntS + 0.4`.
- [ ] **Step 6: Verify** — `npm test` green. Browser `?match&nosplash&nointro`: the first kicker walks in from the left on `walk`, taunts facing the camera (`__skk.walkup.phase === 'taunt'`, `animator.name` starts with `taunt`), squares up, pitch arrives; a tap mid-walk snaps to the plate and the pitch comes ~0.3 s later; on defense the CPU kicker does the same in the pitch camera and the crowd boos. Equip BATTLE CRY in the Locker → your kicker plays `tauntCry`.
- [ ] **Step 7: Commit**
```bash
git add src/game/walkup.js src/game/matchScene.js tests/walkup.test.js
git commit -m "feat(show): every kicker walks up to the plate and hits their taunt before the pitch — tap skips"
```

---

### Task 14: Runner edge arrows

**Files:**
- Create: `src/ui/runnerArrows.js`
- Modify: `src/ui/screens/hud.js` (`setRunnerArrows`), `src/ui/ui.css`, `src/game/matchScene.js` (`projectPoint`, `updateRunnerArrows`, call in `update()`)
- Test: `tests/runnerArrows.test.js`

**Interfaces:**
- Produces: `edgeClamp({ x, y, w, h, inset = 24, behind = false }) → { visible, x, y, angle }`; `hud.setRunnerArrows([{ id, x, y, angle, label, number, color, urgent }])`; `scene.projectPoint(v) → { x, y, w, h, behind }`.

- [ ] **Step 1: Failing test** — `tests/runnerArrows.test.js`:
```js
import { it, expect } from 'vitest';
import { edgeClamp } from '../src/ui/runnerArrows.js';
const W = 390, H = 844;

it('a point inside the inset frame is visible and untouched', () => {
  expect(edgeClamp({ x: 200, y: 400, w: W, h: H })).toEqual({ visible: true, x: 200, y: 400, angle: 0 });
});
it('a point off the right edge clamps to the right inset, arrow right', () => {
  const r = edgeClamp({ x: 900, y: 422, w: W, h: H });
  expect(r.visible).toBe(false); expect(r.x).toBeCloseTo(W - 24); expect(r.y).toBeCloseTo(422); expect(r.angle).toBeCloseTo(0);
});
it('a point above the frame clamps to the top edge, arrow up', () => {
  const r = edgeClamp({ x: 195, y: -300, w: W, h: H });
  expect(r.y).toBeCloseTo(24); expect(r.angle).toBeCloseTo(-Math.PI / 2);
});
it('behind the camera mirrors the projection and always clamps', () => {
  const r = edgeClamp({ x: 100, y: 300, w: W, h: H, behind: true });
  expect(r.visible).toBe(false); expect(r.x).toBeGreaterThan(W / 2); expect(r.y).toBeGreaterThan(H / 2);
});
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** — `src/ui/runnerArrows.js`:
```js
// Off-screen runner arrows (dev, 2026-08-25: "better indicators for where the
// runner is when you can't see them"). Pure math: clamp a projected point to
// the inset frame along the ray from screen centre and report the arrow angle.
export function edgeClamp({ x, y, w, h, inset = 24, behind = false }) {
  const cx = w / 2, cy = h / 2;
  let dx = x - cx, dy = y - cy;
  if (behind) { dx = -dx; dy = -dy; }
  const inside = !behind && x >= inset && x <= w - inset && y >= inset && y <= h - inset;
  if (inside) return { visible: true, x, y, angle: 0 };
  const hw = cx - inset, hh = cy - inset;
  const s = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
  return { visible: false, x: cx + dx * s, y: cy + dy * s, angle: Math.atan2(dy, dx) };
}
```
`hud.js` after `setRunnerAlerts`:
```js
  setRunnerArrows(list) {
    let box = this.runnerArrows;
    if (!box) { box = this.runnerArrows = document.createElement('div'); box.className = 'runner-arrows'; this.el.appendChild(box); this._arrowEls = new Map(); }
    const keep = new Set();
    for (const a of list) {
      keep.add(a.id);
      let el = this._arrowEls.get(a.id);
      if (!el) {
        el = document.createElement('div'); el.className = 'runner-arrow';
        el.innerHTML = '<i class="ra-arrow">➤</i><b></b><span></span>';
        box.appendChild(el); this._arrowEls.set(a.id, el);
      }
      el.style.setProperty('--c', a.color);
      el.classList.toggle('urgent', !!a.urgent);
      el.querySelector('b').textContent = `#${a.number}`;
      el.querySelector('span').textContent = a.label;
      el.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) translate(-50%, -50%)`;
      el.querySelector('.ra-arrow').style.transform = `rotate(${a.angle}rad)`;
    }
    for (const [id, el] of this._arrowEls) if (!keep.has(id)) { el.remove(); this._arrowEls.delete(id); }
  }
```
CSS:
```css
.runner-arrows { position: absolute; inset: 0; pointer-events: none; z-index: 7; }
.runner-arrow {
  position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 4px;
  font-family: var(--sans); font-weight: 900; font-size: 11px; letter-spacing: .4px; color: #fff;
  background: rgba(8,9,13,.9); border: 2.5px solid var(--c, var(--teal)); border-radius: 999px; padding: 5px 9px;
  box-shadow: 0 0 12px var(--c, var(--teal)); white-space: nowrap; will-change: transform;
}
.runner-arrow .ra-arrow { font-style: normal; color: var(--c, var(--teal)); font-size: 14px; line-height: 1; display: inline-block; }
.runner-arrow.urgent { animation: chipPulse .6s ease-in-out infinite; border-color: #ffb300; }
.hud.cine .runner-arrows { display: none; }
```
`matchScene.js` (import `edgeClamp`), next to `worldToScreen`:
```js
  projectPoint(v) {
    const r = this.engine.renderer.domElement.getBoundingClientRect();
    const p = v.clone(); p.y += 1.0; p.project(this.engine.camera);
    return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height, w: r.width, h: r.height, behind: p.z > 1 };
  }

  updateRunnerArrows() {
    if (this.cinematicLock || this.walkoutActive || this.walkup || this.duel) { this.hud.setRunnerArrows([]); return; }
    const live = this.runners.filter((r) => r.state === 'running' || r.state === 'held');
    if (this.stealing?.state === 'running' && !live.includes(this.stealing)) live.push(this.stealing);
    if (!live.length) { this.hud.setRunnerArrows([]); return; }
    const color = this.teams[this.match.kickingSide()].colors?.primary ?? '#3ec6b5';
    const BASE = ['1ST', '2ND', '3RD', 'HOME'];
    const out = [];
    live.sort((a, b) => b.targetBase - a.targetBase);
    for (const r of live.slice(0, 3)) {
      const pos = r.state === 'held' ? this.basePos(r.heldAt ?? r.fromBase) : this.runnerWorldPos(r).p;
      const pr = this.projectPoint(pos);
      const c = edgeClamp({ x: pr.x, y: pr.y, w: pr.w, h: pr.h, behind: pr.behind });
      if (c.visible) continue;
      out.push({ id: r.idx, x: c.x, y: c.y, angle: c.angle, number: r.char.number, color,
        label: r.state === 'held' ? `ON ${BASE[r.heldAt ?? r.fromBase]}` : `→${BASE[r.targetBase]}`,
        urgent: r.targetBase === 3 || r === this.stealing });
    }
    this.hud.setRunnerArrows(out);
  }
```
Call `this.updateRunnerArrows();` at the END of `update()`.
- [ ] **Step 4: `npm test` green; browser: a runner on 1st during a fly ball gets an edge chip `#nn →2ND` that disappears when the runners cam picks him up.**
- [ ] **Step 5: Commit**
```bash
git add src/ui/runnerArrows.js src/ui/screens/hud.js src/ui/ui.css src/game/matchScene.js tests/runnerArrows.test.js
git commit -m "feat(hud): screen-edge arrows point at every runner the camera can't see"
```

---

### Task 15: Live diamond

**Files:**
- Modify: `src/ui/screens/hud.js` (markup line 24; `setBases`; `setRunnerDots`), `src/ui/ui.css`, `src/game/matchScene.js` (`updateRunnerDots`)

**Interfaces:**
- Consumes: `r.scoredAt` (Task 4). Produces: `hud.setRunnerDots([{ id, from, to, t, color, scored }])`, bases `-1|0|1|2|3`.

- [ ] **Step 1: Markup + CSS** — replace the `<span class="diamond">…</span>` with:
```html
          <svg class="diamond" viewBox="0 0 44 30" aria-hidden="true">
            <path class="dm-path" d="M22 3 L41 15 L22 27 L3 15 Z"/>
            <rect class="dm-b" data-b="1" x="37" y="11" width="8" height="8"/>
            <rect class="dm-b" data-b="2" x="18" y="-1" width="8" height="8"/>
            <rect class="dm-b" data-b="3" x="-1" y="11" width="8" height="8"/>
            <g class="dm-dots"></g>
          </svg>
```
`setBases` selector → `.diamond .dm-b`. CSS replaces the `.score-bug .diamond` block:
```css
.score-bug .diamond { width: 44px; height: 30px; margin-top: 4px; display: block; overflow: visible; }
.score-bug .dm-path { fill: none; stroke: #323848; stroke-width: 1.5; }
.score-bug .dm-b { fill: #323848; transform-box: fill-box; transform-origin: center; transform: rotate(45deg); rx: 1.5; }
.score-bug .dm-b.on { fill: var(--teal); filter: drop-shadow(0 0 3px var(--teal)); }
.score-bug .dm-dot { r: 3.2px; stroke: #000; stroke-width: 1; }
.score-bug .dm-dot.scored { animation: dotScore .8s ease-out forwards; }
@keyframes dotScore { 0% { r: 3.2px; opacity: 1; } 100% { r: 7px; opacity: 0; } }
```
- [ ] **Step 2: `setRunnerDots`** (after `setBases`):
```js
  setRunnerDots(dots) {
    const XY = { [-1]: [22, 27], 0: [41, 15], 1: [22, 3], 2: [3, 15], 3: [22, 27] };
    const g = this.el.querySelector('.dm-dots'); if (!g) return;
    this._dotEls ??= new Map();
    const keep = new Set();
    for (const d of dots) {
      keep.add(d.id);
      let c = this._dotEls.get(d.id);
      if (!c) { c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.classList.add('dm-dot'); g.appendChild(c); this._dotEls.set(d.id, c); }
      const [ax, ay] = XY[d.from] ?? XY[-1], [bx, by] = XY[d.to] ?? XY[3];
      const t = Math.max(0, Math.min(1, d.t));
      c.setAttribute('cx', (ax + (bx - ax) * t).toFixed(1)); c.setAttribute('cy', (ay + (by - ay) * t).toFixed(1));
      c.setAttribute('fill', d.color); c.classList.toggle('scored', !!d.scored);
    }
    for (const [id, c] of this._dotEls) if (!keep.has(id)) { c.remove(); this._dotEls.delete(id); }
  }
```
- [ ] **Step 3: Scene feed** (after `updateRunnerArrows`; call it right after that call in `update()`):
```js
  updateRunnerDots() {
    const color = this.teams[this.match.kickingSide()].colors?.primary ?? '#3ec6b5';
    const dots = [];
    for (const r of this.runners) {
      if (r.state === 'running') dots.push({ id: r.idx, from: r.fromBase, to: r.targetBase, t: r.sim.progressM / this.tuning.running.basePathM, color });
      else if (r.state === 'held') dots.push({ id: r.idx, from: r.heldAt ?? r.fromBase, to: r.heldAt ?? r.fromBase, t: 0, color });
      else if (r.state === 'scored' && r.scoredAt != null && this.elapsed - r.scoredAt < 0.8) dots.push({ id: r.idx, from: 3, to: 3, t: 1, color, scored: true });
    }
    if (this.stealing?.state === 'running' && !this.runners.includes(this.stealing)) {
      const s = this.stealing;
      dots.push({ id: s.idx, from: s.fromBase, to: s.targetBase, t: s.sim.progressM / this.tuning.running.basePathM, color });
    }
    this.hud.setRunnerDots(dots);
  }
```
- [ ] **Step 4: `npm test` green; browser: dots slide on a hit, flash home on a score. Commit**
```bash
git add src/ui/screens/hud.js src/ui/ui.css src/game/matchScene.js
git commit -m "feat(hud): live score-bug diamond — runner dots slide the basepaths, flash home on a score"
```

---

### Task 16: Playwright harness for the round

**Files:**
- Create: `scripts/round-e2e.mjs`

- [ ] **Step 1: Write the harness**
```js
// E2E probe for the look/gear/sound/walk-up/runners round (2026-08-25).
// Drives the REAL game in Playwright WebKit. Run: node scripts/round-e2e.mjs (dev server on :5173)
//  1. PRE-GAME — stamp, two splashes, GAME TIME, first pitch; SKIP chip works.
//  2. WALK-UP — kicker walks in on 'walk', taunts, squares up; a tap skips to the plate; serve follows.
//  3. POWER KICK — charges light the button; arm plays crown-arm; label carries the name.
//  4. ARROWS — a runner placed off-frame gets an edge chip.
//  5. SFX — every alias resolves; HUD presses emit ui-tap/ui-confirm.
//  6. DANCE BAG — distinct draws, no back-to-back repeat.
//  7. MSAA — composer target carries 4 samples; setSamples(2) survives a frame.
//  8. LOCKER — the preview canvas renders non-black pixels.
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures += 1; return cond; };
async function poll(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { const v = await page.evaluate(fn); if (v) return v; await page.waitForTimeout(60); }
  console.log(`TIMEOUT  ${label}`); return null;
}
async function boot(page, q) {
  await page.goto(`${BASE}/?${q}`, { waitUntil: 'domcontentloaded' });
  if (!(await poll(page, () => !!window.__skk, 20000, 'scene boot'))) throw new Error('scene never booted');
  await page.evaluate(() => { window.__sfxLog = []; window.__bus.on('sfx', (n) => window.__sfxLog.push(n)); document.querySelector('.element-intro')?.dispatchEvent(new Event('pointerdown')); });
}

async function pregameScenario(page) {
  console.log('\n--- 1: PRE-GAME ---');
  await boot(page, 'match&nosplash');
  ok(!!(await poll(page, () => window.__skk.walkoutActive === true, 10000, 'pregame')), 'pre-game started');
  ok(!!(await poll(page, () => !!document.querySelector('.team-splash, .splash-card'), 5000, 'splash')), 'a team splash card is on screen');
  await page.evaluate(() => document.querySelector('.skip-chip')?.dispatchEvent(new Event('pointerdown')));
  ok(!!(await poll(page, () => [...document.querySelectorAll('.stamp span')].some((s) => /GAME TIME/i.test(s.textContent)), 3000, 'GAME TIME')), 'GAME TIME break after skip');
  ok(!!(await poll(page, () => !window.__skk.walkoutActive, 5000, 'pregame end')), 'pre-game ended');
}

async function walkupScenario(page) {
  console.log('\n--- 2: WALK-UP ---');
  await boot(page, 'match&nosplash&nointro');
  const w = await poll(page, () => window.__skk.walkup?.phase === 'walk' && window.__skk.kicker.animator.name === 'walk', 15000, 'walk phase');
  ok(!!w, 'kicker walks in on the walk clip');
  const x0 = await page.evaluate(() => window.__skk.kicker.group.position.x);
  await page.waitForTimeout(500);
  const x1 = await page.evaluate(() => window.__skk.kicker.group.position.x);
  ok(x1 > x0 + 0.4, `the kicker actually travels (${(x1 - x0).toFixed(2)} m in 0.5 s)`);
  const taunted = await poll(page, () => window.__skk.walkup?.phase === 'taunt' || window.__skk.walkup === null, 4000, 'taunt or end');
  ok(!!taunted, 'walk-up reaches the taunt (or ends cleanly when pack k is not loaded)');
  const served = await poll(page, () => window.__skk.walkup === null && ['PITCH', 'PITCH_SELECT'].includes(window.__skk.phase), 8000, 'serve');
  ok(!!served, 'the pitch follows the walk-up');
  // tap-skip on the NEXT at-bat: force one
  await page.evaluate(() => { const s = window.__skk; s.clearTimers?.(); s.phase = 'SETUP'; s.nextAtBat(); });
  await poll(page, () => window.__skk.walkup?.phase === 'walk', 4000, 'walk 2');
  await page.evaluate(() => window.__skk.onTap({ x: 200, y: 500 }));
  const snapped = await page.evaluate(() => window.__skk.walkup === null && Math.abs(window.__skk.kicker.group.position.x - (-0.9)) < 0.01 && window.__skk.kicker.animator.name === 'plate');
  ok(snapped, 'a tap snaps the kicker to the plate');
  ok(!!(await poll(page, () => ['PITCH', 'PITCH_SELECT'].includes(window.__skk.phase), 3000, 'serve after skip')), 'serve follows the skip');
  ok(await page.evaluate(() => window.__sfxLog.includes('stomp')), 'stomp bed played under the walk-up');
}

async function powerKickScenario(page) {
  console.log('\n--- 3: POWER KICK ---');
  await poll(page, () => ['PITCH', 'SETUP', 'PITCH_SELECT'].includes(window.__skk.phase), 10000, 'at-bat');
  const state = await page.evaluate(() => {
    const s = window.__skk; s.power.charges = 1; s.refreshHud();
    const btn = document.querySelector('.special-btn');
    const lit = btn.classList.contains('ready'); const label = btn.querySelector('.pk-label').textContent;
    btn.dispatchEvent(new Event('pointerdown'));
    return { lit, label, armed: s.power.armed, sfx: window.__sfxLog.includes('crown-arm'), armedClass: btn.classList.contains('armed'), isPlayer: s.kickingIsPlayer() };
  });
  ok(state.lit, 'a banked charge lights the button');
  ok(/×1$/.test(state.label), `label carries the count (${state.label})`);
  ok(!state.isPlayer || (state.armed && state.armedClass && state.sfx), 'tap arms the kick with the crown-arm sting (when kicking)');
}

async function arrowsScenario(page) {
  console.log('\n--- 4: ARROWS ---');
  const res = await page.evaluate(() => {
    const s = window.__skk; s.walkup = null;
    const r = s.makeRunner(0, s.chars.away[1], 0); r.sim.progressM = 4; s.runners.push(r);
    s.phase = 'LIVE'; s.cinematicLock = false;
    s.engine.camera.position.set(0, 3, 30); s.engine.camera.lookAt(0, 1, 60);
    s.updateRunnerArrows();
    const n = document.querySelectorAll('.runner-arrow').length; const txt = document.querySelector('.runner-arrow span')?.textContent;
    s.runners.length = 0; s.updateRunnerArrows(); s.updateRunnerDots();
    return { n, txt };
  });
  ok(res.n === 1, `one edge chip for the off-frame runner (${res.n})`);
  ok(res.txt === '→2ND', `chip labels the target base (${res.txt})`);
}

async function sfxScenario(page) {
  console.log('\n--- 5: SFX ---');
  const res = await page.evaluate(async () => {
    const mod = await import('/src/engine/audio.js');
    const missing = Object.entries(mod.SFX_ALIAS).filter(([, a]) => !a.synth && !mod.SFX_FILES[a.file]).map(([k]) => k);
    window.__sfxLog.length = 0;
    document.querySelector('.throw-pad button')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    document.querySelector('.pitch-select button')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    return { missing, log: [...window.__sfxLog] };
  });
  ok(res.missing.length === 0, `every alias resolves (${res.missing.join(', ') || 'none missing'})`);
  ok(res.log.includes('ui-confirm') || res.log.includes('ui-tap'), `HUD presses are heard (${res.log.join(',')})`);
}

async function danceScenario(page) {
  console.log('\n--- 6: DANCE BAG ---');
  const d = await page.evaluate(() => { const s = window.__skk; const c = s.chars.away[0]; return Array.from({ length: 14 }, () => s.danceBag.draw(c)); });
  ok(new Set(d).size >= 4, `distinct draws: ${new Set(d).size}/14 (${d.join(',')})`);
  for (let i = 1; i < d.length; i++) if (!ok(d[i] !== d[i - 1], `no back-to-back repeat at ${i}`)) break;
}

async function msaaScenario(page) {
  console.log('\n--- 7: MSAA ---');
  const r = await page.evaluate(async () => {
    const e = window.__engine; const s4 = e.composer.renderTarget1.samples; e.setSamples(2);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    return { s4, s2: e.composer.renderTarget1.samples };
  });
  ok(r.s4 === 4, `composer target starts at 4 samples (${r.s4})`);
  ok(r.s2 === 2, 'setSamples(2) survives a frame');
}

async function lockerScenario(page) {
  console.log('\n--- 8: LOCKER ---');
  await page.goto(`${BASE}/?nosplash&go=locker`, { waitUntil: 'domcontentloaded' });
  const lit = await poll(page, () => {
    const c = document.querySelector('.locker-preview'); if (!c) return false;
    const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return false;
    const px = new Uint8Array(4 * 64); gl.readPixels(Math.floor(c.width / 2) - 8, Math.floor(c.height / 2) - 4, 16, 4, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px.some((v, i) => i % 4 !== 3 && v > 12);
  }, 15000, 'preview pixels');
  ok(!!lit, 'the Locker preview renders the captain');
}

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
try {
  await pregameScenario(page); await walkupScenario(page); await powerKickScenario(page);
  await arrowsScenario(page); await sfxScenario(page); await danceScenario(page); await msaaScenario(page); await lockerScenario(page);
} finally { await browser.close(); }
console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASS'}`);
process.exit(failures ? 1 : 0);
```
Notes: the splash selector in scenario 1 must match what `hud.teamSplash` creates (read `teamSplash` at hud.js:529 and use its class); if WebKit's `preserveDrawingBuffer` defeats the readPixels check in scenario 8, construct the preview renderer with `preserveDrawingBuffer: true` (cheap at 220×260).
- [ ] **Step 2: Run** — `node scripts/round-e2e.mjs` → `ALL PASS`; fix the feature (not the assertion) for any FAIL.
- [ ] **Step 3: Commit**
```bash
git add scripts/round-e2e.mjs
git commit -m "test(e2e): pre-game, walk-up, power kick, runner arrows, sfx wiring, dance bag, MSAA and locker probes"
```

---

### Task 17: Real-play pass, PR

- [ ] **Step 1: Real-play pass in Chrome** (claude-in-chrome, `http://localhost:5173/?match&nosplash`, portrait ~390×844). Per [verify-gameplay-by-real-play]: play, don't simulate. Screenshots for: (1) edge quality `?msaa=0` vs default + brightness; (2) pre-game crests → GAME TIME; (3) walk-up + taunt on both sides, tap-skip; (4) two homers → two dances; (5) POWER KICK lit/armed/spent with a pack-k kick equipped; (6) cleat ring + trail; (7) arrows on a deep fly + the live diamond; (8) Locker: preview changes on kit/cleat/taunt equip; (9) console `__bus.on('sfx', console.log)` shows taps/score/safe/out/foul/inning. Record gaps honestly in the spec under `## Real-play pass results (2026-08-25)`.
- [ ] **Step 2: Full suite** — `npm test`, `node scripts/verify-anims.mjs`, `node scripts/booth-sound-e2e.mjs`, `node scripts/round-e2e.mjs` → all green.
- [ ] **Step 3: Spec results + memory** — append the results section to the spec; update the SKK status memory file + `MEMORY.md` line (round built + verified locally, PR open, deploy gated on "push").
```bash
git add docs/superpowers/specs/2026-08-25-look-gear-sound-walkout-runners-design.md
git commit -m "docs(spec): real-play pass results for the look/gear/sound/walk-up/runners round"
```
- [ ] **Step 4: Open the PR (do NOT merge or deploy)**
```bash
git push -u origin feat/walkout-show-city-sound
gh pr create --title "Look, gear, sound, walk-up & runners round" --body "$(cat <<'EOF'
## Summary
- MSAA on the composer + perf watchdog; global light lift; grain/CA off — smooth, brighter characters and surfaces
- Gear that matters: POWER KICK charges, cleats with real speed + trail + ring, YOUR GEAR strip, Locker turntable preview, 7 new kicks + 5 taunts (pack k) with realistic unlocks
- 15 new SFX + regenerated kick/catch/peg/cheer; every HUD press, run, ruling, out, foul, inning and unlock is heard
- The lineup dance is gone: pre-game is splash cards + GAME TIME; every kicker walks up and taunts before the pitch (tap skips)
- HR dance draws from a no-repeat bag saved between matches
- Screen-edge runner arrows + a live score-bug diamond
- Includes the previously uncommitted booth/sound/contact round (VO queue, pronouns, GAME TIME break)

Spec: docs/superpowers/specs/2026-08-25-look-gear-sound-walkout-runners-design.md

## Test plan
- [x] npm test
- [x] node scripts/verify-anims.mjs
- [x] node scripts/booth-sound-e2e.mjs
- [x] node scripts/round-e2e.mjs
- [x] Real-play pass in Chrome (screenshots in the spec)
- [ ] Dev phone check on prod after "push"

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01VHDK3xmrcqrgDpzGCVSg81
EOF
)"
```
Report the PR URL. Merge/deploy waits for the dev's explicit "push".

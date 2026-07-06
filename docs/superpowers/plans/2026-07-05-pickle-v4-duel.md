# Pickle v4 "THE DUEL" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six-layer pickle mini-game with a one-button timing duel (GO!/SPIN offense, THROW/PEG defense) on a unified rundown state machine, plus a phase-independent runner watchdog that kills the P0 infinite-runner glitch.

**Architecture:** A new headless module `src/game/pickleDuel.js` owns all duel DECISIONS (windows, timers, i-frames, AI clocks) in 1D lane terms; `matchScene.js` stays the conductor that executes effects (RunnerSim movement, throws, anims, camera). `this.pickle` (offense) and `this.rundownView` (defense) merge into ONE `this.duel` object used by both sides. A new `src/game/runnerWatchdog.js` force-settles any runner stuck 'running' with no progress, in EVERY phase (steals happen pre-kick in SETUP/PITCH where the old 14s LIVE watchdog never ran).

**Tech Stack:** Vite + Three.js r0.184, plain JS (no TS), Vitest headless tests, DOM HUD. Spec: `docs/superpowers/specs/2026-07-05-pickle-v4-duel-design.md`.

## Global Constraints

- All gameplay numbers go in `src/data/tuning.json` (project rule: "ALL gameplay tuning").
- Headless game logic modules must not import three.js or DOM (pattern: `baseRunning.js`, `pitchPattern.js`).
- The kick/pitch input camera framings are INPUT-CRITICAL — never touch `SHOTS.kick` / `SHOTS.pitchSelect`.
- Player identity cue during a duel = ONE teal ring under the controlled character. No other aids (spec).
- Existing test suite (113 tests) must stay green; `npm run build` must stay clean.
- Verify by REAL PLAY before claiming done ([[verify-gameplay-by-real-play]]): drive the duel in-engine on both sides.
- Windows PowerShell 5.1: no `&&` chaining; avoid double quotes inside `git commit -m` here-strings.
- Commits on branch `feat/pickle-v4-duel` (already created; spec is its first commit). Do NOT push/merge without dev authorization ("push").

---

### Task 1: PickleDuel headless module — offense verbs (GO / SPIN / tag / peg-dodge)

**Files:**
- Create: `src/game/pickleDuel.js`
- Create: `tests/pickleDuel.test.js`
- Modify: `src/data/tuning.json` (add `duel` section + `special.gain.pickleEscape`)

**Interfaces:**
- Consumes: `tuning.duel` knobs (added in this task).
- Produces (used by Tasks 2, 5, 6):
  - `shuttleDir({ runnerT, ballT }) -> -1|1` — pure helper; -1 = drift toward the back (retreat) bag.
  - `class PickleDuel` constructed as `new PickleDuel({ mine, difficulty, tuning, rng })`:
    - fields: `mine`, `committed`, `commitDir (-1|1)`, `goGrade (0..1)`, `spinT`, `spinCd`, `recoverT`, `pegWindupT`, `outcome (null|'safe'|'jackpot'|'out')`
    - `tick(dt)` — decays all timers; entering recovery when a spin expires unused
    - `canGo(ballFlying) -> bool`
    - `go({ flightFrac, throwToEnd }) -> bool` — `throwToEnd`: 1 = ball heading to the forward end, 0 = back end; sets `commitDir` AWAY from that end and `goGrade = 1 - flightFrac`
    - `spin() -> bool`
    - `runRate() -> tapsPerSec` (feeds RunnerSim: shuttle rate, or committed burst scaled by goGrade)
    - `tagAttempt() -> 'tagged'|'dodged'` — dodged while spin i-frames live (consumes the spin)
    - `pegImpact({ lateralM }) -> 'hit'|'dodged'` — dodged if spin live OR |lateralM| ≥ tuning.duel.pegJukeDodgeM (dev: jukes AND spins dodge pegs)

- [ ] **Step 1: Add the tuning knobs**

In `src/data/tuning.json`, inside `"special": { "gain": { ... } }` add `"pickleEscape": 60` (alongside the existing `"homerun"` etc. — check `meterMax` first; if `meterMax` is 100 this is a big surge, scale to ~0.6 × meterMax). At the top level add:

```json
"duel": {
  "shuttleRate": 3.2,
  "goRateBase": 8.0,
  "goRateGradeBonus": 4.0,
  "spinIframeS": 0.5,
  "spinCooldownS": 1.7,
  "spinRecoverS": 0.45,
  "pegWindupS": 0.55,
  "pegJukeDodgeM": 0.7,
  "maxRelays": 6,
  "aiRelayS":    { "Rookie": 1.35, "Street": 1.0,  "King": 0.8  },
  "aiPegChance": { "Rookie": 0.25, "Street": 0.4,  "King": 0.55 },
  "aiGoReactS":  { "Rookie": 0.55, "Street": 0.36, "King": 0.24 },
  "aiSpinChance":{ "Rookie": 0.35, "Street": 0.55, "King": 0.75 },
  "watchdogStallS": 6
}
```

Run `npm test -- tests/data.test.js` — if it validates tuning keys, extend the expectation; expected PASS.

- [ ] **Step 2: Write the failing tests**

`tests/pickleDuel.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { PickleDuel, shuttleDir } from '../src/game/pickleDuel.js';
import tuning from '../src/data/tuning.json';

const mk = (over = {}) => new PickleDuel({ mine: true, difficulty: 'Street', tuning, rng: () => 0.5, ...over });

describe('shuttleDir', () => {
  it('drifts away from the ball', () => {
    expect(shuttleDir({ runnerT: 0.5, ballT: 0.9 })).toBe(-1); // ball ahead -> retreat
    expect(shuttleDir({ runnerT: 0.5, ballT: 0.1 })).toBe(1);  // ball behind -> press on
  });
});

describe('GO', () => {
  it('is only legal while the ball is flying', () => {
    const d = mk();
    expect(d.canGo(false)).toBe(false);
    expect(d.canGo(true)).toBe(true);
  });
  it('commits AWAY from the throw target and grades earlier breaks higher', () => {
    const d = mk();
    expect(d.go({ flightFrac: 0.2, throwToEnd: 1 })).toBe(true);
    expect(d.committed).toBe(true);
    expect(d.commitDir).toBe(-1);            // ball heading forward -> break back
    expect(d.goGrade).toBeCloseTo(0.8);
    const d2 = mk();
    d2.go({ flightFrac: 0.9, throwToEnd: 0 });
    expect(d2.commitDir).toBe(1);            // ball heading back -> break forward
    expect(d2.goGrade).toBeCloseTo(0.1);
  });
  it('cannot double-commit', () => {
    const d = mk();
    d.go({ flightFrac: 0.5, throwToEnd: 1 });
    expect(d.go({ flightFrac: 0.5, throwToEnd: 0 })).toBe(false);
  });
  it('runRate: shuttle when uncommitted, graded burst when committed', () => {
    const d = mk();
    expect(d.runRate()).toBe(tuning.duel.shuttleRate);
    d.go({ flightFrac: 0, throwToEnd: 1 });
    expect(d.runRate()).toBeCloseTo(tuning.duel.goRateBase + tuning.duel.goRateGradeBonus);
  });
});

describe('SPIN', () => {
  it('grants i-frames that dodge a tag once, then cooldown gates it', () => {
    const d = mk();
    expect(d.spin()).toBe(true);
    expect(d.tagAttempt()).toBe('dodged');
    expect(d.tagAttempt()).toBe('tagged');   // i-frames consumed by the dodge
    expect(d.spin()).toBe(false);            // cooldown
  });
  it('an unused spin ends in recovery frames that block GO', () => {
    const d = mk();
    d.spin();
    d.tick(tuning.duel.spinIframeS + 0.01);  // spin expires, nothing dodged
    expect(d.recoverT).toBeGreaterThan(0);
    expect(d.canGo(true)).toBe(false);
    d.tick(tuning.duel.spinRecoverS);
    expect(d.canGo(true)).toBe(true);
  });
});

describe('PEG resolution', () => {
  it('spin i-frames dodge a peg', () => {
    const d = mk();
    d.spin();
    expect(d.pegImpact({ lateralM: 0 })).toBe('dodged');
  });
  it('a big juke offset dodges a peg', () => {
    const d = mk();
    expect(d.pegImpact({ lateralM: tuning.duel.pegJukeDodgeM + 0.1 })).toBe('dodged');
  });
  it('flat-footed runner is hit', () => {
    const d = mk();
    expect(d.pegImpact({ lateralM: 0 })).toBe('hit');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/pickleDuel.test.js`
Expected: FAIL — cannot resolve `../src/game/pickleDuel.js`.

- [ ] **Step 4: Implement the module**

`src/game/pickleDuel.js`:

```js
// Pickle v4 "THE DUEL" — headless decision brain for the rundown mini-game.
// ONE machine serves both sides (mine=true: player offense, false: player
// defense). All positions are t along the contested lane: 0 = the BACK bag
// (the runner's retreat/safety), 1 = the FORWARD bag (the steal). The
// conductor (matchScene) executes effects; this owns windows and timers.

/** Which way the trapped runner drifts RIGHT NOW: always away from the ball. */
export function shuttleDir({ runnerT, ballT }) {
  return ballT > runnerT ? -1 : 1;
}

export class PickleDuel {
  constructor({ mine, difficulty, tuning, rng = Math.random }) {
    this.mine = mine;
    this.D = tuning.duel;
    this.difficulty = difficulty;
    this.rng = rng;
    this.committed = false;
    this.commitDir = 0;
    this.goGrade = 0;
    this.spinT = 0;
    this.spinCd = 0;
    this.recoverT = 0;
    this.pegWindupT = 0;
    this.relays = 0;
    this.outcome = null;
    this._spinDodged = false;
    this._aiT = this.D.aiRelayS[difficulty] ?? 1.0;
    this._aiGoT = 0;      // >0: AI runner is reacting to a live throw
    this._aiSpinAt = -1;  // scheduled AI spin inside a peg windup
  }

  tick(dt) {
    const wasSpinning = this.spinT > 0;
    this.spinT = Math.max(0, this.spinT - dt);
    this.spinCd = Math.max(0, this.spinCd - dt);
    this.recoverT = Math.max(0, this.recoverT - dt);
    this.pegWindupT = Math.max(0, this.pegWindupT - dt);
    if (wasSpinning && this.spinT === 0 && !this._spinDodged) {
      this.recoverT = this.D.spinRecoverS; // whiffed spin = vulnerable
    }
  }

  // ---------- offense verbs ----------
  canGo(ballFlying) {
    return !!ballFlying && !this.committed && this.recoverT <= 0;
  }

  /** @param {{flightFrac:number, throwToEnd:0|1}} o break away from the throw */
  go({ flightFrac, throwToEnd }) {
    if (!this.canGo(true)) return false;
    this.committed = true;
    this.commitDir = throwToEnd === 1 ? -1 : 1;
    this.goGrade = Math.max(0, Math.min(1, 1 - flightFrac));
    return true;
  }

  spin() {
    if (this.spinCd > 0 || this.recoverT > 0) return false;
    this.spinT = this.D.spinIframeS;
    this.spinCd = this.D.spinCooldownS;
    this._spinDodged = false;
    return true;
  }

  /** taps/s fed to RunnerSim: modest shuttle, or a graded committed burst */
  runRate() {
    if (!this.committed) return this.D.shuttleRate;
    return this.D.goRateBase + this.D.goRateGradeBonus * this.goGrade;
  }

  // ---------- resolution ----------
  tagAttempt() {
    if (this.spinT > 0) {
      this.spinT = 0;
      this._spinDodged = true;
      return 'dodged';
    }
    return 'tagged';
  }

  /** spins OR a live juke offset dodge a peg (dev requirement) */
  pegImpact({ lateralM = 0 } = {}) {
    if (this.spinT > 0) {
      this.spinT = 0;
      this._spinDodged = true;
      return 'dodged';
    }
    if (Math.abs(lateralM) >= this.D.pegJukeDodgeM) return 'dodged';
    return 'hit';
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/pickleDuel.test.js`
Expected: PASS (all).

Run: `npx vitest run`
Expected: 113 existing + new all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/pickleDuel.js tests/pickleDuel.test.js src/data/tuning.json
git commit -m "feat(pickle): PickleDuel headless brain - GO/SPIN windows, tag and peg resolution"
```

---

### Task 2: PickleDuel — defense verbs + AI clocks (both sides)

**Files:**
- Modify: `src/game/pickleDuel.js`
- Modify: `tests/pickleDuel.test.js`

**Interfaces:**
- Produces (used by Tasks 5, 6):
  - `startPeg() -> bool` — begins the telegraphed windup (`pegWindupT` counts down; conductor releases the peg when it hits 0)
  - `canThrow() -> bool` — defense relay legality (not mid-windup)
  - `aiDefense(dt, { ballFlying, holderDist, runnerCommitted }) -> 'relay'|'peg'|null` — drives the AI side when `mine === true`
  - `aiOffense(dt, { ballFlying, flightFrac, throwToEnd, holderDist, pegIncoming }) -> {type:'go',flightFrac,throwToEnd}|{type:'spin'}|null` — drives the AI runner when `mine === false`

- [ ] **Step 1: Write the failing tests (append to tests/pickleDuel.test.js)**

```js
describe('defense verbs', () => {
  it('startPeg opens a windup and blocks a second peg / relay until it lands', () => {
    const d = mk({ mine: false });
    expect(d.startPeg()).toBe(true);
    expect(d.pegWindupT).toBeCloseTo(tuning.duel.pegWindupS);
    expect(d.startPeg()).toBe(false);
    expect(d.canThrow()).toBe(false);
    d.tick(tuning.duel.pegWindupS + 0.01);
    expect(d.canThrow()).toBe(true);
  });
});

describe('AI defense (player offense)', () => {
  it('relays on its difficulty clock while the runner is uncommitted and far', () => {
    const d = mk({ mine: true });
    expect(d.aiDefense(0.1, { ballFlying: false, holderDist: 6, runnerCommitted: false })).toBe(null);
    expect(d.aiDefense(tuning.duel.aiRelayS.Street, { ballFlying: false, holderDist: 6, runnerCommitted: false })).toBe('relay');
  });
  it('pegs a committed runner (rng under aiPegChance)', () => {
    const d = mk({ mine: true, rng: () => 0.0 });
    d.aiDefense(tuning.duel.aiRelayS.Street, { ballFlying: false, holderDist: 6, runnerCommitted: true });
    // committed runner + roll passes -> peg
    expect(d.aiDefense(tuning.duel.aiRelayS.Street, { ballFlying: false, holderDist: 6, runnerCommitted: true })).toBe('peg');
  });
  it('stops relaying after maxRelays (forces a resolution)', () => {
    const d = mk({ mine: true, rng: () => 0.99 });
    let relays = 0;
    for (let i = 0; i < 20; i++) {
      if (d.aiDefense(2.0, { ballFlying: false, holderDist: 6, runnerCommitted: false }) === 'relay') { relays++; d.relays++; }
    }
    expect(relays).toBeLessThanOrEqual(tuning.duel.maxRelays);
  });
});

describe('AI offense (player defense)', () => {
  it('breaks (go) after its reaction time once a throw is in the air', () => {
    const d = mk({ mine: false });
    expect(d.aiOffense(0.05, { ballFlying: true, flightFrac: 0.1, throwToEnd: 1, holderDist: 6, pegIncoming: false })).toBe(null);
    const act = d.aiOffense(tuning.duel.aiGoReactS.Street, { ballFlying: true, flightFrac: 0.3, throwToEnd: 1, holderDist: 6, pegIncoming: false });
    expect(act?.type).toBe('go');
  });
  it('spins against an incoming peg when the roll passes', () => {
    const d = mk({ mine: false, rng: () => 0.0 });
    const act = d.aiOffense(0.1, { ballFlying: false, flightFrac: 0, throwToEnd: 0, holderDist: 2, pegIncoming: true });
    expect(act?.type).toBe('spin');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/pickleDuel.test.js`
Expected: FAIL — `startPeg is not a function` etc.

- [ ] **Step 3: Implement (append methods to PickleDuel)**

```js
  // ---------- defense verbs ----------
  canThrow() { return this.pegWindupT <= 0; }

  startPeg() {
    if (this.pegWindupT > 0) return false;
    this.pegWindupT = this.D.pegWindupS;
    return true;
  }

  // ---------- AI drivers (whichever side the human is NOT playing) ----------
  /** AI defense vs the human runner. Call once per frame; returns an action. */
  aiDefense(dt, { ballFlying, holderDist, runnerCommitted }) {
    if (ballFlying || this.pegWindupT > 0) return null;
    this._aiT -= dt;
    if (this._aiT > 0) return null;
    this._aiT = this.D.aiRelayS[this.difficulty] ?? 1.0;
    const pegChance = this.D.aiPegChance[this.difficulty] ?? 0.4;
    if (runnerCommitted && this.rng() < pegChance) return 'peg';
    if (this.relays >= this.D.maxRelays) return null; // stop juggling — close for the tag
    if (holderDist > 4.2) return 'relay';
    return null; // close enough — keep chasing for the tag
  }

  /** AI runner vs the human defense. Mirrors the human verbs. */
  aiOffense(dt, { ballFlying, flightFrac, throwToEnd, holderDist, pegIncoming }) {
    // peg incoming: roll once per windup to schedule a dodge
    if (pegIncoming && this._aiSpinAt < 0) {
      const chance = this.D.aiSpinChance[this.difficulty] ?? 0.5;
      this._aiSpinAt = this.rng() < chance ? 0 : 1e9; // now, or never this windup
    }
    if (!pegIncoming) this._aiSpinAt = -1;
    if (pegIncoming && this._aiSpinAt !== 1e9 && this.spinCd <= 0) return { type: 'spin' };
    if (ballFlying && !this.committed) {
      this._aiGoT += dt;
      const react = this.D.aiGoReactS[this.difficulty] ?? 0.36;
      if (this._aiGoT >= react) return { type: 'go', flightFrac, throwToEnd };
    } else {
      this._aiGoT = 0;
    }
    return null;
  }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/pickleDuel.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/pickleDuel.js tests/pickleDuel.test.js
git commit -m "feat(pickle): duel defense verbs (THROW/PEG windup) + AI clocks for both sides"
```

---

### Task 3: RunnerWatchdog — phase-independent stall detector (the P0)

**Files:**
- Create: `src/game/runnerWatchdog.js`
- Create: `tests/runnerWatchdog.test.js`

**Interfaces:**
- Produces (used by Task 6): `class RunnerWatchdog` — `new RunnerWatchdog(stallS)`; `check(key, progressM, state, elapsed) -> bool` (true = force-settle this runner NOW); `clear(key)`; `reset()`.

- [ ] **Step 1: Write the failing tests**

`tests/runnerWatchdog.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { RunnerWatchdog } from '../src/game/runnerWatchdog.js';

describe('RunnerWatchdog', () => {
  it('fires after stallS seconds of no progress while running', () => {
    const w = new RunnerWatchdog(6);
    expect(w.check('r1', 10, 'running', 0)).toBe(false);
    expect(w.check('r1', 10.1, 'running', 3)).toBe(false);   // < epsilon movement
    expect(w.check('r1', 10.1, 'running', 6.5)).toBe(true);  // stuck > 6s
  });
  it('real progress resets the clock', () => {
    const w = new RunnerWatchdog(6);
    w.check('r1', 10, 'running', 0);
    expect(w.check('r1', 14, 'running', 5)).toBe(false); // moved 4m — fresh window
    expect(w.check('r1', 14, 'running', 10.9)).toBe(false);
    expect(w.check('r1', 14, 'running', 11.1)).toBe(true);
  });
  it('non-running states clear the record', () => {
    const w = new RunnerWatchdog(6);
    w.check('r1', 10, 'running', 0);
    expect(w.check('r1', 10, 'held', 7)).toBe(false);
    expect(w.check('r1', 10, 'running', 8)).toBe(false); // fresh start
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/runnerWatchdog.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/game/runnerWatchdog.js`:

```js
// Phase-independent runner stall detector (P0: AI stealers ran forever because
// the old watchdog only guarded phase==='LIVE'; steals run in SETUP/PITCH).
// A runner 'running' whose progress hasn't meaningfully changed for stallS
// seconds is stuck — whatever phase the match is in — and must be settled.

const EPSILON_M = 0.35; // movement below this doesn't count as progress

export class RunnerWatchdog {
  constructor(stallS = 6) {
    this.stallS = stallS;
    this.map = new Map();
  }

  /** @returns {boolean} true = this runner is stuck; force-settle him NOW */
  check(key, progressM, state, elapsed) {
    if (state !== 'running') {
      this.map.delete(key);
      return false;
    }
    const rec = this.map.get(key);
    if (!rec || Math.abs(progressM - rec.p) > EPSILON_M) {
      this.map.set(key, { p: progressM, t: elapsed });
      return false;
    }
    return elapsed - rec.t > this.stallS;
  }

  clear(key) { this.map.delete(key); }
  reset() { this.map.clear(); }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/runnerWatchdog.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/runnerWatchdog.js tests/runnerWatchdog.test.js
git commit -m "feat(runners): phase-independent RunnerWatchdog (covers pre-kick steals - P0)"
```

---

### Task 4: HUD — the DUEL button; delete the six aid APIs

**Files:**
- Modify: `src/ui/screens/hud.js`
- Modify: `src/ui/ui.css`

**Interfaces:**
- Produces (used by Tasks 5, 6):
  - `hud.showDuel(label)` / `hud.setDuelLit(on)` / `hud.hideDuel()` — one big bottom-center button; `lit` = gold pulse (actionable NOW)
  - `hud.onDuel` callback (pointerdown)
- Deletes (their call sites go away in Tasks 5–7): `showPicklePad/hidePicklePad/setPickleDir/setPickleSmart`, `setPickleLane/hidePickleLane`, `setPickleCoach/hidePickleCoach`, `setSpinUrgent`, `setThreatMarker/hideThreatMarker`, `setYouMarker/hideYouMarker`, `setBagTags/hideBagTags`, `showSlide/hideSlide` + slide button, pickle-pad DOM + its pointerdown listener, `onPickleMove/onPickleSpin/onSlide`.

- [ ] **Step 1: Replace the pickle-pad / slide DOM with the duel button**

In the constructor template literal, DELETE these blocks:

```html
      <button class="slide-btn"><span>SLIDE!</span></button>
```
```html
      <div class="pickle-pad">
        <button class="pk-left"><span>⬅</span><small></small></button>
        <button class="pk-spin"><span>🌀</span><small>SPIN</small></button>
        <button class="pk-right"><span>➡</span><small></small></button>
      </div>
```

and ADD in their place:

```html
      <button class="duel-btn"><span>GO!</span></button>
```

DELETE the field wiring for the removed elements (`this.slideBtn = ...`, `this.picklePad = ...`, `this.onPickleMove/onPickleSpin`, the `picklePad.addEventListener` block, the `slideBtn.addEventListener` block, `this.onSlide = null;`) and ADD:

```js
    this.duelBtn = this.el.querySelector('.duel-btn');
    this.onDuel = null;
    this.duelBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onDuel?.();
    });
```

- [ ] **Step 2: Add the methods; delete the dead ones**

ADD:

```js
  /** THE DUEL button: one verb, relabelled per side (GO! offense / THROW! defense). */
  showDuel(label) {
    this.duelBtn.querySelector('span').textContent = label;
    this.duelBtn.classList.add('show');
  }
  /** lit = the verb is actionable RIGHT NOW (gold pulse) */
  setDuelLit(on) { this.duelBtn.classList.toggle('lit', !!on); }
  hideDuel() { this.duelBtn.classList.remove('show', 'lit'); }
```

DELETE these whole methods: `showSlide`, `hideSlide`, `showPicklePad`, `hidePicklePad`, `setThreatMarker`, `hideThreatMarker`, `setYouMarker`, `hideYouMarker`, `setBagTags`, `hideBagTags`, `setSpinUrgent`, `setPickleCoach`, `hidePickleCoach`, `setPickleLane`, `hidePickleLane`, `setPickleSmart`, `setPickleDir`.

NOTE: `hud.destroy()` and any constructor preloads must not reference removed elements — grep hud.js for `threatEl|youEl|laneEl|coachEl|bagTag` and delete their lazy-create helpers too.

- [ ] **Step 3: CSS**

In `src/ui/ui.css`: DELETE the rule blocks for `.pickle-pad`, `.slide-btn`, `.pickle-lane`, `.pickle-coach`, `.threat-marker`, `.you-marker`, `.bag-tag`, `.spin-urgent` (grep each class; some live under media queries — remove all occurrences). ADD:

```css
/* THE DUEL button — the only control on the pickle stage */
.duel-btn {
  position: absolute; left: 50%; bottom: 7cqw; transform: translateX(-50%);
  width: 34cqw; height: 34cqw; max-width: 180px; max-height: 180px;
  border-radius: 50%; border: 3px solid #223;
  background: radial-gradient(circle at 35% 30%, #2c3444, #171c26);
  color: #8a93a6; font-family: inherit; font-weight: 900;
  font-size: 7.5cqw; letter-spacing: 0.04em;
  display: none; align-items: center; justify-content: center;
  z-index: 8; pointer-events: auto; opacity: 0.55;
  transition: opacity 0.12s;
}
.duel-btn.show { display: flex; }
.duel-btn.lit {
  opacity: 1; color: #14100a; border-color: #ffd23f;
  background: radial-gradient(circle at 35% 30%, #ffe27a, #f5a912);
  box-shadow: 0 0 26px rgba(255, 200, 60, 0.75);
  animation: duelPulse 0.5s ease-in-out infinite alternate;
}
@keyframes duelPulse {
  from { transform: translateX(-50%) scale(1); }
  to   { transform: translateX(-50%) scale(1.07); }
}
```

- [ ] **Step 4: Verify it builds standalone**

Run: `npm run build`
Expected: FAILS at this point ONLY if matchScene references removed hud methods (it does — that's Tasks 5–6). So instead verify with: `node -e "require('esbuild')"`? NO — keep it simple: run `npx vitest run` (hud.js isn't imported by tests; suite must stay green) and accept that `npm run build` goes green again at the end of Task 6. Do not commit broken wiring alone:

**This task commits TOGETHER with Task 5's matchScene offense rewire if the build is red in between.** Preferred: complete Task 4 + Task 5, build clean, then commit both. (Checkboxes stay per-task.)

---

### Task 5: matchScene — offense duel rewire (GO!/SPIN vs the AI defense)

**Files:**
- Modify: `src/game/matchScene.js`

**Interfaces:**
- Consumes: `PickleDuel`, `shuttleDir` (Tasks 1–2), `hud.showDuel/setDuelLit/hideDuel/onDuel` (Task 4).
- Produces: `this.duel = { r, brain, backBase, forwardBase, throwInfo }` — the ONE stage object both sides use (Task 6 adds the defense side). `this.pickle` and `this.rundownView` cease to exist.

- [ ] **Step 1: Import + constructor wiring**

Top of file: `import { PickleDuel, shuttleDir } from './pickleDuel.js';`

Replace (line ~206) the two callbacks:
```js
    this.hud.onPickleMove = (side) => this.pickleMove(side);
    this.hud.onPickleSpin = () => this.pickleSpin();
```
with:
```js
    this.hud.onDuel = () => this.onDuelButton();
```
Replace `this.pickle = null;` (line ~410) with `this.duel = null;` and delete the separate `rundownView` init if present near it (grep `rundownView =` — initialize nothing; `this.duel` covers it).

Also delete the `onSlide` wiring (grep `onSlide` in matchScene) — sliding is automatic now.

- [ ] **Step 2: Replace startPickle**

Replace the whole `startPickle(r)` method (lines ~1716–1727 incl. the comment block) with:

```js
  // ---------- THE DUEL (pickle v4): characters do the running, you make the calls ----------
  /** Your runner is trapped. One button: GO! (lit while the ball flies — break
   *  away from the throw). Swipe up: SPIN (i-frames — dodges tags AND pegs). */
  startPickle(r) {
    // startRundown just retreat-flipped him: targetBase = the safety bag behind
    const backBase = r.targetBase;
    const forwardBase = r.fromBase;
    this.duel = {
      r,
      brain: new PickleDuel({ mine: true, difficulty: this.difficulty, tuning: this.tuning }),
      backBase, forwardBase,
      throwInfo: null, // { toEnd: 0|1, t0, totalS } while a relay/peg is up
    };
    r.sim.human = false;
    this.hud.setLetterbox(true);
    this.hud.showDuel('GO!');
    this.hud.hint('');
    this.freezeForPickle();
  }
```

- [ ] **Step 3: Delete the aid plumbing**

DELETE whole methods: `updatePickleSides`, `pickleMove`, `pickleReverse`, `doSlide`. REPLACE `updateStageMarkers` (lines ~1773–1845) with the one-ring version:

```js
  /** Duel identity: ONE teal ring under the character you control. */
  updateStageMarkers() {
    const duel = this.duel;
    const on = !!duel && duel.r.state === 'running';
    if (!on) { this.youRing.visible = false; return; }
    const holder = this.fieldingChars().find((c) => c.hasBall);
    const youChar = this.kickingIsPlayer() ? duel.r.char : holder;
    if (!youChar) { this.youRing.visible = false; return; }
    this.youRing.visible = true;
    this.youRing.position.copy(youChar.group.position).setY(0.07);
    this.youRing.scale.setScalar(1 + Math.sin(this.elapsed * 8) * 0.12);
  }
```

Then grep matchScene for `smartArrow` and `threatRing` — delete their construction, scene-add, and every reference (the ring mesh construction block also builds these; keep ONLY `youRing`).

- [ ] **Step 4: Replace updatePickle with updateDuel (offense half)**

Replace the whole `updatePickle(dt)` method with (defense branch lands in Task 6 — leave the marked TODO branch EMPTY here but present, it is filled by Task 6, same session):

```js
  updateDuel(dt) {
    const duel = this.duel;
    const r = duel.r;
    const brain = duel.brain;
    if (r.state !== 'running' || this.playFinalized) {
      return this.endDuel();
    }
    brain.tick(dt);

    // --- shared lane geometry (0 = back/safety bag, 1 = forward bag) ---
    const backPt = this.bagPos(duel.backBase);
    const fwdPt = this.bagPos(duel.forwardBase);
    const axis = fwdPt.clone().sub(backPt);
    const rp = r.char.group.position;
    const runnerT = Math.max(0, Math.min(1, rp.clone().sub(backPt).dot(axis) / axis.lengthSq()));
    const ballT = Math.max(-0.06, Math.min(1.06, this.ball.pos.clone().sub(backPt).dot(axis) / axis.lengthSq()));
    // runner motion sign: +1 when his current leg heads to the forward bag
    const dirNow = r.targetBase === duel.forwardBase ? 1 : -1;

    // --- steer the runner: committed = locked sprint; else auto-shuttle away from the ball ---
    const wantDir = brain.committed ? brain.commitDir : shuttleDir({ runnerT, ballT });
    if (wantDir !== dirNow && r.fromBase >= 0) {
      this.retreatRunner(r);
      r.sim.human = false;
    }
    // auto-slide: committed and closing on the bag — low under the tag, no input
    const remaining = this.tuning.running.basePathM - r.sim.progressM;
    if (brain.committed && remaining < 5.2 && r.char.animator.name !== 'slide') {
      r.char.animator.play('slide');
    }

    const holder = this.fieldingChars().find((c) => c.hasBall);
    if (this.kickingIsPlayer()) {
      // ===== OFFENSE: AI defense hunts; GO button lit while the ball flies =====
      this.hud.setDuelLit(brain.canGo(!!duel.throwInfo));
      if (holder && !this.throwing) {
        duel.throwInfo = null; // ball is in a glove — the window is shut
        const hp = holder.group.position;
        const d = hp.distanceTo(rp);
        if (d > 1.05) {
          const spd = this.tuning.running.maxSpeedMs * (brain.recoverT > 0 ? 0.9 : 0.74);
          const dir = rp.clone().sub(hp).setY(0).normalize();
          hp.addScaledVector(dir, spd * dt);
          holder.faceYaw = Math.atan2(dir.x, dir.z);
          if (holder.animator.name !== 'run' && holder.animator.name !== 'stumble') holder.animator.play('run');
        } else if (holder.animator.name === 'run') {
          holder.animator.play('holdball');
        }
        const act = brain.aiDefense(dt, {
          ballFlying: false, holderDist: d, runnerCommitted: brain.committed,
        });
        if (act === 'relay') this.duelRelay(holder);
        else if (act === 'peg') this.duelPegAt(holder, r);
      }
    } else {
      // ===== DEFENSE (Task 6 fills this branch) =====
      this.updateDuelDefense(dt, { holder, runnerT, ballT });
    }
  }
```

- [ ] **Step 5: The duel throw helpers + button/swipe handlers**

Add after `updateDuel` (replacing old `pickleSpin`):

```js
  /** AI (or player, Task 6) relays to the lane end the runner is drifting toward. */
  duelRelay(holder) {
    const duel = this.duel;
    const r = duel.r;
    // cut him off: throw AHEAD of his current direction
    const toEnd = r.targetBase === duel.forwardBase ? 1 : 0;
    const base = toEnd === 1 ? duel.forwardBase : duel.backBase;
    const basePt = this.bagPos(base);
    duel.brain.relays += 1;
    duel.throwInfo = {
      toEnd,
      t0: this.elapsed,
      totalS: 0.5 + holder.group.position.distanceTo(basePt) / this.tuning.throwing.throwSpeedMs,
    };
    this.throwBall(holder, { base });
  }

  /** Telegraphed peg: windup beat (the SPIN/juke window), then the throw. */
  duelPegAt(holder, r) {
    const duel = this.duel;
    if (!duel.brain.startPeg()) return;
    holder.animator.play('holdball');
    this.faceTo(holder, this.runnerWorldPos(r).p);
    this.bus.emit('sfx', 'throw'); // the audible windup IS the tell
    this.after(duel.brain.D.pegWindupS, () => {
      if (!this.duel || this.playFinalized || !holder.hasBall) return;
      duel.throwInfo = { toEnd: -1, t0: this.elapsed, totalS: 0.4 }; // peg ≠ a GO window
      this.throwBall(holder, { peg: true });
    });
  }

  /** THE DUEL button: GO! on offense (Task 6 adds THROW! on defense). */
  onDuelButton() {
    const duel = this.duel;
    if (!duel) return;
    if (this.kickingIsPlayer()) {
      const ti = duel.throwInfo;
      if (!ti || ti.toEnd === -1) return; // unlit — inert
      const flightFrac = Math.max(0, Math.min(1, (this.elapsed - ti.t0) / ti.totalS));
      if (duel.brain.go({ flightFrac, throwToEnd: ti.toEnd })) {
        this.bus.emit('sfx', 'juke');
        this.hud.goalPop('GO!');
      }
    } else {
      this.onDuelThrow(); // Task 6
    }
  }

  /** Swipe up on the duel stage: SPIN (offense verb). */
  duelSpin() {
    const duel = this.duel;
    if (!duel || !this.kickingIsPlayer()) return;
    if (duel.brain.spin()) {
      duel.r.char.spinAnimT = 0.5;
      this.bus.emit('sfx', 'juke');
    }
  }
```

In `updateRunners`, the pickle-runner rate line (~1142):
```js
        const sliding = this.pickle?.r === r && this.pickle.sliding;
        const useRate = sliding ? 12 : (isPlayerOffense ? rate : r.aiRate);
```
becomes:
```js
        const inDuel = this.duel?.r === r;
        const useRate = inDuel ? this.duel.brain.runRate() : (isPlayerOffense ? rate : r.aiRate);
```
and the spin whirl: replace the old `if (P.spinT > 0) r.char.group.rotation.y += dt * 16;` visual — add inside the running branch of `updateRunners`:
```js
        if (inDuel && this.duel.brain.spinT > 0) r.char.group.rotation.y += dt * 16;
```

The tag block (lines ~1109–1125): replace the `P`-based branch with the brain:
```js
        const duelHere = this.duel?.r === r ? this.duel : null;
        if (duelHere) {
          if (duelHere.tagCd > 0) continue;
          const res = duelHere.brain.tagAttempt();
          if (res === 'dodged') {
            duelHere.tagCd = 0.9;
            holder.animator.play('stumble');
            this.bus.emit('sfx', 'dodge');
            this.hud.call('SPIN MOVE!', 'crowned');
            continue;
          }
          if (r.char.animator.name === 'slide' && d2 > 0.55) continue; // low under the tag
        }
        this.runnerOut(r, 'tag');
```
(`tagCd` moves onto `this.duel` as a plain field — add `tagCd: 0` to the object in `startPickle`, decay it in `updateDuel`: `duel.tagCd = Math.max(0, (duel.tagCd ?? 0) - dt);`)

`onSwipe` (~2272): replace the pickle branch:
```js
    if (this.pickle && this.kickingIsPlayer() && e.dir === 'up') {
      this.pickleSpin();
      return;
    }
```
with:
```js
    if (this.duel && this.kickingIsPlayer() && e.dir === 'up') {
      this.duelSpin();
      return;
    }
```
and in the juke branch below it, `this.pickle?.r` → `this.duel?.r` (left/right jukes stay — they dodge pegs via `pegImpact({lateralM})`).

`onTap` (~2294): `if (this.pickle && this.kickingIsPlayer()) return;` → `if (this.duel && this.kickingIsPlayer()) return;` (taps stay inert — mash instinct must not fire GO).

- [ ] **Step 6: endDuel with the three outcomes**

Replace `endPickle(safe)` with:

```js
  endDuel() {
    const duel = this.duel;
    if (!duel) return;
    this.duel = null;
    this.releasePickleFreeze();
    this.restoreSpeed();
    this.hud.hideDuel();
    this.hud.setLetterbox(false);
    this.hud.hint('');
    const holder = this.fieldingChars().find((c) => c.hasBall);
    if (holder && holder.animator.name === 'run') holder.animator.play('holdball');
    if (!this.throwing && !this.runners.some((q) => q.state === 'running')) {
      this.defenseHasBall = true;
      this.ballControlled = true;
    } else if (!this.playerControlled && !this.throwing) {
      this.aiContinue();
    }
    const r = duel.r;
    if (this.kickingIsPlayer()) {
      if (r.state === 'scored' || (r.state === 'held' && r.heldAt === duel.forwardBase)) {
        // THE JACKPOT: stole the forward bag out of a rundown
        this.special.add('pickleEscape');
        this.field.crowdEnergy = 1;
        this.bus.emit('sfx', 'crowd-cheer');
        this.bus.emit('vo', 'safe');
        this.hud.call('STOLE THE BAG!', 'crowned');
      } else if (r.state === 'held') {
        // the small win: worked his way back to safety
        this.bus.emit('sfx', 'crowd-cheer');
        this.hud.call('SAFE!', 'crowned');
      }
      // 'out' runners already got their OUT!/PEGGED! call from runnerOut
    } else if (r.state !== 'running' && r.state !== 'held' && r.state !== 'scored') {
      // defense converted the rundown — double-play-energy celebration
      this.bus.emit('sfx', 'crowd-cheer');
      this.hud.call('GOT HIM!', 'pegged');
    }
  }
```

- [ ] **Step 7: Rewire every remaining `this.pickle` / `this.rundownView` reference**

Grep `this\.pickle` and `rundownView` and fix each (full list, verify none is missed):
- `finalizePlay` (~1270–1275): replace both cleanup lines with `if (this.duel) { this.duel = null; this.hud.hideDuel(); this.hud.setLetterbox(false); }` and DELETE the `hideThreatMarker`/`setSpinUrgent` lines.
- `updateRunners` rundownView-strike block (~1239–1244): DELETE (endDuel handles it — `updateDuel` runs on both sides now).
- `releasePickleFreeze` (~1742): `(this.pickle || this.rundownView)` → `this.duel`.
- `aiThrowDecision` guard (~1996): `if (this.pickle) return;` → `if (this.duel) return;`.
- `releaseThrow` non-forced branch (~2183): `if (this.pickle?.r === victim)` → `if (this.duel?.r === victim)`; inside it the ball landed ahead: also `this.duel.throwInfo = null;`.
- `releaseThrow` peg resolution (~2135): replace `const hit = resolvePeg(...)` with duel-aware resolution:
```js
          const inDuel = this.duel?.r === lead;
          const hit = inDuel
            ? this.duel.brain.pegImpact({ lateralM: lead.sim.lateral }) === 'hit'
            : resolvePeg({ throwDistM: 0, runnerLateralM: lead.sim.lateral }, this.tuning).hit;
          if (hit) this.runnerOut(lead, 'pegged');
          else {
            this.bus.emit('sfx', 'dodge');
            this.hud.call(inDuel ? 'SPUN OUT OF IT!' : 'JUKED!', 'robbed');
            if (inDuel) { // a dodged duel peg = loose ball = the runner takes the bag
              this.duel.brain.committed = true;
              this.duel.brain.commitDir = 1;
              this.duel.brain.goGrade = 1;
              if (lead.targetBase !== this.duel.forwardBase) this.retreatRunner(lead);
            }
          }
```
- update() (~2632): `if (this.pickle) this.updatePickle(dt);` → `if (this.duel) this.updateDuel(dt);`
- update() 14s net (~2661): `if (this.pickle) this.endPickle(false);` → `if (this.duel) this.endDuel();` and delete the `this.rundownView = null;` line.
- camera block (~2688): `const pkR = this.pickle?.r ?? this.rundownView;` → `const pkR = this.duel?.r ?? null;`
- `camCtx` (~314–316) stays (it reads `this.pickleCam`).
- `updateStealRunner`/`startSteal` etc.: no pickle refs — untouched here.
- tutorialDirector references `s.pickle` (drill 4) — Task 7 rewrites the drill; for now change `!s.pickle` → `!s.duel` and `if (s.pickle)` → `if (s.duel)` so the build stays green.

- [ ] **Step 8: Verify**

Run: `npx vitest run` → all green. `npm run build` → clean.
Real play: `npm run dev`, open `http://localhost:5173/?nosplash&tut`, skip to drill 4, confirm: stage cuts in frozen → GO! button lit only during relays → tap = burst → swipe up dodges tag/peg → SAFE!/STOLE THE BAG!/OUT resolve and the match continues. Check `window.__skk.duel` live in console.

- [ ] **Step 9: Commit (Tasks 4+5 together)**

```bash
git add src/ui/screens/hud.js src/ui/ui.css src/game/matchScene.js
git commit -m "feat(pickle): THE DUEL v4 offense - one GO button + SPIN, aid layers deleted"
```

---

### Task 6: matchScene — defense duel (THROW/PEG) + watchdog integration + steal hardening

**Files:**
- Modify: `src/game/matchScene.js`

**Interfaces:**
- Consumes: `PickleDuel.aiOffense/startPeg/canThrow` (Task 2), `RunnerWatchdog` (Task 3).
- Produces: `updateDuelDefense(dt, ctx)`, `onDuelThrow()`, `forceSettleRunner(r)`.

- [ ] **Step 1: startRundown — both sides create the SAME duel**

Replace the body of `startRundown(runner, ballBase)` player-defense branch (the `if (this.playerControlled)` block, lines ~1696–1708) with:

```js
    if (this.playerControlled) {
      // PLAYER DEFENSE: same duel, your verbs are THROW (button) and PEG (swipe)
      const backBase = runner.targetBase;
      const forwardBase = runner.fromBase;
      this.duel = {
        r: runner,
        brain: new PickleDuel({ mine: false, difficulty: this.difficulty, tuning: this.tuning }),
        backBase, forwardBase, throwInfo: null, tagCd: 0,
      };
      this.hud.setLetterbox(true);
      this.hud.showDuel('THROW!');
      this.hud.hint('');
      this.freezeForPickle();
      this.hud.showThrowPad(false); // the duel button replaces the pad here
    } else if (this.kickingIsPlayer()) {
```
(keep the `else if (this.kickingIsPlayer()) this.startPickle(runner);` and AI-vs-AI branches as-is; DELETE the old aiPickleFlips/rundownView/hint/throwPad lines and the `this.after(6, ...)` anti-freeze — the watchdog replaces it.)

Also delete the `aiPickleFlips` block in `updateRunners` (lines ~1131–1141) — the duel brain drives the AI runner now.

- [ ] **Step 2: The defense update branch**

Add the method `updateDuelDefense` (called from `updateDuel`, Task 5 Step 4):

```js
  /** DEFENSE half of the duel: your fielders squeeze, you time THROW/PEG,
   *  the AI runner mirrors the human verbs (breaks on flights, spins pegs). */
  updateDuelDefense(dt, { holder, runnerT, ballT }) {
    const duel = this.duel;
    const r = duel.r;
    const brain = duel.brain;
    this.hud.setDuelLit(!!holder && !this.throwing && brain.canThrow());
    if (holder && !this.throwing) {
      duel.throwInfo = null;
      // the holder closes on the runner (same chase as offense side)
      const rp = r.char.group.position;
      const hp = holder.group.position;
      const d = hp.distanceTo(rp);
      if (d > 1.05) {
        const spd = this.tuning.running.maxSpeedMs * 0.74;
        const dir = rp.clone().sub(hp).setY(0).normalize();
        hp.addScaledVector(dir, spd * dt);
        holder.faceYaw = Math.atan2(dir.x, dir.z);
        if (holder.animator.name !== 'run' && holder.animator.name !== 'stumble') holder.animator.play('run');
      } else if (holder.animator.name === 'run') {
        holder.animator.play('holdball');
      }
    }
    // AI runner verbs
    const act = brain.aiOffense(dt, {
      ballFlying: !!duel.throwInfo && duel.throwInfo.toEnd !== -1,
      flightFrac: duel.throwInfo ? Math.min(1, (this.elapsed - duel.throwInfo.t0) / duel.throwInfo.totalS) : 0,
      throwToEnd: duel.throwInfo?.toEnd ?? 0,
      holderDist: holder ? holder.group.position.distanceTo(r.char.group.position) : 99,
      pegIncoming: brain.pegWindupT > 0,
    });
    if (act?.type === 'go') {
      brain.go({ flightFrac: act.flightFrac, throwToEnd: act.throwToEnd });
    } else if (act?.type === 'spin') {
      if (brain.spin()) { this.bus.emit('sfx', 'juke'); }
    }
    if (brain.spinT > 0) r.char.group.rotation.y += dt * 16;
  }

  /** DUEL button on defense: relay to the other end (timing beats a committed runner). */
  onDuelThrow() {
    const duel = this.duel;
    const holder = this.fieldingChars().find((c) => c.hasBall);
    if (!duel || !holder || this.throwing || !duel.brain.canThrow()) return;
    this.duelRelay(holder);
  }

  /** Swipe during a defense duel: PEG the runner (kill shot, dodgeable). */
  onDuelPeg() {
    const duel = this.duel;
    const holder = this.fieldingChars().find((c) => c.hasBall);
    if (!duel || !holder || this.throwing) return;
    this.duelPegAt(holder, duel.r);
  }
```

In `onSwipe`, ADD before the juke branch:
```js
    // DEFENSE duel: any swipe = PEG attempt (the runner is centre frame)
    if (this.duel && !this.kickingIsPlayer()) {
      this.onDuelPeg();
      return;
    }
```

The dodged-peg loose-ball consequence on defense (AI runner takes the bag) already falls out of Task 5 Step 7's `releaseThrow` change — it sets `committed`/`commitDir=1` regardless of side.

- [ ] **Step 3: RunnerWatchdog integration (the P0 fix)**

Import: `import { RunnerWatchdog } from './runnerWatchdog.js';`
Constructor (near `this.duel = null;`): `this.watchdog = new RunnerWatchdog(tuning.duel.watchdogStallS);`

Extract the settle logic from the old 14s block into a method:

```js
  /** Snap a stuck runner to his nearest sensible bag and let the play close. */
  forceSettleRunner(r) {
    console.warn('[skk] watchdog: force-settling stuck runner', r.idx, 'phase', this.phase);
    if (r === this.stealing) {
      // stuck stealer: past halfway = award the bag, else send him back — then
      // clear ALL steal bookkeeping so the pitch flow can't wait on him
      if (r.sim.progressM > this.tuning.running.basePathM * 0.5) this.commitStealArrival(r);
      else {
        r.state = 'done';
        r.char.group.position.copy(this.basePos(r.fromBase)).add(new THREE.Vector3(0.4, 0, 0.4));
        r.char.animator.play('idle');
        this.baseChars[r.fromBase] = r.char;
        this.runners = this.runners.filter((q) => q !== r);
        this.stealing = null;
        this.stealResolving = false;
        this.stealDefense = null;
      }
      return;
    }
    const past = r.sim.progressM > this.tuning.running.basePathM * 0.5;
    if (past && r.targetBase === 3) {
      r.state = 'scored';
      this.pendingRuns = (this.pendingRuns ?? 0) + 1;
      r.char.group.visible = false;
    } else {
      r.state = 'held';
      r.heldAt = past ? Math.min(r.targetBase, 2) : Math.max(r.fromBase, 0);
      r.tagUp = false;
      r.char.group.position.copy(this.basePos(r.heldAt)).add(new THREE.Vector3(0.4, 0, 0.4));
      r.char.animator.play('idle');
    }
  }
```

In `update()`, AFTER the timers loop (runs EVERY frame, every phase — that's the point), add:

```js
    // P0 watchdog: ANY runner (incl. a pre-kick stealer) stuck 'running' with
    // no progress gets settled — no phase can strand the game anymore.
    for (const r of [...this.runners]) {
      if (this.watchdog.check(r.idx, r.sim.progressM, r.state, this.elapsed)) {
        this.forceSettleRunner(r);
        if (this.duel?.r === r) this.endDuel();
      }
    }
```

Rewrite the old 14s LIVE block (~2648–2667) to reuse the same settle (it stays as the play-level net):
```js
      if (this.elapsed - this.liveStart > 14 && !this.playFinalized) {
        for (const r of this.runners) if (r.state === 'running') this.forceSettleRunner(r);
        if (this.duel) this.endDuel();
        this.releasePickleFreeze();
        this.restoreSpeed();
        this.ballControlled = true;
        this.defenseHasBall = true;
      }
```
Reset the watchdog with each fresh play: in `nextAtBat` (or wherever runners are rebuilt — grep `this.runners = []`), add `this.watchdog.reset();`.

Watchdog vs legit human stillness: a human runner who stops tapping sits at 0 progress in state 'running' — the existing 0.7s stall-commit path settles him long before 6s; the pinned-at-bag stealer during `stealResolving` waits ~1–2s on the throw. 6s clears both. Do NOT lower below 5s.

- [ ] **Step 4: Steal-path audit fixes (found while wiring)**

- `resolveStealThrowdown` (~919): the `done()` continuation can be dropped if `finish` short-circuits into `nextAtBat` — verify each exit path either calls `done` or explicitly advances the at-bat; add `this.watchdog.clear(r.idx)` inside `finish`.
- `commitStealArrival` / `cancelSteal`: add `this.watchdog.clear(r.idx)`.
- `maybeAiSteal` on the defense half: after `startSteal(b)`, the AI stealer's only exits are `commitStealArrival`, `resolveStealThrowdown`, or the live-play merge — the new watchdog now covers every other dead end. No structural change; leave a comment pointing at the watchdog.

- [ ] **Step 5: Verify**

`npx vitest run` green; `npm run build` clean.
Real play (`?match=field`): let the AI take a lead and gamble (or use tutorial drill staging) until a defense rundown triggers → THROW button relays, swipe pegs (watch the windup → AI sometimes spins it), GOT HIM! on conversion. For the P0: play `?match=field` several innings watching for AI steals (`RUNNER GOING!`) — pitch dead → quick-draw resolves; artificially stall by ignoring it → watchdog settles within ~6s, no infinite runner.

- [ ] **Step 6: Commit**

```bash
git add src/game/matchScene.js
git commit -m "feat(pickle): defense duel (THROW/PEG) + phase-independent runner watchdog (P0 fix)"
```

---

### Task 7: Tutorial — drill 4 teaches the duel, one verb at a time

**Files:**
- Modify: `src/game/tutorialDirector.js`
- Modify: `tests/tutorialDrills.test.js` (only if it asserts drill copy/goals — align expectations)

**Interfaces:**
- Consumes: `s.duel` (matchScene), `s.hud.callout` (existing).

- [ ] **Step 1: Rewrite drill 4's pickle stage**

In `DRILLS` (id at ~line 104), update copy and hooks:
- `title: 'EXTRA BASES & THE PICKLE'` → keep.
- `objective: 'TAKE 2ND — SURVIVE THE PICKLE'` → `'SURVIVE THE PICKLE — BALL IN THE AIR = GO!'`
- `detail` (intro sentence): `'Get caught between bags and the DUEL starts. When the ball is IN THE AIR, smash GO! — your man breaks the right way by himself. If the tagger lunges or winds up a peg, SWIPE UP to spin.'`
- The staging stays (force `startRundown` mid-leg via the existing `tick` hook), but the aid references change: the old code checked `s.pickle` — Task 5 already flipped those to `s.duel`.
- Add coach callouts AT the moment (the in-drill teaching):

```js
    tick(s, st) {
      const r = s.runners.find((q) => q.state === 'running');
      if (r && r.sim.progressM > s.tuning.running.basePathM * 0.3 && !s.duel) {
        s.startRundown(r, r.targetBase);
      }
      if (s.duel && s.kickingIsPlayer()) {
        st.sawDuel = true;
        // teach the GO window the FIRST time a relay flies
        if (s.duel.throwInfo && s.duel.throwInfo.toEnd !== -1 && !st.taughtGo) {
          st.taughtGo = true;
          s.hud.callout("BALL'S UP — HIT GO!", { el: s.hud.duelBtn, dir: 'up', ttl: 2200, key: 'tut-go' });
        }
        // teach SPIN the first time a peg winds up or the tagger closes
        const holder = s.fieldingChars().find((c) => c.hasBall);
        const close = holder && holder.group.position.distanceTo(s.duel.r.char.group.position) < 3.0;
        if ((s.duel.brain.pegWindupT > 0 || close) && !st.taughtSpin) {
          st.taughtSpin = true;
          s.hud.callout('SWIPE UP — SPIN!', { x: null, y: null, dir: 'down', ttl: 2200, key: 'tut-spin' });
        }
      }
      if (st.sawDuel && !s.duel) {
        const survived = s.runners.some((q) => q.state === 'held' || q.state === 'scored')
          || s.match.state.bases.some((b) => b !== null);
        if (survived) st.survived = true;
        else { st.sent = st.trapped = st.sawDuel = st.taughtGo = st.taughtSpin = false; } // tagged — run it back
      }
    },
```
(Adapt to the drill's existing `st` flags — keep `tutorialNoHomer`/`tutorialNoCatch` suppressors and the GO-FOR-2 staging that leads into the trap. `done(s, st)` returns `st.survived`.)

- [ ] **Step 2: Add ONE defense-duel beat to the fielding drill**

In the last (fielding) drill's `detail`, append the sentence: `'Trap a runner between bags and the DUEL flips: time THROW! to catch him leaning — or SWIPE at him to PEG.'` Add a callout in its `tick` when `s.duel && !s.kickingIsPlayer()` fires the first time:
```js
      if (s.duel && !s.kickingIsPlayer() && !st.taughtThrow) {
        st.taughtThrow = true;
        s.hud.callout('HE BREAKS — THROW!', { el: s.hud.duelBtn, dir: 'up', ttl: 2200, key: 'tut-throw' });
      }
```
Do NOT gate the drill's completion on a defense pickle (they're organic) — the callout is opportunistic teaching.

- [ ] **Step 3: Update the static CONTROLS card**

Grep `src/ui/screens/tutorial.js` for the pickle card (CSS diorama with the old 3-button pad/SLIDE copy) and rewrite its copy to the two verbs: "BALL IN THE AIR → GO! / TAGGER LUNGES → SWIPE UP" (keep the diorama structure, swap labels; delete pad visuals if they mimic pk-left/pk-right).

- [ ] **Step 4: Verify + commit**

`npx vitest run` (fix `tests/tutorial.test.js` / `tests/tutorialDrills.test.js` copy assertions if they reference old objective strings). Real play `?nosplash&tut` through drill 4: intro card → staged trap → GO callout at the lit button → survive → DRILL COMPLETE.

```bash
git add src/game/tutorialDirector.js src/ui/screens/tutorial.js tests/
git commit -m "feat(tutorial): pickle drill teaches THE DUEL - one verb per moment"
```

---

### Task 8: Verification sweep, docs, PR

**Files:**
- Create: `scripts/pickle-e2e.mjs`
- Modify: `SESSION_LOG.md`

- [ ] **Step 1: E2E probe (Playwright WebKit — the repo's proven pattern)**

`scripts/pickle-e2e.mjs` (run with `node scripts/pickle-e2e.mjs`, dev server on 5173): drive `?nosplash&tut`, skip to drill 4, then assert via `window.__skk`:
1. duel stage up: `s.duel` truthy, `s.engine.timeScale` 0 → 0.6 after the freeze beat, letterbox on.
2. relay flies (`s.duel.throwInfo` set) → dispatch pointerdown on `.duel-btn` → `s.duel.brain.committed === true`.
3. outcome: within 8s `s.duel === null` and either a runner `held`/`scored` or an out recorded.
4. watchdog: from a fresh `?match=field`, monkey-patch `s.stealing && (s.stealing.sim.tick = () => {})` after an AI steal starts (or set `s.runners[0].sim.tick = ()=>{}` during a play) → assert the runner leaves 'running' within ~7s and the match proceeds. This is the P0 regression check.
Base the script's structure on the previous WebKit probes (power-meter-synced input dispatch, poll loops with timeouts, hard exit code).

- [ ] **Step 2: Full gates**

Run: `npx vitest run` → expect ~120+ tests, ALL green (check the suite exit code itself, not a grep — PR #55 lesson).
Run: `npm run build` → clean.
Run: `node scripts/pickle-e2e.mjs` → exit 0.
Real-play sanity on desktop Chrome (`?match`, `?match=field`): one full offense duel, one defense duel, one AI steal sequence.

- [ ] **Step 3: SESSION_LOG + PR**

Append a session section to `SESSION_LOG.md`: pickle v4 THE DUEL shipped (design → spec link), aid layers deleted, watchdog P0 status honest (what was verified, what wasn't). Commit.

```bash
git add SESSION_LOG.md scripts/pickle-e2e.mjs
git commit -m "docs: session log - pickle v4 THE DUEL + runner watchdog"
git push -u origin feat/pickle-v4-duel
gh pr create --title "Pickle v4: THE DUEL - one-button timing duel + phase-independent runner watchdog" --body "..."
```
PR body: spec summary, the counter-web, what was deleted, watchdog coverage, verification evidence. **Do not merge — the dev playtests on the production PWA and authorizes with "push".**

---

## Self-Review

- **Spec coverage:** stage keep/delete list → Tasks 4/5; GO/SPIN → Tasks 1/5; THROW/PEG + telegraph + spin-dodge-peg → Tasks 2/6; jukes dodge pegs → `pegImpact({lateralM})` Task 1; outcomes/rewards (SAFE/JACKPOT meter+`pickleEscape`) → Task 5 Step 6; auto-slide → Task 5 Step 4; tutorial one-verb drills → Task 7; unified state machine → `this.duel` (Tasks 5/6); phase-independent ~6s watchdog + steal cleanup → Tasks 3/6; regression tests → Tasks 1–3 + e2e Task 8; verify-by-real-play → Tasks 5/6/8. Crowns bonus: deferred — jackpot pays special meter + celebration now; a Crowns hook needs the meta economy and is out of scope (noted for the dev).
- **Placeholders:** none — every step has code or an exact command. Task 6 Step 4 is an audit with named functions and concrete additions.
- **Type consistency:** `PickleDuel` fields/methods match across Tasks 1/2/5/6 (`go({flightFrac,throwToEnd})`, `pegImpact({lateralM})`, `runRate()`, `throwInfo {toEnd,t0,totalS}`, `toEnd:-1` = peg). `RunnerWatchdog.check(key,progressM,state,elapsed)` consistent between Tasks 3/6. HUD `showDuel/setDuelLit/hideDuel/onDuel` consistent between Tasks 4/5/6/7.

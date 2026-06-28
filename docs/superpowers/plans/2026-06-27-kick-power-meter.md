# Kick Power Meter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible, timed power meter to kicking — distance scales with how well you lock it, and a sweet-zone lock combined with the kicker lined up under the ball is the only way to hit a home run.

**Architecture:** Pure timing/launch math lives in `src/game/kickTiming.js` (headless, unit-tested). `matchScene.js` samples the power curve each frame during the player's at-bat, captures it on the kick, feeds it to `launchParams`, and gates the existing fence-homer on a new `kickHrEligible` flag. The HUD renders the meter as a DOM widget. No ball-physics changes.

**Tech Stack:** Vanilla JS ES modules, Three.js, Vitest (headless logic tests), DOM/CSS HUD.

## Global Constraints

- Tuning values live ONLY in `src/data/tuning.json` — never hardcode gameplay numbers in logic.
- `src/game/*` logic must stay headless (no DOM, no THREE) so it unit-tests — DOM work goes in `src/ui/screens/hud.js`.
- Keep the existing 57 Vitest tests green; `npm run build` stays clean.
- The AI/CPU kick path must NOT regress: when no meter power is supplied, launch falls back to the per-band power map exactly as before.
- Home runs remain player-only (CPU homers are out of scope for this plan — preserve current behavior).
- Verify by REAL PLAY before claiming done (drive the actual game; never assert "works" off flags).

---

### Task 1: Power curve + power-driven launch speed

**Files:**
- Modify: `src/game/kickTiming.js`
- Modify: `src/data/tuning.json` (`kick` block)
- Test: `tests/kickPowerMeter.test.js` (create)

**Interfaces:**
- Produces: `powerFromError(errMs, tuning) -> number` (0..1, peaks at errMs=0).
- Produces: `launchParams(judged, opts, tuning)` now reads `opts.power01` (0..1); when absent, falls back to `tuning.kick.power[judged.quality]`. Speed = `(baseBallSpeedMs + power01*(maxBallSpeedMs - baseBallSpeedMs)) * mult`.

- [ ] **Step 1: Add tuning values**

In `src/data/tuning.json`, replace the `"kick"` block with (adds `baseBallSpeedMs`, `meterWindowMs`, `hrPower`, `hrAlignM`; keeps everything else):

```json
  "kick": {
    "perfectWindowMs": 38,
    "goodWindowMs": 140,
    "okWindowMs": 270,
    "power":   { "PERFECT": 0.85, "GOOD": 0.7, "OK": 0.52, "FOUL": 0.3 },
    "loftDeg": { "PERFECT": 42, "GOOD": 38, "OK": 24, "FOUL": 55 },
    "baseBallSpeedMs": 9,
    "maxBallSpeedMs": 24,
    "meterWindowMs": 320,
    "hrPower": 0.9,
    "hrAlignM": 0.6,
    "aimSpreadDeg": 52,
    "aiAimDeg": 30
  },
```

- [ ] **Step 2: Write the failing test**

Create `tests/kickPowerMeter.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { powerFromError, launchParams, judgeKick } from '../src/game/kickTiming.js';
import tuning from '../src/data/tuning.json';

describe('powerFromError', () => {
  it('peaks at 1.0 on perfect timing', () => {
    expect(powerFromError(0, tuning)).toBeCloseTo(1, 5);
  });
  it('falls off linearly with error and clamps at 0', () => {
    expect(powerFromError(160, tuning)).toBeCloseTo(0.5, 2); // half of 320ms window
    expect(powerFromError(400, tuning)).toBe(0);
    expect(powerFromError(-400, tuning)).toBe(0);
  });
});

describe('launchParams speed scales with power01', () => {
  const judged = judgeKick(0, tuning); // PERFECT band
  it('uses power01 when provided', () => {
    const hot = launchParams(judged, { aim: 'center', power01: 1 }, tuning);
    const weak = launchParams(judged, { aim: 'center', power01: 0 }, tuning);
    expect(hot.speed).toBeCloseTo(tuning.kick.maxBallSpeedMs, 5);
    expect(weak.speed).toBeCloseTo(tuning.kick.baseBallSpeedMs, 5);
    expect(hot.speed).toBeGreaterThan(weak.speed);
  });
  it('falls back to the band power map when power01 is absent (AI path)', () => {
    const ai = launchParams(judged, { aim: 'center' }, tuning);
    const k = tuning.kick;
    const expected = k.baseBallSpeedMs + k.power.PERFECT * (k.maxBallSpeedMs - k.baseBallSpeedMs);
    expect(ai.speed).toBeCloseTo(expected, 5);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/kickPowerMeter.test.js`
Expected: FAIL — `powerFromError is not a function` / speed assertions wrong.

- [ ] **Step 4: Implement**

In `src/game/kickTiming.js`, add after the `judgeKick` function:

```javascript
/**
 * Meter power from raw timing error: 1.0 at perfect contact, falling linearly to
 * 0 at ±meterWindowMs. This is the value the on-screen power meter displays and
 * the magnitude that drives launch distance for a player kick.
 * @param {number} errMs release time minus plate arrival (sign ignored)
 * @returns {number} 0..1
 */
export function powerFromError(errMs, tuning) {
  const w = tuning.kick.meterWindowMs;
  return Math.max(0, Math.min(1, 1 - Math.abs(errMs) / w));
}
```

Then in `launchParams`, replace the final `return` block's `speed` line. Change:

```javascript
  return {
    speed: k.maxBallSpeedMs * judged.power * mult,
    loftDeg: k.loftDeg[judged.quality],
    directionDeg: base + timingBias,
  };
```

to:

```javascript
  // Distance scales with the meter power (player) or the per-band power (AI fallback).
  const power01 = opts.power01 ?? k.power[judged.quality];
  return {
    speed: (k.baseBallSpeedMs + power01 * (k.maxBallSpeedMs - k.baseBallSpeedMs)) * mult,
    loftDeg: k.loftDeg[judged.quality],
    directionDeg: base + timingBias,
  };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/kickPowerMeter.test.js`
Expected: PASS (5 assertions across 4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/game/kickTiming.js src/data/tuning.json tests/kickPowerMeter.test.js
git commit -m "feat(kick): power curve + power-driven launch speed"
```

---

### Task 2: Home-run eligibility (meter sweet-zone + alignment)

**Files:**
- Modify: `src/game/kickTiming.js`
- Test: `tests/kickPowerMeter.test.js`

**Interfaces:**
- Produces: `isHrEligible({ power01, alignErrM }, tuning) -> boolean` — true when `power01 >= tuning.kick.hrPower` AND `alignErrM <= tuning.kick.hrAlignM`.

- [ ] **Step 1: Write the failing test**

Append to `tests/kickPowerMeter.test.js`:

```javascript
import { isHrEligible } from '../src/game/kickTiming.js';

describe('isHrEligible', () => {
  it('true only when both the meter is in the sweet zone AND the kicker is aligned', () => {
    expect(isHrEligible({ power01: 0.95, alignErrM: 0.3 }, tuning)).toBe(true);
  });
  it('false when power is below the sweet zone', () => {
    expect(isHrEligible({ power01: 0.85, alignErrM: 0.1 }, tuning)).toBe(false);
  });
  it('false when the kicker is not lined up', () => {
    expect(isHrEligible({ power01: 1.0, alignErrM: 1.2 }, tuning)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/kickPowerMeter.test.js`
Expected: FAIL — `isHrEligible is not a function`.

- [ ] **Step 3: Implement**

In `src/game/kickTiming.js`, add at the end of the file:

```javascript
/**
 * A player kick can leave the park only when the power meter is locked in the
 * sweet zone AND the kicker was lined up under the ball. Both axes required.
 * @param {{power01:number, alignErrM:number}} k
 * @returns {boolean}
 */
export function isHrEligible({ power01, alignErrM }, tuning) {
  const c = tuning.kick;
  return power01 >= c.hrPower && alignErrM <= c.hrAlignM;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/kickPowerMeter.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/kickTiming.js tests/kickPowerMeter.test.js
git commit -m "feat(kick): home-run eligibility from meter + alignment"
```

---

### Task 3: HUD power-meter widget

**Files:**
- Modify: `src/ui/screens/hud.js`
- Modify: `src/ui/ui.css`

**Interfaces:**
- Produces: `hud.setPowerMarker(p)` — `p` is 0..1; shows the meter and positions the marker (0 = bottom, 1 = top). Sweet zone is the top band `>= tuning hrPower`, but the HUD draws a fixed band at 90–100%.
- Produces: `hud.hidePowerMeter()` — hides the widget.

- [ ] **Step 1: Add the DOM element**

In `src/ui/screens/hud.js`, inside the constructor AFTER `root.appendChild(this.el);` (line ~45), add:

```javascript
    // Vertical power meter for kicking: a marker rises and peaks at plate arrival.
    this.powerMeter = document.createElement('div');
    this.powerMeter.className = 'power-meter';
    this.powerMeter.innerHTML = `<div class="pm-track"><div class="pm-sweet"></div><div class="pm-fill"></div><div class="pm-marker"></div></div>`;
    this.el.appendChild(this.powerMeter);
    this.pmFill = this.powerMeter.querySelector('.pm-fill');
    this.pmMarker = this.powerMeter.querySelector('.pm-marker');
```

- [ ] **Step 2: Add the methods**

In `src/ui/screens/hud.js`, add after the `hideRing()` method (line ~154):

```javascript
  setPowerMarker(p) {
    const pct = Math.max(0, Math.min(1, p)) * 100;
    this.powerMeter.classList.add('show');
    this.pmFill.style.height = `${pct}%`;
    this.pmMarker.style.bottom = `${pct}%`;
  }
  hidePowerMeter() {
    this.powerMeter.classList.remove('show');
  }
```

- [ ] **Step 3: Add the CSS**

In `src/ui/ui.css`, append:

```css
.power-meter {
  position: absolute;
  right: 3cqw;
  bottom: 22cqh;
  width: 7cqw;
  height: 34cqh;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
  z-index: 6;
}
.power-meter.show { opacity: 1; }
.power-meter .pm-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(8, 10, 14, 0.72);
  border: 2px solid rgba(255, 255, 255, 0.18);
  overflow: hidden;
}
.power-meter .pm-sweet {
  position: absolute;
  left: 0; right: 0;
  bottom: 90%; height: 10%;
  background: rgba(255, 215, 64, 0.30);
  border-top: 1px solid rgba(255, 215, 64, 0.9);
  border-bottom: 1px solid rgba(255, 215, 64, 0.9);
}
.power-meter .pm-fill {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 0%;
  background: linear-gradient(to top, #2bd1c4, #f5a623, #e6483d);
}
.power-meter .pm-marker {
  position: absolute;
  left: -8%; right: -8%;
  height: 3px;
  bottom: 0%;
  background: #fff;
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.9);
}
```

- [ ] **Step 4: Visual smoke check**

Run the dev server (`npm run dev`) and in the browser console call `window.__skk.hud.setPowerMarker(0.95)` during a match (or temporarily call it from boot). Confirm a vertical meter appears on the right with the fill rising and a marker near the gold sweet-zone band; `window.__skk.hud.hidePowerMeter()` hides it.

Expected: meter renders inside the portrait frame, marker tracks the value 0→1.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/hud.js src/ui/ui.css
git commit -m "feat(hud): vertical kick power-meter widget"
```

---

### Task 4: Wire the meter into the kick (matchScene)

**Files:**
- Modify: `src/game/matchScene.js`

**Interfaces:**
- Consumes: `powerFromError`, `isHrEligible` from `kickTiming.js`; `hud.setPowerMarker`, `hud.hidePowerMeter`.
- Produces: `this.kickHrEligible` (boolean) — replaces `this.kickWasSpecial` as the fence-homer gate at the LIVE-phase check.

- [ ] **Step 1: Import the new helpers**

In `src/game/matchScene.js`, change the kickTiming import (line ~8):

```javascript
import { judgeKick, launchParams } from './kickTiming.js';
```

to:

```javascript
import { judgeKick, launchParams, powerFromError, isHrEligible } from './kickTiming.js';
```

- [ ] **Step 2: Capture power + HR eligibility in `attemptKick`**

In `attemptKick` (line ~445), find:

```javascript
    this.kicked = true;
    this.kickWasSpecial = false; // only a consumed crown kick may leave the park
```

and change to:

```javascript
    this.kicked = true;
    this.kickWasSpecial = false;
    this.kickHrEligible = false;
    const isPlayerKick = this.kickingIsPlayer();
```

Then find the alignment block:

```javascript
    let effErr = Math.abs(errMs);
    let aimDeg = aimSpec.aimDeg;
    if (aimSpec.align) {
      const alignErr = this.kicker.group.position.x - this.ball.pos.x;
      effErr = Math.abs(errMs) + Math.abs(alignErr) * 175;
      aimDeg = Math.max(-this.tuning.kick.aimSpreadDeg, Math.min(this.tuning.kick.aimSpreadDeg, -alignErr * 22));
    }
    this.hud.hideRing();
```

and change to (captures `alignErrM`, hides the meter):

```javascript
    let effErr = Math.abs(errMs);
    let aimDeg = aimSpec.aimDeg;
    let alignErrM = 0;
    if (aimSpec.align) {
      const alignErr = this.kicker.group.position.x - this.ball.pos.x;
      alignErrM = Math.abs(alignErr);
      effErr = Math.abs(errMs) + alignErrM * 175;
      aimDeg = Math.max(-this.tuning.kick.aimSpreadDeg, Math.min(this.tuning.kick.aimSpreadDeg, -alignErr * 22));
    }
    this.hud.hideRing();
    this.hud.hidePowerMeter();
    const power01 = isPlayerKick ? powerFromError(errMs, this.tuning) : null;
```

- [ ] **Step 3: Set the HR-eligible flag after the special block**

Find the special-meter block ending and the `launchParams` call (line ~479):

```javascript
      this.specialArmed = false;
    }
    const launch = launchParams(judged, { ...aimSpec, ...(aimDeg != null ? { aimDeg } : {}), powerMult }, this.tuning);
```

and change to:

```javascript
      this.specialArmed = false;
    }
    // HR gate: a player kick leaves the park on a sweet-zone meter lock AND a lined-up
    // kicker — OR a consumed crown super-kick (kept as a bonus path).
    this.kickHrEligible = isPlayerKick && (
      isHrEligible({ power01, alignErrM }, this.tuning) || this.kickWasSpecial
    );
    const launch = launchParams(
      judged,
      { ...aimSpec, ...(aimDeg != null ? { aimDeg } : {}), powerMult, ...(power01 != null ? { power01 } : {}) },
      this.tuning,
    );
```

- [ ] **Step 4: Swap the fence-homer gate**

In the LIVE-phase update (line ~1540), find:

```javascript
      if (!this.hrFired && this.kickWasSpecial && dist >= this.fenceM - 0.3 && this.ball.pos.y > this.fenceTopY * 0.8 && this.ball.bounces === 0) {
```

and change `this.kickWasSpecial` to `this.kickHrEligible`:

```javascript
      if (!this.hrFired && this.kickHrEligible && dist >= this.fenceM - 0.3 && this.ball.pos.y > this.fenceTopY * 0.8 && this.ball.bounces === 0) {
```

- [ ] **Step 5: Drive the meter each frame during the player's at-bat**

In the update loop, find the timing-ring block (line ~1504, the `if` that calls `this.hud.ringAt`). Immediately AFTER that `if (... ) { ... }` block closes, add:

```javascript
    if (this.phase === 'PITCH' && this.kickingIsPlayer() && !this.kicked && this.pitchArrival != null) {
      // Power peaks (1.0) exactly at plate arrival, then falls — same curve the kick samples.
      const errNow = (this.elapsed - this.pitchArrival) * 1000;
      this.hud.setPowerMarker(powerFromError(errNow, this.tuning));
    }
```

- [ ] **Step 6: Hide the meter on a missed/late kick**

In `attemptKick`, the WHIFF early-return path already runs after Step 2's `this.hud.hidePowerMeter()`, so it is covered. In the update loop's TOO-LATE branch (line ~1508–1512), find:

```javascript
        this.strike('TOO LATE!');
        this.hud.hideRing();
```

and add the meter hide:

```javascript
        this.strike('TOO LATE!');
        this.hud.hideRing();
        this.hud.hidePowerMeter();
```

- [ ] **Step 7: Build check**

Run: `npm run build`
Expected: builds clean, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/game/matchScene.js
git commit -m "feat(kick): wire power meter + alignment HR gate into the match"
```

---

### Task 5: Real-play verification + tuning pass

**Files:**
- Modify: `src/data/tuning.json` (only if play reveals bad feel)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (the prior 57 plus the new kickPowerMeter tests).

- [ ] **Step 2: Play it for real (REQUIRED — no flag-only claims)**

Start `npm run dev`, open `http://localhost:5173/?match` (jumps straight into a match where you kick). Drive an actual at-bat:
- Confirm the power meter appears on the right and the marker rises/peaks/falls with the pitch.
- Line the kicker up under the ball (drag) and flick up right at the peak → confirm a long, hard kick (it should clearly out-travel a mistimed one).
- Nail sweet-zone + aligned on a fair fly → confirm a HOME RUN fires (fire+lightning FX, `homer()` runs).
- Deliberately mis-align (kicker off to the side) with a perfect-timed lock → confirm it does NOT homer (alignment axis works).
- Lock early/late → confirm weaker/shorter ball or foul.
- Pitch a half-inning to the CPU → confirm the CPU still kicks normally (no meter, fed by band fallback) and does not homer.

Capture a screenshot of the meter mid-pitch and of a home-run moment (headless Chrome `--screenshot` per the project's screenshot pipeline) to confirm visually.

- [ ] **Step 3: Tune if needed**

If HRs are too easy/hard or kicks feel weak/floaty, adjust ONLY `src/data/tuning.json` `kick`: `meterWindowMs` (wider = easier power), `hrPower`/`hrAlignM` (looser = more HRs), `baseBallSpeedMs`/`maxBallSpeedMs` (overall punch). Re-play after each change. Note final values.

- [ ] **Step 4: Commit any tuning**

```bash
git add src/data/tuning.json
git commit -m "tune(kick): power-meter + HR feel from playtest"
```

---

## Self-Review

- **Spec coverage (Workstream 1):** power meter (Tasks 1,3,4) ✓; distance scales with P (Task 1) ✓; sweet-zone + alignment = HR (Tasks 2,4) ✓; replaces special-only HR gate, special kept as bonus (Task 4 Step 3) ✓; tight windows tunable (Task 5) ✓; AI no-regression via band fallback (Task 1) ✓; real-play verification (Task 5) ✓. Snappier kick animation is **Workstream 3** (separate plan), not here.
- **Placeholders:** none — every code step shows exact code and exact commands.
- **Type consistency:** `powerFromError(errMs, tuning)`, `isHrEligible({power01, alignErrM}, tuning)`, `launchParams(..., {power01})`, `hud.setPowerMarker(p)`, `hud.hidePowerMeter()`, `this.kickHrEligible` — names match across Tasks 1–5.

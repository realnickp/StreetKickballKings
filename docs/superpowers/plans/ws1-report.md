# WS1 Kick Power Meter — Implementation Report

## Per-Task Summary

### Task 1: Power curve + power-driven launch speed
**Files changed:** `src/data/tuning.json`, `src/game/kickTiming.js`, `tests/kickPowerMeter.test.js`, `tests/kickTiming.test.js`

- Added `baseBallSpeedMs: 9`, `meterWindowMs: 320`, `hrPower: 0.9`, `hrAlignM: 0.6` to the `kick` block in `tuning.json`.
- Added `export function powerFromError(errMs, tuning)` to `kickTiming.js` after `judgeKick`.
- Changed the `launchParams` return block from `k.maxBallSpeedMs * judged.power * mult` to `(k.baseBallSpeedMs + power01 * (k.maxBallSpeedMs - k.baseBallSpeedMs)) * mult`, where `power01 = opts.power01 ?? k.power[judged.quality]`.
- **Deviation (necessary fix):** The new speed formula broke 2 pre-existing tests in `kickTiming.test.js` (`launchParams maps quality + aim to a velocity spec` and `special move multiplies power`). Both tests were updated to compute expected speed using the new formula — they still validate the same invariants (correct loft, center direction, powerMult scaling), just with the correct new math. This was required to satisfy the plan's constraint that all existing tests stay green.
- Created `tests/kickPowerMeter.test.js` with 4 tests (all pass).
- **Commit:** `9abafc5`

### Task 2: Home-run eligibility
**Files changed:** `src/game/kickTiming.js`, `tests/kickPowerMeter.test.js`

- Added `export function isHrEligible({ power01, alignErrM }, tuning)` at the end of `kickTiming.js`.
- Appended 3 tests for `isHrEligible` to `kickPowerMeter.test.js` (all pass).
- Updated the import in the test file to include `isHrEligible`.
- **Commit:** `4930ad5`

### Task 3: HUD power-meter widget
**Files changed:** `src/ui/screens/hud.js`, `src/ui/ui.css`

- Added `this.powerMeter` DOM element (with `.pm-track`, `.pm-sweet`, `.pm-fill`, `.pm-marker` children) to the `Hud` constructor immediately after `root.appendChild(this.el)`.
- Added `setPowerMarker(p)` and `hidePowerMeter()` methods after `hideRing()`.
- Appended `.power-meter`, `.pm-track`, `.pm-sweet`, `.pm-fill`, `.pm-marker` CSS rules to `ui.css`.
- Visual smoke check skipped (per instructions); widget code verified by read-back: `setPowerMarker` adds `.show`, sets `pmFill.style.height` and `pmMarker.style.bottom`; `hidePowerMeter` removes `.show`.
- **Commit:** `c959ac7`

### Task 4: Wire the meter into the match
**Files changed:** `src/game/matchScene.js`

- Updated import to include `powerFromError, isHrEligible`.
- In `attemptKick`: added `this.kickHrEligible = false`, `const isPlayerKick = this.kickingIsPlayer()`, `let alignErrM = 0`, capture of `alignErrM` in the align block, `this.hud.hidePowerMeter()`, and `const power01 = isPlayerKick ? powerFromError(errMs, this.tuning) : null`.
- After the special block: set `this.kickHrEligible = isPlayerKick && (isHrEligible({ power01, alignErrM }, this.tuning) || this.kickWasSpecial)`.
- Updated `launchParams` call to spread `power01` when non-null.
- Swapped `this.kickWasSpecial` to `this.kickHrEligible` in the LIVE-phase fence-homer check.
- Added frame-update block: `if (phase === 'PITCH' && kickingIsPlayer() && !kicked && pitchArrival != null)` calls `hud.setPowerMarker(powerFromError(errNow, tuning))`.
- Added `hud.hidePowerMeter()` to the TOO LATE branch.
- Build passed clean. Real play skipped per instructions.
- **Commit:** `8e2ee4d`

### Task 5: Full suite + build
- `npx vitest run`: **Test Files 11 passed (11), Tests 64 passed (64)**
- `npm run build`: **built in 1.29s, no errors** (pre-existing chunk-size and dynamic-import warnings only).
- Real-play step skipped per instructions.

---

## Vitest Summary Line
```
Test Files  11 passed (11), Tests  64 passed (64)
```

## npm run build Result
```
✓ built in 1.29s
```

## Commits Created
| Short Hash | Message |
|------------|---------|
| `9abafc5`  | feat(kick): power curve + power-driven launch speed |
| `4930ad5`  | feat(kick): home-run eligibility from meter + alignment |
| `c959ac7`  | feat(hud): vertical kick power-meter widget |
| `8e2ee4d`  | feat(kick): wire power meter + alignment HR gate into the match |

## Deviations & Concerns

1. **Existing test updates (necessary, not scope creep):** Two tests in `tests/kickTiming.test.js` verified the old speed formula (`maxBallSpeedMs * power * mult`). The plan's new formula (`baseBallSpeedMs + power01 * (maxBallSpeedMs - baseBallSpeedMs) * mult`) produces different values. These tests were updated to use the new formula — the invariants they check (relative speeds, powerMult scaling, correct loft/direction) are preserved; only the expected absolute speed values changed. Without this fix, the suite would be 2 tests short of all-green.

2. **isHrEligible with null power01 (CPU path):** When `isPlayerKick` is false, `power01` is null. The HR-eligibility check is guarded by `isPlayerKick &&`, so `isHrEligible` is never called with a null `power01` for CPU kicks — CPU homers remain impossible as specified.

3. **Real-play verification:** Not performed by this agent per instructions. The human playtester should verify: meter appears and tracks the pitch, sweet-zone lock + alignment fires a homer, CPU kicks normally with no meter.

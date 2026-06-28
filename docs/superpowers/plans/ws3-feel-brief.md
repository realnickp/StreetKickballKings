# Workstream 3a brief — Feel: run sensitivity + animation (dead feet, snappy kick)

Spec §3a + §3b of the design doc. Branch `feat/feel-graphics-overhaul`. Vite + Three.js.
Headless logic in `src/game/*` (no DOM/THREE), tuning numbers ONLY in `tuning.json`.
Keep the 71 existing tests green and `npm run build` clean. Commit in chunks (plain
messages, no trailers). The human playtests visuals — you verify by reading code back + tests + build.

## Part 1 — Run-tap sensitivity (easy)
Problem: it takes too many taps to run to a base; running should feel more responsive.
- `src/game/baseRunning.js` `humanRunSpeed(tapsPerSec, tuning)`: currently returns 0 below
  0.5 taps/sec, else `tapsPerSec * speedPerTapHz * 1.8` capped at `maxSpeedMs`. Make each tap
  count sooner: lower the dead-zone to `0.3`, and raise the human responsiveness multiplier
  `1.8 → 2.4`. Keep the `maxSpeedMs` cap.
- `src/data/tuning.json` `running`: bump `maxSpeedMs` `7.5 → 8.3` and `speedPerTapHz` `0.9 → 1.05`.
  (Goal: reach cruising speed with fewer taps. Do NOT make it so fast that throws never beat
  runners — these are modest bumps; the human will fine-tune.)
- Update/extend `tests/baseRunning.test.js` (or wherever humanRunSpeed is tested) so the
  threshold + multiplier change is asserted (e.g. 0.4 taps/sec now moves, 0 taps still = 0).

## Part 2 — Dead-feet fix (the important one)
The run CLIP is fine (big leg swing). The bug is that some characters TRANSLATE without being
in the run clip, so they glide. Fix every such site so feet move whenever a character moves:

### 2a. Kicker sliding to line up (THE main offender — it's the focal character)
- PLAYER path: `aimKicker(screenX)` (matchScene ~L1324) sets `this.kicker.group.position.x`
  directly while the kicker is on the `plate` clip → it slides with no leg motion.
- CPU path: in the update loop (~L1515) the CPU kicker does `k.x += (tx - k.x) * ...` on the
  `plate` clip → same glide.
- FIX: drive a stride while the kicker is repositioning. In the update loop, compute the
  kicker's per-frame lateral speed (track `this._kickerPrevX`; `vx = |x - prevX| / rawDt`).
  When `vx` is above a small threshold (~0.6 m/s) AND `this.phase` is `PITCH`/`SETUP` (lining
  up, not mid-kick), play `run` with `speedFactor` scaled to the slide speed
  (e.g. `0.6 + min(1.4, vx/3)`); when it drops below the threshold for a moment, return to
  `plate`. Guard so you don't re-`play('run')` every frame (only call `play` on a state change,
  like the fielder code does with `if (c.animator.name !== 'run')`). Apply to BOTH the player
  drag and the CPU auto-slide (the same update-loop block can handle both since both just move
  `this.kicker.group.position.x`). Do NOT trigger the stride during `KICK_ANIM` (the kick is playing).

### 2b. Fielder run speed should read in the stride
- In `updateDefense` (~L1008-1013), when a fielder moves it does `play('run')` at the default
  `speedFactor` 1. Set `c.animator.ctx.speedFactor` proportional to actual speed:
  `c.animator.ctx.speedFactor = 0.7 + Math.min(1.3, (step/dt) / this.tuning.running.maxSpeedMs)`
  each moving frame (after the `play('run')` guard). Fast chases now visibly sprint.
- Audit other direct `group.position` moves for a live character on a non-stride clip
  (e.g. the player-controlled chaser block right after L1020, runner rundown moves). Where a
  character translates >~0.6 m/s and isn't already in `run`/`stumble`/`kick`/`throw`/`catch`,
  put it in `run` with a speed-scaled `speedFactor`. Don't touch runners (L754 already scales).

### 2c. Snappy, impactful kick clip
- `glbCharacters.js` `CLIPS.kick` (L121-137): make it faster and punchier. Reduce `dur`
  `0.7 → 0.5`, move the contact earlier (`contactAt 0.5 → 0.34`), and increase the planted-leg
  swing-through so the follow-through reads as a big strike (bump the `RUpLeg` swing in the
  contact phase). Keep the same 3-phase structure (wind/contact/follow). It must still look
  like a kick — just quicker and bigger.
- No matchScene change needed for timing (it launches the ball on contact already), but verify
  the kick still visually connects near the ball.

## Constraints / done criteria
- `npx vitest run` green (71+), `npm run build` clean.
- No regression to runners' existing speed-scaled animation (L754) or the WS1/WS2 systems.
- Commit chunks: (1) run tuning + test, (2) kicker stride + fielder speedFactor, (3) snappy kick.
- Write a report to `docs/superpowers/plans/ws3-feel-report.md` (what you changed per part,
  the kicker-stride threshold/scale you chose, final test+build lines, commit hashes, concerns).
- Return only: status, commit hashes, one-line test+build summary, concerns.

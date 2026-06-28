# Workstream 3a report — Feel: run sensitivity + animation

Branch `feat/feel-graphics-overhaul`. All three brief parts implemented, committed in the
3 named chunks. 72 tests pass, `npm run build` clean.

## Part 1 — Run-tap sensitivity (commit f06ce2e)
- `src/game/baseRunning.js` `humanRunSpeed`: dead-zone `0.5 → 0.3`, responsiveness
  multiplier `1.8 → 2.4`. `maxSpeedMs` cap kept.
- `src/data/tuning.json` `running`: `maxSpeedMs 7.5 → 8.3`, `speedPerTapHz 0.9 → 1.05`.
- `tests/baseRunning.test.js`: new test asserts `humanRunSpeed(0)=0`, `0.2 taps=0`
  (below the new dead-zone), `0.4 taps > 0` and equals `0.4*speedPerTapHz*2.4`, and the
  `maxSpeedMs` cap still holds.

## Part 2 — Dead-feet fix

### 2a. Kicker stride while lining up (commit d2b8914)
- Added a stride block in the update loop (after the KICK_ANIM auto-step block in
  `matchScene.js`). Tracks `this._kickerPrevX`; each frame computes
  `vx = |x - prevX| / rawDt`. While `phase` is `PITCH` or `SETUP`:
  - `vx > 0.6` m/s → play `run` (guarded with `if (anim.name !== 'run')` so it isn't
    re-triggered every frame) with `speedFactor = 0.6 + min(1.4, vx/3)`.
  - settled (`vx <= 0.6`) → return to `plate`.
  This drives the stride for BOTH paths (player drag via `aimKicker` and the CPU
  auto-slide), since both just move `this.kicker.group.position.x` and the block reads
  the resulting per-frame translation. Never runs during `KICK_ANIM` (kick clip plays).
- Reset `this._kickerPrevX = 0` at the two spots that recenter the kicker to x=0
  (`startAutoPitch`, CPU-kick branch of `throwPlayerPitch`) so the recenter isn't read as
  a one-frame slide spike.
- **Chosen tuning: threshold 0.6 m/s, speedFactor = 0.6 + min(1.4, vx/3)** (range
  ~0.6 at the threshold up to 2.0 for a fast 4+ m/s slide).

### 2b. Fielder + audit (commit d2b8914)
- `updateDefense`: after the `play('run')` guard, set
  `c.animator.ctx.speedFactor = 0.7 + Math.min(1.3, (step/dt) / maxSpeedMs)` every moving
  frame. Fast chases now visibly sprint. The player-controlled chaser flows through this
  same loop (chase role, `target = this.fielderTarget`), so it's covered too.
- Audit: the only other continuous live-character translations are the runner sim
  (matchScene L754, already speed-scaled — untouched) which rundown runners also reuse.
  The remaining `group.position.set/copy` sites (setup placement, held-base snaps) are
  one-shot teleports, not glides, so no stride is needed there.

### 2c. Snappy kick clip (commit 8821e85)
- `glbCharacters.js` `CLIPS.kick`: `dur 0.7 → 0.5`, `contactAt 0.5 → 0.34`. Phase
  boundaries shifted to keep the foot striking through near contact (wind `<0.3`,
  contact `0.3–0.55`, follow `0.55–1`). Kicking-leg swing-through bumped: contact-phase
  `RUpLeg` delta `1.9 → 2.4` (peak `1.2 → 1.7`), follow eases `1.7 → 0.3`. Same 3-phase
  wind/contact/follow structure; reads as a quicker, bigger strike. No matchScene timing
  change needed (ball launches on the `onContact` callback; CPU kicker still auto-steps
  onto the ball so the foot meets it).

## Verification
- `npx vitest run`: 12 files, **72 passed** (was 71 + 1 new humanRunSpeed test).
- `npm run build`: clean (only the pre-existing >500kB chunk-size advisory).

## Concerns
- The kicker stride threshold is derived from per-frame `vx`, so on a frame where the
  slide momentarily stalls below 0.6 m/s it will flick back to `plate`. The `play` guard
  prevents re-trigger spam; visually it just settles. Matches the brief's intent.
- contactAt=0.34 lands while the kicking leg is mid-swing (RUpLeg ≈ -0.32 rad) rather
  than at full extension; verified by reading the clip math, not by eye. The human
  playtest should confirm the foot visually meets the ball — if it reads early, nudge
  `contactAt` toward ~0.4 (matchScene needs no change).

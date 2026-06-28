# Workstream 2 brief — Pitch arsenal + timer + fire pitch

Implement spec §2 of `docs/superpowers/specs/2026-06-27-kick-meter-pitch-arsenal-graphics-design.md`.
Branch `feat/feel-graphics-overhaul`. Vite + Three.js, headless logic in `src/game/*`,
Vitest tests in `tests/`. Keep the existing 64 tests green and `npm run build` clean.
Work incrementally; run `npx vitest run` + `npm run build` before each commit.

## What exists today (do not break)
- PITCH role (you on defense): `matchScene.startPitchSelect()` → HUD shows 5 pitch
  buttons (`PITCH_MENU`) → `onPitchSelect(id)` shows the pattern (`PITCH_PATTERNS[id]`)
  and enters phase `PITCH_TRACE` → player traces → `onStroke(e)` calls
  `scoreTrace(e.points, PITCH_PATTERNS[id], …)` → `throwPlayerPitch(id, quality)` builds
  a quality-scaled pitch and serves it; the AI kicks. `pitch.q` drives `aiKickError`.
- KICK role (you on offense): `startAutoPitch()` → `pickPitch(tuning)` (random from
  `tuning.pitch.types`) → `servePitch(pitch, aiKicks=false, locX)`; you kick with the
  NEW power meter (already built in WS1 — `powerFromError`, `setPowerMarker`, the HR gate).
- HUD pitch buttons built in `hud.js` constructor from `PITCH_MENU`; click handler
  (`pitchSelect` pointerdown) reads `dataset.pitch` and calls `this.onPitchSelect(id)`,
  wired in matchScene at `this.hud.onPitchSelect = (id) => this.onPitchSelect(id)`.
- `hud.showPattern(points)`, `hud.updateTrace`, `hud.hidePattern`, `hud.pitchGrade(label,good)`.
- matchScene update loop drives per-frame UI; `this.elapsed` is the match clock (seconds).

## Target behavior
Pick a **family** (3 buttons) → a **random variant pattern** from that family appears with
a **countdown bar (~2.2s)** → trace before it expires. Perfect trace in time → the pitched
ball **catches fire** and is harder to kick. CPU can also throw fire pitches at the human.

## Step 1 — Arsenal & families (`src/game/pitchPattern.js`, `src/data/tuning.json`)
- Keep the 5 existing patterns. ADD new variants so each family has 4, total 12. Suggested:
  - **HEAT** (straight, fast): `fastball` (existing), `riser`, `fourSeam`, `highCheese`.
    Patterns: mostly vertical lines with small lateral variation so they read distinct
    when traced (e.g. riser leans slightly, fourSeam dead straight, highCheese a tall
    straight line). All `curveM:0, ease:1.0, bounce:0`, high speed (`speedMph ~[82,94]`).
  - **BREAK** (hooks): `curveLeft` (existing), `curveRight` (existing), `slurve`, `backdoor`.
    Up-then-hook shapes; `curveM` nonzero (±1.8..±2.6), `ease:1.0, bounce:0`, `speedMph ~[62,74]`.
  - **JUNK** (off-speed/funky): `changeup` (existing), `bouncy` (existing), `eephus`, `knuckle`.
    Loopy / wiggly shapes; slow `speedMph ~[50,64]`, `ease:0.5` (changeup/eephus) or
    `bounce:1.2..1.5` (bouncy/knuckle). Pick params consistent with the existing entries.
- Every NEW pattern id MUST have a matching entry in `tuning.pitch.types` with
  `speedMph:[lo,hi], durScale, curveM, ease, bounce` (mirror the shape of existing entries).
- Add `export const PITCH_FAMILIES = { HEAT:[ids], BREAK:[ids], JUNK:[ids] };`
- Add `export function pickVariant(family, rng = Math.random)` → a random id from that family.
- Add `export const PITCH_FAMILY_MENU = [{id:'HEAT',label:'HEAT',color:'#e6483d'},
  {id:'BREAK',label:'BREAK',color:'#3b7dd8'},{id:'JUNK',label:'JUNK',color:'#b06ad0'}];`
- Keep `PITCH_MENU` exported (legacy) OR update its only consumer (hud.js). Prefer switching
  hud.js to `PITCH_FAMILY_MENU` and removing the `PITCH_MENU` import if nothing else uses it
  (grep first).

## Step 2 — HUD: 3 family buttons + countdown bar + fire badge (`hud.js`, `ui.css`)
- Build the picker from `PITCH_FAMILY_MENU` (3 buttons, `dataset.family`). The pointerdown
  handler reads `dataset.family` and calls `this.onPitchSelect(familyId)` (same callback name).
- Add a countdown bar element (e.g. `.trace-timer` with an inner `.tt-fill`). Methods:
  `showTraceTimer()`, `setTraceTimer(frac)` (frac 1→0 sets inner width%), `hideTraceTimer()`.
  Style it near the pattern pad. Use `cqw/cqh` units (the app is in a portrait container —
  do NOT use `vw/vh`).
- Add `fireBadge(on)` (or reuse `pitchGrade`) to flash a "🔥 FIRE PITCH!" indicator.

## Step 3 — matchScene pitch flow (`matchScene.js`)
- Import `PITCH_FAMILIES, pickVariant` (and drop `PITCH_MENU` usage if applicable).
- `startPitchSelect()`: hint `'PICK A PITCH TYPE'`.
- `onPitchSelect(familyId)`: if `!PITCH_FAMILIES[familyId]` return. Choose
  `this.selectedPitch = pickVariant(familyId)`. `showPattern(PITCH_PATTERNS[this.selectedPitch])`.
  Start the timer: `this.traceDeadline = this.elapsed + this.tuning.pitch.traceTimerMs/1000;`
  `this.traceStartedAt = this.elapsed;` `this.hud.showTraceTimer();` phase `PITCH_TRACE`,
  hint `'TRACE IT — FAST!'`.
- In the update loop, add a `PITCH_TRACE` block: compute
  `frac = (this.traceDeadline - this.elapsed) / (this.tuning.pitch.traceTimerMs/1000)`,
  `this.hud.setTraceTimer(Math.max(0,frac))`. If `this.elapsed > this.traceDeadline` and still
  in `PITCH_TRACE`, auto-release a meatball: hide pattern+timer, set a low quality (e.g. 0.2),
  badge `WOBBLER`, call `this.throwPlayerPitch(this.selectedPitch, 0.2, /*fire=*/false)`. Guard
  with a flag so it fires once.
- `onStroke(e)`: unchanged scoring, but FIRST hide the timer (`this.hud.hideTraceTimer()`), and
  after computing `res.quality`, set `const fire = res.quality >= this.tuning.pitch.fireQualityThreshold;`
  then `this.throwPlayerPitch(this.selectedPitch, res.quality, fire)`. If `fire`, `this.hud.fireBadge(true)`.
- `throwPlayerPitch(id, q, fire = false)`: keep current logic; add `fire` to the served pitch
  object: `this.pitch = { …, q, fire };`. If `fire`, trigger the ball fire visual (Step 5).

## Step 4 — Fire pitch makes the kick harder (the coupling)
- When the CPU pitches to the human, it may throw fire. In `startAutoPitch()` after
  `this.pitch = pickPitch(this.tuning);` add:
  `this.pitch.fire = aiThrowsFire(this.difficulty, this.tuning);` (new ai.js helper). If fire,
  trigger the ball fire visual.
- A fire pitch shrinks the kicker's sweet zone AND speeds the meter sweep. Implement with ONE
  knob: define `kickWindowScale = this.pitch?.fire ? this.tuning.pitch.fireKickWindowScale : 1`.
  Everywhere the human power meter samples timing, divide the error by this scale so the
  effective window narrows and the marker falls off faster:
  - update loop meter feed: `powerFromError(errNow / kickWindowScale, this.tuning)`
  - `attemptKick` player power: `powerFromError(errMs / kickWindowScale, this.tuning)`
  (Add a small helper `this.kickWindowScale()` to avoid duplication.)
- The human's own fire pitch already maxes the CPU's difficulty via `pitch.q` (>=0.9) — no
  extra change needed there beyond the FX/flag.

## Step 5 — Fire visual on the pitched ball (`fx.js` / `cinematics`)
- Give the in-flight pitched ball a fire look when `pitch.fire`: simplest robust approach is an
  emissive/orange tint + a glow/light on the ball mesh while it travels, cleared when the pitch
  resolves. Reuse `BallFx` (used for the perfect-kick fire+lightning) if it can attach to the
  ball without the lightning; otherwise add a lightweight `igniteBall(ball)` / `douseBall(ball)`.
  Keep it visual-only and crash-safe (wrap in try/catch if touching FX internals). Do NOT block
  gameplay on the FX.

## Step 6 — ai.js
- Add `export function aiThrowsFire(difficulty, tuning, rng = Math.random)` →
  `rng() < (tuning.pitch.cpuFireChance?.[difficulty] ?? 0)`.

## Step 7 — tuning.json additions (under `"pitch"`)
- `"traceTimerMs": 2200`, `"fireQualityThreshold": 0.9`, `"fireKickWindowScale": 0.6`,
  `"cpuFireChance": { "Rookie": 0.0, "Street": 0.12, "King": 0.25 }`, plus the new
  `pitch.types` entries for every new variant id.

## Step 8 — Tests (`tests/pitchArsenal.test.js`)
- `pickVariant(family)` returns an id contained in `PITCH_FAMILIES[family]` (test each family
  across many rng samples).
- Every id listed in `PITCH_FAMILIES` exists as a key in `PITCH_PATTERNS`.
- Every id in `PITCH_FAMILIES` has a matching `tuning.pitch.types` entry (import the json).
- `aiThrowsFire` is deterministic with a seeded rng stub (returns true when rng< chance).

## Constraints
- Tuning numbers live ONLY in tuning.json. Logic in `src/game/*` stays headless (no DOM/THREE)
  — the fire VISUAL lives in fx/cinematics or matchScene, not pitchPattern/ai.
- Don't regress the KICK-role power meter from WS1, the CPU-pitch path, or the 64 existing tests.
- Commit in logical chunks (arsenal+tests, HUD, matchScene flow, fire coupling, FX) with plain
  messages (no Co-Authored-By trailer). Run vitest + build before each commit.
- Skip interactive browser testing — the human playtests. Verify by reading code back + tests + build.

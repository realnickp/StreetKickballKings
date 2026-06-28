# Workstream 2 report — Pitch arsenal + countdown timer + fire pitch

Branch: `feat/feel-graphics-overhaul`. All 8 brief steps implemented.

## Final verification
- Tests: `Test Files  12 passed (12) / Tests  71 passed (71)` (was 64; +7 new in `tests/pitchArsenal.test.js`).
- Build: `npm run build` → `✓ built in ~1.0s`, clean (only the pre-existing INEFFECTIVE_DYNAMIC_IMPORT + chunk-size warnings, unrelated to WS2).

## Commits (logical chunks, plain messages)
| Short hash | Chunk |
|---|---|
| `142f47e` | arsenal + families + pickVariant + aiThrowsFire + fire tuning + tests |
| `4e50ec1` | HUD: 3 family buttons + trace countdown bar + fire badge |
| `355d704` | FX: crash-safe `igniteBall`/`douseBall` |
| `ceadb5f` | matchScene: family→variant pick + trace countdown flow + fire coupling |

## Per-step

### Step 1 — Arsenal & families (`src/game/pitchPattern.js`, `src/data/tuning.json`)
- Kept the 5 existing patterns; added 7 new variants → 12 total, 4 per family.
- Each family + variants + tuning params (`speedMph`, `durScale`, `curveM`, `ease`, `bounce`):
  - **HEAT** (straight verticals, `curveM:0 ease:1 bounce:0`): `fastball` [80,90]/1.0 (existing), `riser` [84,92]/0.95, `fourSeam` [86,94]/0.92, `highCheese` [82,90]/0.95.
  - **BREAK** (up-then-hook, `ease:1 bounce:0`): `curveLeft` [64,74]/1.15/curveM −2.2 (existing), `curveRight` [64,74]/1.15/+2.2 (existing), `slurve` [64,72]/1.15/−2.5, `backdoor` [66,74]/1.12/+2.0.
  - **JUNK** (loopy/off-speed): `changeup` [52,60]/1.5/ease 0.5 (existing), `bouncy` [58,66]/1.2/bounce 1.4 (existing), `eephus` [50,58]/1.6/ease 0.5, `knuckle` [54,62]/1.25/bounce 1.3.
- Added `PITCH_FAMILIES`, `pickVariant(family, rng)`, `PITCH_FAMILY_MENU` (HEAT `#e6483d`, BREAK `#3b7dd8`, JUNK `#b06ad0`).
- **Kept `PITCH_MENU` exported** rather than removing it — its only app consumer (hud.js) was switched to `PITCH_FAMILY_MENU`, but `tests/pitchPattern.test.js` still imports `PITCH_MENU` and asserts the 5 canonical ids, so removing it would have regressed an existing test. Leaving the legacy export is the lower-risk choice the brief explicitly allows.

### Step 2 — HUD (`src/ui/screens/hud.js`, `src/ui/ui.css`)
- Picker now builds 3 buttons from `PITCH_FAMILY_MENU` with `dataset.family`; pointerdown handler reads `dataset.family` and calls the same `onPitchSelect` callback.
- Added `.trace-timer > .tt-fill` element + `showTraceTimer()`, `setTraceTimer(frac)` (sets inner width %, adds `.low` class ≤0.33), `hideTraceTimer()`. CSS uses `cqw/cqh` units, sits just below the pattern pad.
- Added `fireBadge(on)` — flashes "🔥 FIRE PITCH!" by reusing the existing top `pitchGrade` badge slot (avoids a new center stamp covering the play).

### Step 3 — matchScene pitch flow (`src/game/matchScene.js`)
- Imports `PITCH_FAMILIES, pickVariant` (kept `PITCH_PATTERNS, scoreTrace`).
- `startPitchSelect()` hint → `'PICK A PITCH TYPE'`.
- `onPitchSelect(familyId)` guards on `PITCH_FAMILIES[familyId]`, sets `this.selectedPitch = pickVariant(familyId)`, shows the pattern, starts `traceStartedAt`/`traceDeadline` (`traceTimerMs/1000`), `showTraceTimer()`, phase `PITCH_TRACE`, hint `'TRACE IT — FAST!'`.
- Update loop `PITCH_TRACE` block drives `setTraceTimer(frac)` and, on `elapsed > traceDeadline` (guarded by `this.traceExpired`), auto-releases a meatball: hide pattern+timer, `pitchGrade('WOBBLER')`, `throwPlayerPitch(selectedPitch, 0.2, false)`.
- `onStroke(e)` hides the timer first, computes `fire = res.quality >= fireQualityThreshold`, calls `throwPlayerPitch(id, quality, fire)` and `fireBadge(true)` when fire.
- `throwPlayerPitch(id, q, fire=false)` adds `fire` to `this.pitch` and calls `igniteBall(this.ball)` when fire.

### Step 4 — Fire pitch makes the kick harder (coupling)
- `startAutoPitch()` sets `this.pitch.fire = aiThrowsFire(this.difficulty, this.tuning)`, ignites the ball + flashes the badge when fire.
- Added helper `kickWindowScale()` → `pitch.fire ? tuning.pitch.fireKickWindowScale : 1`.
- Divided the error by the scale at **both** `powerFromError` call sites: the update-loop meter feed (`errNow / kickWindowScale()`) and `attemptKick` (`errMs / kickWindowScale()`). WS1's HR gate is untouched and still consumes the resulting `power01`.

### Step 5 — Fire visual (`src/cinematics/fx.js`)
- Added lightweight `igniteBall(ball)` / `douseBall(ball)`: emissive-orange tint (`#ff5a1e`, intensity 1.7) on the ball's `MeshStandardMaterial` + an additive glow sprite parented to the ball mesh so it rides the flight. Original emissive saved/restored. Entirely wrapped in try/catch and console-recovers — never blocks gameplay. `douseBall` is called at the start of `attemptKick` and in `strike`, covering every pitch-resolution path (kick / whiff / too-late / foul).

### Step 6 — ai.js
- Added `aiThrowsFire(difficulty, tuning, rng = Math.random)` → `rng() < (tuning.pitch.cpuFireChance?.[difficulty] ?? 0)`.

### Step 7 — tuning.json (under `pitch`)
- `traceTimerMs: 2200`, `fireQualityThreshold: 0.9`, `fireKickWindowScale: 0.6`, `cpuFireChance: { Rookie: 0.0, Street: 0.12, King: 0.25 }`, plus the 7 new `pitch.types` entries.

### Step 8 — Tests (`tests/pitchArsenal.test.js`)
- 3 families × 4 variants (12, no overlap); family menu lists the 3 ids; `pickVariant` always in-family across 200 samples; sweeping-rng coverage of every variant; `pickVariant('NOPE')` → null; every family id has a pattern (≥2 pts) and a complete tuning entry; `aiThrowsFire` deterministic vs configured chance (King true<0.25/false≥, Rookie never, unknown difficulty → 0).

## New pattern ids → family / params
See the Step 1 table above. New ids: `riser, fourSeam, highCheese` (HEAT); `slurve, backdoor` (BREAK); `eephus, knuckle` (JUNK).

## Deviations / concerns
- **`PITCH_MENU` kept** (not removed) to preserve the existing `pitchPattern.test.js` assertions — noted above. hud.js no longer imports it.
- **HEAT trace shapes are near-identical by design.** `scoreTrace` normalizes to the bounding box aspect-preserved, so all straight vertical lines grade the same regardless of length/x — HEAT variants differ in pitch behavior (speed/durScale), not trace difficulty. Minor lateral nudges were added to `riser`/`highCheese` so they read slightly distinct on the pad. Consistent with the brief's guidance.
- **Fire FX is a tint+glow, not the BallFx fire/lightning** — reusing `BallFx` would have dragged in the lightning bolts and its own start/stop/update lifecycle, which is heavier and riskier than the brief's "simple emissive-orange tint + glow is fine" fallback. Chose the lightweight self-contained helper.
- No interactive browser testing performed (per brief — human playtests). Verified by code read-back + 71 passing tests + clean build.

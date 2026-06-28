# Street Kickball Kings — Power Meter, Pitch Arsenal & Graphics Overhaul

> Spec — 2026-06-27. Status: approved design, pending implementation plan.
> Covers three independent workstreams: (1) the kick power meter, (2) the
> category→random pitch arsenal with timer + fire pitch, (3) feel + full graphics pass.

## Goal

Make the moment-to-moment game **feel impactful and look broadcast-quality**, fixing
the dev's concrete complaints:
- Backgrounds look cheap.
- Players don't animate their feet when moving toward the ball.
- The kick is slow and unimpactful.
- Tap sensitivity is too weak — it takes too many taps to run to the bases.

And adds two new skill mechanics the dev wants:
- A **timed power meter** for kicking farther, where perfect meter timing **and** perfect
  player position = a home run.
- A **pitch arsenal**: pick a category, get a random pattern from that family, race a
  **timer** to trace it; a perfect pitch **catches fire** and is harder to kick.

Build order: **1 → 2 → 3**, each verified by *real play* before moving on
(per [[verify-gameplay-by-real-play]] — never claim it works off synthetic checks).

---

## Workstream 1 — Kick power meter

### Current behavior (what we're changing)
- KICK role: drag horizontally to slide the kicker left/right (`aimKicker`, `KMAX 3.4`);
  a sharp up-flick / up-swipe / up-release fires (`attemptKick({align:true})`).
- Kick quality = `judgeKick(errMs)` where `errMs = (releaseTime − pitchArrival)*1000`.
  Lateral misalignment is *folded invisibly* into the error (1m off ≈ 175ms) in
  `attemptKick` (`matchScene.js` ~L457). Power comes only from the timing band.
- Home runs: only a **consumed special-meter** kick (`kickWasSpecial`) may leave the park.

### New behavior
- Keep drag-to-position and up-flick-to-fire. **Add a visible vertical power meter**
  beside the kicker.
- A power value `P ∈ [0,1]` is shown by a marker that **rises and peaks exactly at
  plate arrival**, then falls (triangle/parabola centered on `pitchArrival`). Up-flick
  **locks** `P` and the lock time.
- **Distance now scales with `P`.** Launch speed = `base + P * range` (replaces the
  flat per-band power), so a well-locked kick genuinely rips — fixing "weak kick."
- Timing bands (PERFECT/GOOD/OK/FOUL) from `|errMs|` still drive **loft** + foul/pull bias.
- **Home run = both axes nailed:**
  - sweet-zone lock (`P ≥ ~0.9`), **and**
  - aligned under the ball (`|kicker.x − ball.x| ≤ ~0.6m`), **and**
  - a fair fly with enough speed/loft to clear the fence (existing containment decides).
  - On an HR-grade kick, fire the existing **fire + lightning** ball FX + slow-mo.
- This **supersedes the special-only HR gate**: a true perfect kick can go yard on its
  own. The special meter becomes an *extra* power multiplier on top (`powerMult`), not a
  prerequisite. Windows stay tight so HRs are earned, not spammy.

### Components touched
- `src/game/kickTiming.js` — `judgeKick`/`launchParams` gain a `power01` (meter `P`)
  input that scales `speed`; HR eligibility helper.
- `src/game/matchScene.js` — sweep the meter during `PITCH`, capture `P` on the kick,
  pass it to `launchParams`, evaluate the HR rule, drive HUD.
- `src/ui/screens/hud.js` — render the sweeping power meter + sweet-zone band.
- `src/data/tuning.json` — `kick`: meter sweep timing, `power01` speed range, HR
  thresholds (`hrPower`, `hrAlignM`).

### Interface
- Meter is a self-contained HUD widget: `hud.showPowerMeter()`, `hud.setPowerMarker(P)`,
  `hud.hidePowerMeter()`. matchScene owns the `P(t)` curve and feeds the marker each frame.

---

## Workstream 2 — Pitch arsenal (category → random variant) + timer + fire

### Current behavior
- PITCH role: pick 1 of **5** pitches (`PITCH_MENU`), trace its single fixed pattern
  (`PITCH_PATTERNS`), `scoreTrace` (accuracy + speed) → quality → speed/break/wildness.

### New behavior
- Picker becomes **3 family buttons**: **HEAT** (fastballs), **BREAK** (curves L/R),
  **JUNK** (changeup / bouncy / risers).
- On family pick, choose a **random pattern** from that family's variant pool and start a
  **countdown bar (~2.2s)**. Player must trace before it expires; timeout = auto-release
  a meatball (low quality).
- **Arsenal:** ~12–15 patterns total (4–5 per family), extending the current 5. Each
  variant maps to existing pitch-physics params (`durScale`/`curveM`/`ease`/`bounce`) so
  no new ball physics are required — variety comes from pattern shape + param blends.
- **Perfect trace in time → fire pitch.** `quality ≥ ~0.9` ignites the pitched ball
  (fire trail FX). A fire pitch is **harder to kick:** it narrows the kicker's sweet-zone
  window and speeds the power-meter sweep.
- **Symmetric:** the **CPU can throw fire pitches** (when its simulated pitch "quality"
  is high), applying the same harder-to-kick modifier to the human's meter — so fire is a
  real two-way threat.

### Components touched
- `src/game/pitchPattern.js` — `PITCH_FAMILIES` (family → variant ids), expanded
  `PITCH_PATTERNS`, a `pickVariant(family, rng)` helper. `scoreTrace` unchanged.
- `src/game/matchScene.js` — family picker flow, countdown timer, timeout→meatball,
  fire-pitch flag set when quality is perfect, applied to the kick difficulty.
- `src/game/ai.js` — CPU pitch can roll a high-quality "fire" pitch; CPU kicker respects
  the fire modifier.
- `src/ui/screens/hud.js` — 3-button family picker + countdown bar + fire indicator.
- `src/cinematics/fx.js` — reuse/extend ball fire FX for the pitched ball.
- `src/data/tuning.json` — `pitch`: `traceTimerMs`, `fireQualityThreshold`, fire kick
  modifiers (window shrink, sweep-speed multiplier).

---

## Workstream 3 — Feel & full graphics pass

### 3a. Run-tap sensitivity
- `src/game/baseRunning.js` `humanRunSpeed`: lower the dead-zone threshold
  (`0.5 → ~0.3` taps/sec), raise effective speed-per-tap, add a small per-tap surge so
  each tap clearly advances the runner.
- `src/data/tuning.json` `running`: bump `speedPerTapHz` / `maxSpeedMs` as needed.
- Target: noticeably fewer taps to leg out a base. **Tuned by real play**, then locked.

### 3b. Animation
- **Dead feet bug:** characters that *slide* to a new position (kicker lining up,
  fielders chasing the ball) aren't switching into the run cycle / `speedFactor` stays 0.
  Investigate with systematic-debugging; fix by driving the run clip + `speedFactor` from
  each character's actual per-frame movement velocity, so feet always move when they move.
  Likely in `matchScene` movement code + `glbCharacters.js` `GlbCodeAnimator`.
- **Snappier kick:** rework the kick clip to anticipation → fast contact → follow-through;
  ensure the swing reads as impactful and lands near ball contact.

### 3c. Graphics (D — full pass)
- **Env map / IBL:** generate a PMREM from the sky and set `scene.environment` so PBR
  materials come alive (gloss on the rubber ball, light on metal). `renderer.js`/`field.js`.
- **Ambient occlusion:** add an AO pass (N8AO or `GTAOPass`) to the composer chain after
  `RenderPass`, before bloom. Grounds players/bases/fence with contact shading. `renderer.js`.
- **Rim/back light:** add a colored rim/back light on players for broadcast-style
  separation from the crowd ring. `field.js` lighting or a dedicated player light.
- **Field materials:** asphalt normal map, better base/plate/mound/fence materials, a
  dedicated glossy **hero ball** material + crisp contact shadow. `field.js`, `ball.js`.
- **Backdrop integration:** atmospheric fog/haze tying the field to the crowd ring; reduce
  the obvious ×4 mirror-tiling (fewer repeats / push back / subtle depth blur); grade the
  ring to match each field's lighting so it sits *behind* the action, not as wallpaper.
  `field.js`.
- **Shadows:** bump `sun.shadow.mapSize` to 2048 and pull the shadow-camera frustum tight
  around the infield (sharper, less mushy). `field.js`.
- **Optional:** a warm "golden-era street" color-grade LUT pass for palette cohesion.

> Backdrop regeneration (new higher-res Higgsfield scenes) is **out of scope** for this
> spec — we first exhaust integration/shading. If the ring still reads cheap after the
> pass, regeneration is a separate follow-up (asset-gen track, per [[skk-backdrop-style]]).

---

## Testing & verification

- **Headless unit tests (Vitest):** new pure logic gets tests — meter `P(t)` curve + HR
  eligibility (`kickTiming`), family→variant selection + timeout-meatball (`pitchPattern`),
  updated `humanRunSpeed`. Keep the existing 57 green.
- **Real-play verification (required, per memory):** drive the actual game for each
  workstream — confirm the meter sweeps and locks, an aligned sweet-zone kick is an HR and
  a misaligned one isn't; confirm the family picker → random pattern → timer → fire pitch;
  confirm running takes fewer taps; confirm feet move when characters slide; visually
  confirm the graphics pass (env-map gloss, AO contact, rim separation, backdrop sitting
  back) via screenshots. No "it works" claims off flags or subagent self-assessment.
- `npm run build` stays clean.

## Out of scope
- Multiplayer, new teams/fields/rosters, season/meta systems.
- Regenerating backdrop video assets (follow-up if integration isn't enough).
- New announcer VO / music.

## Open risks
- Tuning the HR windows so home runs feel earned but achievable — pure play-test calibration.
- AO pass cost on mobile; gate behind the existing `quality` setting if it's too heavy.
- The dead-feet fix may surface a deeper animator state-machine issue; budget debugging time.

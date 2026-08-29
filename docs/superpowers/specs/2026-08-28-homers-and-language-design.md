# Homers earn it; street language — Design

**Date:** 2026-08-28 (after PR #110)
**Source:** dev, verbatim: "its really easy to kick homers and ditch the baseball language...
glove up and shit like that".

## 1. Homers must be EARNED

Today `kickHrEligible` (`isHrEligible`: `power01 ≥ 0.9 && alignErrM ≤ 0.6`, loft ≥ 28°) only
drives the impact cam / robbed beat. **The physics decides the homer** (`ball.js:134`: over the
fence radius above the wall top → `homer()`), and a GOOD-timed full flick already carries
~39 m at 38° against 36–42 m fences, PERFECT ~48 m. Every decent kick leaves.

New rules (`src/data/tuning.json` `kick.hr` block, `src/game/kickTiming.js` pure helpers):
- **Eligibility (player):** quality `PERFECT` (±38 ms) AND `power01 ≥ 0.92` AND
  `alignErrM ≤ 0.35` AND flick loft ≥ `hrMinLoftDeg` (28°) — OR a consumed crown. The 45 %
  gap-shot roll on eligible non-crown kicks stays.
- **Physical cap:** a kick that is NOT eligible has its launch speed capped so the predicted
  carry (`Ball.predictLanding` at that loft, with the field's carry scale) lands at most
  `fenceM − hr.trackM` (3 m) — a deep fly to the track or off the wall (the wall bounce is
  already live ball), never over. `capSpeedForCarry(loftDeg, carryM, g)` pure; applied in
  `attemptKick` after every other modifier (gear mods, carry scale) and BEFORE the crown
  guarantee (which only runs when eligible). Direction untouched.
- **CPU:** eligible only on `PERFECT`, or the existing meatball-punish path; the cap applies to
  the CPU too (a King-difficulty PERFECT can still leave).
- **Robbed at the wall:** unchanged (`heatRobbed` / the rob call) — a capped kick to the track
  is exactly the ball the rob is for.
- Tuning surface: `hr: { quality: 'PERFECT', power: 0.92, alignM: 0.35, trackM: 3, gapShot: 0.45 }`.
- Tests: `capSpeedForCarry` (a 38° kick capped to 39 m carries ≤ 39 m; a capped speed never
  exceeds the uncapped); `isHrEligible` truth table (GOOD never eligible; PERFECT + 0.92 +
  0.35 yes; PERFECT + 0.9 no); a 1 000-kick simulation over the real judge with a "decent
  player" error model (σ 90 ms timing, σ 0.35 m alignment, full flick): homer rate between
  4 % and 12 %, zero homers from GOOD-quality kicks. Harness: `KICK CONTACT`-style scenario
  fires 20 GOOD-timed full-flick kicks → 0 `homer()`; 10 PERFECT aligned → ≥ 4.

## 2. Street language (no baseball words on screen or in the booth)

Kickball keeps: strike, ball, foul, inning, pitch/pitcher, base, steal, pickle, home run/HR,
catch, out, plate. Out: glove, batter/at-bat, slugger, RBI, dugout, bat, "hit" as a noun for
a kick. Changes:
- Stat `glove` → label **HANDS** (`GLV` → `HND` in `hud.js:556`, `screens.js:247`, the
  Locker career line "GLOVE" → "HANDS", any tooltip); data key unchanged.
- `SWITCH! GLOVE UP!` → `SWITCH! LOCK IT DOWN!`.
- Roster `pos: "Slugger"` → `"Big Boot"`; audit every `pos` value for baseball words.
- User-facing strings audit across `src/ui`, `src/game/matchScene.js` stamps/calls/hints,
  `src/meta/unlocks.js` (names, unlock copy: "Hit 3 home runs" → "Kick 3 home runs"), daily
  challenges, tutorial cards, `teams.json` copy. A vitest (`tests/streetLanguage.test.js`)
  greps the user-facing string sources for the banned list and fails on any hit.
- Booth: `walkout-glove_1` "Best glove on the block…" → "Best HANDS on the block…"
  (re-generate both voices with `scripts/gen-announcer.mjs`, key in `.env.local`); audit the
  other VO texts in `gen-announcer.mjs` for the banned list (regenerate only what changes).

## Testing & verification
vitest (helpers, simulation, language audit); harness (HR-rate scenario; booth VO manifest
still resolves every line); the dev's phone for feel.

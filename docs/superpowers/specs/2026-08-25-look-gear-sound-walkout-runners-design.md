# Look, Gear, Sound, Walk-out & Runners Round — Design

**Date:** 2026-08-25
**Source:** dev punch list via remote control: characters and surfaces brighter with smooth
edges; unlocked items have no relationship to the game and can't be used in it; better sound
effects for everything; the intro dance is silly (the client doesn't want it as a feature) but
the kicker should dance on every home run, a different dance every time; better indicators
for where a runner is when you can't see them.

Design law unchanged: every feature must be SEEN / UNDERSTOOD / FELT on a phone.

Builds on the uncommitted booth/sound/contact round (VO queue, pronouns, SFX pipeline,
GAME TIME break, PEG pad) already in this working tree — that round is verified and
committed first (see Testing).

## 1. Brighter, smooth edges

**Root cause of jagged edges:** every frame renders through the `EffectComposer`
(`src/engine/renderer.js`), whose render target is single-sampled. The
`antialias: true` flag on the `WebGLRenderer` only affects the default framebuffer, which is
never drawn to. Effective AA today = none. The grade pass then adds film grain (0.028) and
chromatic aberration (0.0004), both of which roughen edges further.

- **MSAA on the composer.** Construct the composer with a
  `WebGLRenderTarget(w, h, { samples: 4, type: HalfFloatType })`. `resize()` keeps the
  samples. `?msaa=N` URL flag overrides (0/2/4) for testing.
- **Perf watchdog** wires the existing dormant `setQuality()`: a rolling 3 s average frame
  time > 24 ms drops samples 4 → 2 → 0 (and the grade pass off at 0). One-way per session.
  Logged to console so the phone check can read it.
- **Global light lift** — one `LIGHT_LIFT` table in `field.js` applied to every
  `SKY_PRESETS` entry so all ten fields move together: ambient intensity ×1.65 (0.3 → ~0.5),
  hemisphere ×1.4, rim 0.28 → 0.5, environment intensity 0.3 → 0.5 (backdrop-derived env
  0.55 → 0.7), tone-mapping exposure 1.22 → 1.35. Bloom threshold stays 1.0 so the lift
  doesn't glow.
- **Grade pass:** grain 0.028 → 0.008, chromatic aberration → 0, vignette 0.3 → 0.18,
  saturation 1.12 → 1.2.
- **Character materials** (`glbCharacters.js`): emissive intensity 0.55–0.6 → 0.4 so faces
  and kits take shape from light instead of flat self-glow; roughness 0.85 → 0.7 for a
  cleaner highlight.
- **Geometry:** ball `SphereGeometry(r, 18, 14)` → `(r, 32, 24)`; home plate cylinder
  5 → 24 segments; procedural (menu-only) characters: spheres ×2 segments, capsules
  `(3, 8)` → `(6, 16)`.

## 2. Gear that matters in the game

Today: an equipped Locker kick fires only when the crown meter is full (rare); cleats are a
subtle foot tint; nothing in the match says what you're wearing. Fix the felt problem.

### 2a. POWER KICK — one button, charges

Replace the arm-when-meter-full model with a **charge counter** on `MatchScene`:

- Equipped Locker kick → **2 charges at match start**.
- Crown meter fills → **+1 charge**, meter resets to 0 (same `crownFeed` events/gains).
- The 👑 button becomes the **POWER KICK button**: shows the equipped kick's name and
  charge count ("FLAIR ×2"; "CROWN KICK ×1" with no gear). Lit whenever `charges > 0` and
  it's your at-bat; dim otherwise. Tap → armed for this at-bat (pulses gold, kicker glows,
  `sfx crown-arm`), charge consumed at launch. Armed state clears on the next at-bat if the
  kick never happened (charge refunded).
- Launch path: unchanged from today's consume branch — special clip via `hasClip`, gear
  `mods` replace `powerMult`, `kickWasSpecial` HR eligibility, `cine:special` beat.
- `hud.setSpecial(fill, ready, armed, label)` grows to
  `setPowerKick({ name, charges, armed, meterFill })`; the meter ring around the button
  still shows fill toward the next charge.

### 2b. Cleats — real speed, seen

- `unlocks.js` cleat items gain `speedMult`: fire 1.06, ice 1.06 (+ steal jump ×1.1), volt
  1.08, royal 1.08, black 1.10, gold 1.12. Applied to the player's runners in the runner
  speed path (`tuning.running.maxSpeedMs` × `char.speedMult`), player side only.
- **Speed trail:** while a player runner is above 80 % of max speed, a short ribbon
  (6 fading quads, cleat hex, additive) trails the feet. `src/game/fx/speedTrail.js`,
  updated from `MatchScene.update`, hidden otherwise. No cleats → no trail.
- Foot tint emissive raised (vertex-color multiplier 1.0 → 1.6) so the shoes read on a
  phone.

### 2c. Uniforms stay cosmetic, but shown

- **YOUR GEAR strip**: kick · cleats · kit names with their colors, on the away captain's
  walk-out card and as a HUD toast at the player's first at-bat ("YOUR GEAR — FLAIR ·
  FIRE REDS · BLACKOUT"). Stock slots read "STOCK".
- **Locker copy** says what each item does in play: kicks "2 power kicks a game — ×1.45
  power", cleats "+8 % speed on the bases", uniforms "your crew's kit".

## 3. Sound for everything

### 3a. New files (`scripts/gen-sfx.mjs`, ElevenLabs, resumable)

| file | use |
|---|---|
| ui-tap | every HUD button press |
| ui-confirm | armed / committed actions (POWER KICK arm, throw target chosen, steal launched) |
| score | a run crosses the plate |
| safe | SAFE call (slide-in slap) |
| out | OUT ritual punctuation (whistle + thud) |
| tag | tag out (glove slap) |
| foul | foul ball (dull thunk) |
| inning | half-inning change horn |
| crown-tick | each crown-meter gain (rising ping, pitch scales with fill) |
| crown-arm | POWER KICK armed |
| countdown | trace-timer / pitch-clock beep |
| unlock | unlock toast chime |
| stomp | walk-out footsteps bed |
| cheer-big | HR + walk-off layer (bigger than crowd-cheer) |
| boo | your out with runners on / opponent scores |

**Regenerated (weak today):** `kick` (harder thump), `catch` (glove pop), `peg` (rubber
smack), `crowd-cheer` (bigger, wider). Prompts share one style line ("arcade-loud, punchy,
dry, single hit, no music") so everything layers.

### 3b. Wiring

- `hud.js`: one `tap(kind)` helper bound to every button (throw pad, GO, DUEL, REVERSE,
  CALL, POWER KICK, aim bar, pitch picker, steal chips, SKIP chip) → `ui-tap`, and
  `ui-confirm` where the press commits an action.
- `matchScene.js`: `score` at every `r.state = 'scored'` site (via one `scoreRun()` helper);
  `safe` with the `safe` VO; `out` in the out ritual; `tag` with the `forced` VO on a tag;
  `foul` with the `foul` VO; `inning` on `halfEnd`; `crown-tick` in `crownFeed` (skipped on
  the full beat, which keeps `bassdrop`); `countdown` on the last three trace-timer ticks;
  `stomp` looped under the walk-out; `cheer-big` on homers and walk-offs; `boo` on your out
  with runners on and on a CPU run.
- `screens.js`: `unlock` on each unlock toast row.
- All new names in `FILES.sfx` + `SFX_ALIAS` with gains, and in `warm()`.

## 4. Walk-out replaces the dance

The client doesn't want the choreographed number. The lineup still shows — as a walk-out.

- Away splash (1.9 s) → **all 8 away players walk in from deep center** in the existing
  2-3-2 wedge `SLOTS`, offset 6 m deeper, playing `walk` (`inPlace`, so the group is moved
  by code at walk speed ~1.2 m/s) for 5 s, then settle to `idle` at the slots. Star cards
  (captain, BIG BOOT, WHEELS) cycle every 1.7 s on top with their VO tags; `crowd-cheer` at
  squad-on; `stomp` bed under the walk.
- Camera: front low dolly tracking back with the wedge for 3.4 s, one hard cut to the side
  rail for the remainder. Shot table shrinks to those two.
- Home splash → same for home. Then the existing GAME TIME break (scratch → music stop →
  stamp → PLAY BALL VO → match beat) unchanged.
- ≈ 1.9 + 5 + 2 + 5 + 1.6 ≈ 15.5 s. SKIP chip kept; stray taps still ignored.
- **Deleted:** `src/game/walkoutRoutines.js` + its test, the 5-shot table, `squadPart`, the
  extras-pack gate in `lineupIntro` (`walk` is base-pack, so the lineup can never miss).
  `loadExtrasFor` still runs in the background for HR dances; `extrasReady` stays on the
  scene for the dance bag.
- The legacy one-star swagger parade is deleted too — there is one walk-out now.

## 5. HR dance every time, never the same twice

`cine:crowned` already fires for both sides; every homer dances at the plate. Change the
pick:

- New `DanceBag` in `src/game/animExtras.js`: shuffled list of all loaded dance clip names
  (up to 14: `dance1–4` + the 10 extras), drawn without replacement; on empty, reshuffle
  with the constraint that the first draw ≠ the last one played. Seeded from
  `save.dance.recent` (last 4 played, persisted via `SaveManager`) so the first HR of the
  next match is fresh too. The bag is refreshed when extras finish loading (new names
  appended, shuffled in).
- `director.crowned()` draws from the scene's bag instead of `pickDance`. Victory lap and
  stolen-home celebrations keep `pickDances`/`pickDance`.

## 6. Runner indicators

Nothing directional exists today (text banners + a 3-pip occupancy diamond); runners are
off-frame during ball-flight / crane shots, on defense, and every trailing runner in the
`runners` shot.

### 6a. Edge arrows

- HUD layer `.runner-arrows` with up to 3 chips. Each frame, for every runner in
  `running`/`held`/stealing state: project with `worldToScreen`; if the point is outside the
  frame inset (24 px) or behind the camera (use the camera-space direction sign), place a
  chip clamped to the inset rectangle along the ray from screen center, arrow rotated to
  point at the runner, with jersey number and target base ("→2ND", "→HOME").
- Pure helper `edgeClamp(x, y, w, h, inset)` in `src/ui/runnerArrows.js` (tested).
- Player's runners in the player's color; CPU runners (when the player fields) in theirs.
  Pulse red-gold when `targetBase === 3` or stealing. Chip hides when the runner is in
  frame. Not shown during cinematics or the walk-out.

### 6b. Live diamond

- Score-bug diamond grows to 44 × 30 px SVG: base pips + one dot per live runner that
  slides along the basepath from `r.sim.progressM / basePathM` between its from/to bases,
  in the runner's team color; on a score the dot flashes at home and fades. Held runners
  sit on their pip. Updated every frame from `MatchScene.update` via
  `hud.setRunnerDots([{from, to, t, color, id}])`.

## Testing & verification

- **First:** verify and commit the pending booth/sound/contact round (vitest +
  `scripts/booth-sound-e2e.mjs`) as its own commit so this round has a clean base.
- vitest: `edgeClamp` math; `DanceBag` (no immediate repeat, exhausts before repeating,
  save seeding); POWER KICK charge accounting (gear start, meter +1, consume, refund);
  cleat `speedMult` table; walk-out timeline helper; SFX alias/`warm` coverage for every
  new name.
- Playwright harness (`scripts/round-e2e.mjs`): walk-out plays and skips, POWER KICK
  charges lit/consumed, arrows appear for an off-frame runner, every new SFX alias resolves
  to a file, HR dance draws 14 distinct clips in a row.
- Real-play pass via claude-in-chrome per [verify-gameplay-by-real-play]: brightness/edges
  screenshots before vs after, walk-out, HR dance twice (different), power kick from gear,
  cleat trail, arrows during a deep fly, sounds on taps.
- Merge to main by PR; deploy only on the dev's explicit "push".

## Out of scope

Backdrop regeneration, new dance clips, new VO lines, the AO pass, any currency/shop, the
pickle duel, kick judging values (Addendum truth).

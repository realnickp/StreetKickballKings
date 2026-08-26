# Look, Gear, Sound, Walk-up & Runners Round — Design

**Date:** 2026-08-25 (amended the same evening after the dev's follow-up)
**Source:** dev punch list via remote control: characters and surfaces brighter with smooth
edges; unlocked items have no relationship to the game and can't be used in it; better sound
effects for everything; the intro dance is silly (the client doesn't want it as a feature) but
the kicker should dance on every home run, a different dance every time; better indicators
for where a runner is when you can't see them.

**Follow-up (same day, 16 FBX uploads):** each kicker walks out to the plate before they kick
and hits a taunt; more unlockable kicks with realistic conditions, saved and equippable, usable
in the game; cleats and uniform changes must be emphasized and apparent. Decisions taken with
the dev: the pre-game lineup show is DROPPED (walk-ups replace it); the walk-up + taunt plays
for every at-bat on both sides, one tap skips to the pitch.

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
- `hud.setSpecial(fill, ready, armed, label)` becomes
  `setPowerKick({ name, charges, armed, meterFill })`; the meter ring around the button
  still shows fill toward the next charge.

### 2b. Cleats — real speed, seen

- `unlocks.js` cleat items gain `speedMult`: fire 1.06, ice 1.06 (+ `stealMult` 1.1), volt
  1.08, royal 1.08, black 1.10, gold 1.12. Applied to the player's runners in `RunnerSim`
  (`speedMult` option), player side only.
- **Speed trail:** while a player runner is above 80 % of max speed, a short additive
  ribbon in the cleat hex trails the feet (`src/game/fx/speedTrail.js`). No cleats → no
  trail.
- Foot tint over-brightened (`CLEAT_BOOST` 1.6 on the vertex colour) so the shoes read on a
  phone; a **cleat ring** (flat ring in the cleat colour) sits under the kicker's feet during
  the walk-up (§7).

### 2c. Uniforms — cosmetic, but apparent

- **YOUR GEAR strip**: kick · cleats · kit names, on the player's NOW KICKING walk-up card
  and as a HUD toast at the player's first at-bat ("YOUR GEAR — FLAIR · FIRE REDS ·
  BLACKOUT"). Stock slots read "STOCK".
- **Locker preview** (`src/ui/lockerPreview.js`): a live turntable of the player's captain —
  the real match GLB — wearing the equipped kit colour and cleat tint, on its own small
  WebGL canvas at the top of the Locker. Re-renders on every equip, so a kit or cleat change
  is seen the second it's tapped. Cleat/uniform chips show a large colour swatch.
- **Locker copy** says what each item does in play; the menu card counts the catalog
  dynamically (no hardcoded `/17`).

### 2d. Seven new special kicks (pack k, §8)

| id | clip (source FBX) | name | mods | unlock |
|---|---|---|---|---|
| kick-martelo | kickMartelo (Martelo Do Chau) | MARTELO | power ×1.40, loft +6° | 20 career runs |
| kick-armada | kickArmada (Armada To Esquiva) | ARMADA | power ×1.38, curl ×1.3 | 5 games played |
| kick-scissor | kickScissor (Scissor Kick) | SCISSOR KICK | power ×1.40, speed ×1.1 | 10 career wins |
| kick-punt | kickPunt (Kicking 1) | STREET PUNT | power ×1.35, loft +12° | 10 PERFECT kicks |
| kick-flip | kickFlip (Flip Kick) | FLIP KICK | power ×1.42, curl ×−1.3 | 3 wins by 5+ |
| kick-bicycle | kickBicycle (Flying Bicycle Kick) | BICYCLE KICK | power ×1.48, loft +8° | 50 career runs |
| kick-kipup | kickKipUp (Inverted Double Kick To Kip Up) | KIP-UP DOUBLE | power ×1.50 | 25 career HR |

Two new career counters feed these: `games` (+1 per finished match) and `perfects`
(PERFECT-judged kicks by the player). The four re-uploaded kicks (Kicking, Inside Crescent,
Hurricane, Spin Flip) are already shipped as `kickBlast/kickCrescent/kickHurricane/
kickSpinFlip` — skipped.

### 2e. Taunts (pack k, §8) — the walk-up move

New Locker category **TAUNTS** with an equip slot `taunt`:

| id | clip (source FBX) | name | unlock |
|---|---|---|---|
| taunt-point | tauntPoint (Taunt) | THE POINT | stock — everyone owns it |
| taunt-cry | tauntCry (Standing Taunt Battlecry) | BATTLE CRY | 1 win |
| taunt-chest | tauntChest (Standing Taunt Chest Thump) | CHEST THUMP | 5 career HR |
| taunt-gesture | tauntGesture (Taunt Gesture) | COME AT ME | 10 games played |
| taunt-loser | tauntLoser (Loser) | THE L | 3 crews beaten |

`stock: true` items are always owned and are the slot's default when nothing is equipped.
CPU kickers draw a random taunt from all five.

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
| crown-tick | each crown-meter gain (rising ping) |
| crown-arm | POWER KICK armed |
| countdown | trace-timer / pitch-clock beep |
| unlock | unlock toast chime |
| stomp | footsteps bed under the kicker's walk-up |
| cheer-big | HR + walk-off layer (bigger than crowd-cheer) |
| boo | your out with runners on / opponent scores / a CPU kicker's taunt |

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
  the minting beat, which keeps `bassdrop`); `countdown` on the last three trace-timer
  tenths; `stomp` under the walk-up; `cheer-big` on homers and walk-offs; `boo` on your out
  with runners on, on a CPU run, and on a CPU taunt; `crowd-cheer` on your taunt.
- `screens.js`: `unlock` on each unlock toast row.
- All new names in `FILES.sfx` + `SFX_ALIAS` with gains, and in `warm()`.

## 4. Pre-game: splash cards only (the lineup show is gone)

The client doesn't want the choreographed number, and the dev chose walk-ups over a team
lineup. Match start becomes: `STARTING LINEUPS` stamp + `lineups` VO → away team splash
(1.9 s) → home team splash (1.9 s) → the existing GAME TIME break (scratch → music stop →
stamp → PLAY BALL VO → match beat). ≈ 5.5 s, SKIP chip kept.

**Deleted:** the wedge choreography, `walkoutRoutines.js` + its test, the 5-shot table, the
legacy star parade, star cards at match start, the extras-pack gate in `lineupIntro`
(`loadExtrasFor` still runs in the background for HR dances and pack k).

## 5. HR dance every time, never the same twice

`cine:crowned` already fires for both sides; every homer dances at the plate. Change the
pick:

- New `DanceBag` in `src/game/animExtras.js`: shuffled list of all loaded dance clip names
  (up to 14: `dance1–4` + the 10 extras), drawn without replacement; on empty, reshuffle
  with the constraint that the first draw ≠ the last one played. Seeded from
  `save.dance.recent` (last 4 played, persisted via `SaveManager`) so the first HR of the
  next match is fresh too. The bag learns new names as extras land.
- `director.crowned()` uses the dance the scene drew. Victory lap and stolen-home
  celebrations keep `pickDances`/`pickDance`.

## 6. Runner indicators

Nothing directional exists today (text banners + a 3-pip occupancy diamond); runners are
off-frame during ball-flight / crane shots, on defense, and every trailing runner in the
`runners` shot.

### 6a. Edge arrows

- HUD layer `.runner-arrows` with up to 3 chips. Each frame, for every runner in
  `running`/`held`/stealing state: project the chest point; if it is outside the frame
  inset (24 px) or behind the camera, place a chip clamped to the inset rectangle along the
  ray from screen centre, arrow rotated to point at the runner, with jersey number and
  target base ("→2ND", "→HOME").
- Pure helper `edgeClamp({ x, y, w, h, inset, behind })` in `src/ui/runnerArrows.js`.
- Player's runners in the player's colour; CPU runners (when the player fields) in theirs.
  Pulse when `targetBase === 3` or stealing. Chip hides when the runner is in frame. Not
  shown during cinematics, the pre-game, or the walk-up.

### 6b. Live diamond

- Score-bug diamond grows to 44 × 30 px SVG: base pips + one dot per live runner that
  slides along the basepath from `r.sim.progressM / basePathM` between its from/to bases,
  in the runner's team colour; on a score the dot flashes at home and fades. Held runners
  sit on their pip. Updated every frame via `hud.setRunnerDots([...])`.

## 7. Kicker walk-up + taunt (every at-bat, both sides)

In `nextAtBat`, instead of appearing at the plate:

- The kicker starts 2.5 m camera-left of the plate (x −3.4), walks in on the `walk` clip at
  1.6 m/s (~1.5 s) with `stomp` under it; on arrival faces the camera and plays their taunt
  one-shot (~1.5 s, trimmed in the manifest), then squares to the mound in `plate`. Scene
  state `walkup = { char, phase: 'walk'|'taunt', until }`; a cleat ring in the cleat colour
  sits under the feet while `cleatHex` is set.
- The existing NOW KICKING mini card shows during the walk-up (with the YOUR GEAR strip for
  the player's kickers); `nowkicking` VO on side change is unchanged.
- Taunt choice: player's kicker → equipped taunt (stock THE POINT by default); CPU kicker →
  random from the five. Crowd: `crowd-cheer` for yours, `boo` for theirs.
- **Tap skips**: any tap during the walk-up snaps the kicker to the plate in `plate` and
  serves 0.3 s later. `serve()` is gated on the walk-up ending (replaces the fixed 1.4 s /
  1.2 s timers). No skip chip — tap anywhere, both roles.
- Missing clips (pack k not loaded yet): walk-up still plays; the taunt step is skipped.
- Drills / tutorial (`?drill`) skip the walk-up entirely.

## 8. Animation pack k (kicks + taunts)

- 12 new sources in `tools/anims-src/` (gitignored, like the rest). Manifest entries with
  `pack: 'k'`: 7 kicks (`loop:false, inPlace:true, rate 1.1, contactAt` from the bake tool's
  contact analyzer) and 5 taunts (`loop:false, inPlace:true, bakeHz:15, trim ≤ 1.8 s`).
- `tools/retarget.js` generalizes packs: `rig.packs[pack]` for every pack name in the
  manifest, export name `mocap-<pack>-<arch>.glb` (base stays `mocap-<arch>.glb`), auto mode
  exports every pack, the contact analyzer logs every pack with `contactAt`.
- `scripts/anim-upload-server.mjs` accepts `mocap(-[a-z])?-<arch>.glb`.
- `scripts/verify-anims.mjs` checks every pack (k budget 900 KB per archetype).
- `src/game/animExtras.js` `loadExtrasFor` fetches `mocap-x-` AND `mocap-k-` per archetype.
- `glbCharacters.js` `CLIPS` code-animator aliases: new kicks → `kick`, taunts → `idle`.
- `tests/animsManifest.test.js` accepts `pack ∈ {x, k}` for Locker kicks and requires every
  taunt clip.

## Testing & verification

- **First:** verify and commit the pending booth/sound/contact round (vitest +
  `scripts/booth-sound-e2e.mjs`) as its own commit so this round has a clean base.
- vitest: `edgeClamp` math; `DanceBag` (no immediate repeat, exhausts before repeating,
  save seeding); POWER KICK charge accounting (gear start, meter +1, consume, refund);
  cleat `speedMult` table; walk-up timeline helper; taunt pick (equipped vs stock vs CPU
  random); stock gear ownership + new counters; SFX alias/`warm` coverage; pre-game
  timeline.
- Bake QA: `node scripts/verify-anims.mjs` green for base, x and k across all 19 archetypes.
- Playwright harness (`scripts/round-e2e.mjs`): pre-game splash → GAME TIME, walk-up +
  taunt + tap-skip, POWER KICK charges lit/consumed, arrows for an off-frame runner, every
  SFX alias resolves, HR dance draws distinct clips, MSAA samples, Locker preview canvas
  renders.
- Real-play pass via claude-in-chrome per [verify-gameplay-by-real-play]: brightness/edges
  screenshots before vs after, walk-up + taunt on both sides, HR dance twice (different),
  power kick from gear, cleat trail + ring, arrows during a deep fly, sounds on taps, Locker
  preview changing on equip.
- Merge to main by PR; deploy only on the dev's explicit "push".

## Out of scope

Backdrop regeneration, new dance clips, new VO lines, the AO pass, any currency/shop, the
pickle duel, kick judging values (Addendum truth), a whole-team lineup show (dropped).

## Real-play pass results (2026-08-26, local dev via claude-in-chrome)

Harness: `http://localhost:5173/?match&nosplash[&nointro][&cleats=ff3b1f]` and
`?nosplash[&go=locker]`, Chrome, the app's own portrait letterbox (~410x790 CSS,
513x988 drawing buffer). Screenshots in
`.superpowers/sdd/2026-08-25-look-gear-sound-walkout-runners/playpass/`.

**How it was driven — read this before trusting any timing claim.** The automation
window is *occluded* (`document.visibilityState === 'hidden'`, `document.hasFocus()`
true), so Chrome froze `requestAnimationFrame` and the engine loop never ticked on its
own. **Every observation below is virtual-clock stepped; none is live-rAF.** Rather
than call `__skk.update()` in isolation, `requestAnimationFrame` and `performance.now`
were replaced with a queue + virtual clock so the renderer's *real* `loop()` ran — every
`engine.onFrame` callback, the shake/watchdog block and `composer.render()` — one
faithful frame at a time. Consequences worth knowing:

- **OS-level input never reached the page at all.** A `computer` click at the SKIP
  chip's own coordinates produced *no* event on a document-level capture listener for
  `pointerdown`/`mousedown`/`click`. Taps were therefore dispatched as DOM
  `PointerEvent`s on the real elements (hitting the real listeners) and kicks through
  the scene's real `onSwipe()`. **Hit-testing / touch-target geometry is NOT verified.**
- HUD teardown timers and CSS animations run on *real* time while the engine runs on the
  virtual clock, so `setTimeout` was stretched and `document.getAnimations()` frozen
  mid-animation to let screenshots land. A stamp lingering in two shots is that stretch,
  not a bug.
- Repeatedly forcing window resizes eventually lost the WebGL context and then tripped
  Chrome's "context could not be created — blocked" guard. Both are artifacts of this
  environment, not app faults; a fresh tab cleared them each time.

### 1. Edges + brightness — VERIFIED (measured, not just eyeballed)

Same frame, MSAA flipped in place with `engine.setSamples()` so the A/B is pixel-exact
(`?msaa=0` drives the same path; round-e2e asserts it). Read back off the drawing buffer
with `gl.readPixels` and scored: among "edge" pixels (3x3 luma range > 60), the share
sitting at a *blended* intermediate value rather than snapping to an extreme.

- **Character silhouette:** MSAA 4 = **35.1%** blended over 800 edge pixels; MSAA 0 =
  **22.0%** over 939. Repeated on a second load: 37.6% / 1381 vs 21.6% / 1730. MSAA is
  doing real geometric work — more blended pixels, *fewer* hard-stepped ones.
- **Fence / brownstone band:** 52.8% vs 50.7% — essentially no difference. That band's
  shimmer is *texture* aliasing (backdrop image + brick), which MSAA cannot touch. Honest
  read: MSAA smooths bodies, kit edges, the crown logo and the painted lines; it does not
  clean up the backdrop.
- The 7x crop `01c-msaa4-vs-msaa0-7x-kicker.jpg` shows it plainly: at MSAA 0 the jersey's
  right edge, the arm/torso boundary, the shorts hem and the logo's diagonals are visibly
  stair-stepped; at MSAA 4 they read smooth.
- **Brightness** (no "before" build to compare against, so absolute figures): whole-frame
  mean luma **144-150 / 255**, max **244**, and **0.00%** of pixels blown to white. Faces
  and kits read bright and legible in the sunset field light with real highlight headroom
  left — nothing is clipped.
- Screens: `01a-plate-msaa4-default.jpg`, `01b-plate-msaa0.jpg`,
  `01c-msaa4-vs-msaa0-7x-kicker.jpg`.

### 2. Pre-game — VERIFIED end to end

The timeline fired exactly as `pregameTimeline()` specifies: **STARTING LINEUPS** stamp at
t≈0.2s with `vo:lineups` → **away crest** (BALTIMORE / MONARCHS,
`assets/logos/monarchs.png`) → **home crest** (NEW YORK / SNAPPERS) → cleanup at t≈4.3s
firing `sfx:scratch`, `music stop`, `sfx:crowd-cheer`, the **GAME TIME!** stamp and
`vo:gametime` → letterbox off, `cinematicLock` released → `phase: SETUP`, walk-up starts,
`vo:playball`, `sfx:stomp`. The empty-stage invariant held (all characters hidden through
the splashes).

- **Stray tap is inert:** three `onTap()` calls at different points during the splash left
  `walkoutActive` and `cinematicLock` both `true` — the show was not eaten.
- **SKIP chip works:** a `pointerdown` on the real chip gave `sfx:ui-tap`,
  `walkoutActive:false`, splash and chip removed, GAME TIME! stamp + `scratch` +
  `crowd-cheer` + `vo:gametime` immediately, then the first walk-up 2s later. The chip's
  handler is `pointerdown` (hud.js:285), so it is a deliberate press, not a stray tap.
- Screens: `02a-pregame-starting-lineups.jpg`, `02b-pregame-away-crest-monarchs.jpg`,
  `02c-pregame-home-crest-snappers.jpg`, `02d-pregame-game-time.jpg`.

### 3. Walk-up + taunt — VERIFIED both sides

- **Player:** the kicker spawns at `x=-3.4` and walks in to the plate at `x=-0.9`
  (`sfx:stomp` at the off), squares up, and the **NOW KICKING** card shows
  "KING REESE / #23 · CAPTAIN / PWR / ARM" plus the gear line. Entering the taunt at the
  plate fired `sfx:crowd-cheer`. Stock taunt picked = `tauntPoint`; with BATTLE CRY
  equipped it picked `tauntCry`.
- **CPU** (forced `playerSide='home'`): `isPlayer:false`, taunt randomly drawn = `tauntCry`
  (not the stock pick), and the taunt fired **`sfx:boo`**. Its NOW KICKING card correctly
  carries **no** YOUR GEAR line.
- **Tap-skip:** `onTap()` during a walk-up runs `endWalkup(true)` and serves after
  `WALKUP.serveDelayS`; verified by that code path plus the pre-game skip above (a DOM tap
  on the play surface, not an OS touch).
- Screens: `03a-walkup-walking-in.jpg`, `03b-walkup-taunt-player.jpg`,
  `03c-walkup-taunt-cpu-boo.jpg`.

### 4. HR dance — VERIFIED, six in a row, all different

`homer()` on six consecutive live at-bats (resetting `hrFired` each time) drew
**`thriller1 → thriller2 → danceLock → dance2 → dance1 → danceSilly`** — six distinct
clips, no repeat. The dancer stood alone at the plate (0, 0) with the clip playing while
the rest of the stage stayed clear. Every homer stamped **CROWNED!** and fired
`sfx: homer, cheer-big, crowd-cheer, crown-tick, bassdrop` with
`vo: {event:'crowned', gender:'he'}`. `danceBag.recent` persisted to
`localStorage['skk-save-v1']['dance.recent']` between draws.

- Screens: `04a-hr-dance-1-crowned.jpg`, `04b-hr-dance-2-different.jpg`.

### 5. POWER KICK — VERIFIED lit → armed → spent

With MARTELO equipped (`power.gear` set from the real catalog entry):

- **Lit:** button class `special-btn ready`, label **"MARTELO x2"** — the kick's name and
  its charge count, exactly as `hudState()` renders it.
- **Armed:** a `pointerdown` on the real button gave `sfx: ui-tap, crown-arm`, class became
  `special-btn ready armed`, the button turned **solid gold**, and the hint bar read
  **"MARTELO ARMED — LET IT RIP"**. Charges stayed at 2 (spent at launch, not at arm).
- **Spent:** the armed kick fired `sfx: bassdrop, swing, kick`, **charges 2 → 1**, and
  **`cine:special` fired with `label: "MARTELO"`**. A whiff while armed did *not* burn a
  charge (stayed 2, stayed armed) — the refund rule holds.
- Charges also minted from play: two homers filled the crown meter and the button read
  "CROWN KICK x2" with no gear equipped.
- Screens: `05a-power-kick-armed-martelo.jpg`.

### 6. Cleats + gear strip — MOSTLY VERIFIED (one real gap)

With FIRE REDS equipped and `?cleats=ff3b1f` tinting the away squad:

- **Cleat ring:** visible during the player's walk-up only, tracking the kicker's feet
  frame by frame (`cleatRing.visible === true`, position following `x`), and hidden again
  once he squares up. It reads as a bright red ring on the dirt.
- **YOUR GEAR strip:** the NOW KICKING card shows
  **"YOUR GEAR — MARTELO · FIRE REDS · BLACKOUT KIT"**, and the same string appears as the
  one-shot gear toast banner. The CPU's card has no such line.
- **Trail:** the pool allocated 4 `SpeedTrail` ribbons in `#ff3b1f` and one was correctly
  assigned to the player's runner (`r.trail` set, `busy: true`). The ribbon renders as
  designed — a tapering additive red-orange streak at ground level. **But see the gap: I
  never caught it behind an actually sprinting runner.**
- **Black kit on the field: NOT verified** — the `?match` harness builds the away squad
  without the uniform hex, so the kit stayed Monarchs yellow. BLACKOUT KIT is verified on
  the Locker turntable instead (item 9).
- Screens: `06a-gear-walkup-cleat-ring-gearstrip.jpg`, `06b-cleat-trail-ribbon.jpg`,
  `06c-cleat-trail-ribbon-3x.jpg`.

### 7. Runners — VERIFIED

Both from a real kicked ball in play and from a staged runner:

- **Edge chip:** one gold chip pinned to the screen edge reading **`➤ #88 → 1ST`** /
  **`➤ #7 → 2ND`** / **`➤ #7 ON 1ST`** for a held runner — number, arrow and destination
  bag, clamped on-screen rather than projected off it.
- **Live diamond:** the score bug's diamond carried a lit runner dot sitting on the
  first-base corner of the basepath, alongside the out dots (one red) and the
  `MONA 0 / ▲1 / SNAP 0` line.
- Screens: `07a-runner-edge-arrow-and-diamond.jpg`, `07b-scorebug-diamond-dots-4x.jpg`.

### 8. Sounds — VERIFIED (24 distinct aliases heard in ordinary play)

`__bus.on('sfx', …)` across pre-game, walk-ups, kicks, fielding, outs and an inning flip:
`stomp, crowd-cheer, pitch, swing, kick, crush, whiff, bounce, catchpop, catch, throw,
slide, crowd-ooh, out, inning, boo, scratch, ui-tap, ui-confirm, crown-arm, crown-tick,
bassdrop, homer, cheer-big`. VO heard: `lineups, gametime, playball, nowkicking, crowned,
robbed, forced`. One full play chained
`swing → kick → bounce → catchpop → throw → catch → slide → crowd-ooh → boo → catchpop →
out → throw`. HUD presses are audible: the SKIP chip and the POWER KICK button both emit
`ui-tap`; a menu card emits `scratch`.

- **`foul` not heard live** — a POWER KICK did drive the scene to `phase: FOUL`, but I
  could not re-create a foul once the half flipped. It is wired at matchScene.js:1375, is
  in the alias table, and round-e2e asserts every alias resolves to a file on disk.

### 9. Locker — VERIFIED, preview changes on equip

- **Fresh save:** the menu card reads **`0/27 EARNED`**; the Locker caption reads
  **"KING REESE — STOCK KIT · STOCK CLEATS"**, the turntable rotates the captain in the
  Monarchs yellow kit with yellow stock cleats, and every special kick is locked with its
  hint ("20 CAREER RUNS", "10 CAREER WINS", …).
- **After granting the four items:** the menu card reads **`4/27 EARNED`**; the caption
  becomes **"KING REESE — BLACKOUT KIT · FIRE REDS"** and the turntable model visibly
  changes — **the kit reads black** (dark charcoal jersey replacing the yellow) and the
  cleats switch to the Fire Reds hex. The MARTELO chip lights as equipped, and BATTLE CRY
  / FIRE REDS / BLACKOUT KIT all show `on`.
- Honest nit: under the turntable's warm key light the FIRE REDS read dark
  **maroon/brown** rather than the bright red they show on the field. Worth a glance.
- Screens: `09a-menu-0of27-earned.jpg`, `09b-locker-stock-turntable.jpg`,
  `09b1-turntable-stock-2x.jpg`, `09c-locker-blackout-firereds-martelo.jpg`,
  `09c1-turntable-blackout-2x.jpg`.

### 10. Console — CLEAN

**Zero errors or exceptions** across the whole pass. Only warnings, all pre-existing
three.js / driver noise: `THREE.Clock: This module has been deprecated. Please use
THREE.Timer instead.`, `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated`, and
an HLSL `X4122 … cannot be represented accurately in double precision` shader-compile
warning. The `WebGL context could not be created … blocked` errors seen mid-session were
caused by this harness force-resizing the window, not by the game.

### Test suite

- `npm test` — **Test Files 41 passed (41) · Tests 235 passed (235)**
- `node scripts/verify-anims.mjs` — **checked 19 archetypes x 3 packs — ALL GOOD**
- `node scripts/booth-sound-e2e.mjs` — **ALL GREEN**
- `node scripts/round-e2e.mjs` — **ALL PASS**

### Gaps / not verified

- **Nothing was watched at live 60 fps.** The occluded window froze rAF; every frame was
  stepped on a virtual clock. Real-time feel, frame pacing, and the perf watchdog's MSAA
  drop are untested here.
- **Touch/click hit-testing.** OS-level input never reached the page, so taps were DOM
  `PointerEvent`s on the elements. Whether the SKIP chip, POWER KICK button and
  base-runner tap targets are actually *hittable with a thumb* is unverified — a phone
  check.
- **The real Locker → match gear flow.** The `?match` harness passes no gear, and the real
  flow gates on two intro videos that will not play in this stalled-rAF tab. Gear was
  applied to the live scene by re-running MatchScene's own constructor lines with catalog
  objects pulled from `/src/meta/unlocks.js` — faithful to the code, but it is injection,
  not the shipping path. `equippedGear(save)` itself was exercised only through the Locker.
- **The cleat trail behind a sprinting runner.** The ribbon only activates above
  `maxSpeedMs * 0.8` = 6.64 m/s and I never caught a runner there across ~15 at-bats; the
  ribbon in the screenshot was driven through `SpeedTrail.update()` directly. Whether it
  fires in ordinary play is **open** and should be the dev's first look on the phone.
- **The BLACKOUT KIT on the field** (Locker turntable only — see item 6).
- **`foul`, `score`, `safe`, `tag` SFX** not heard live (all wired and covered by
  round-e2e).
- **No "before" build** for the brightness claim — item 1 reports absolute values only.
- **No real device.** Everything here is desktop Chrome.

### Amendments as shipped

- **`WALKUP.tauntS` is a 1.9s cap, not a 1.5s play length** (the spec said ~1.5s). The
  taunt phase ends on the clip's own `onDone` or at the cap, whichever lands first;
  observed live, the taunt ended by `onDone` at ~1.77s, well inside the cap.
- **`kick-bicycle` is omitted from the GEAR catalog** — its source clip is a 0.67s
  fragment (`trim: [0, 0.66]` in `anims.manifest.json`, against a 0.879s `contactAt`, so
  contact falls *past the end of the clip*). Re-add when a full Flying Bicycle Kick lands;
  the bake entry stays in the manifest under the name `kickBicycle`.
- **UI blips were generated at 0.5s**, the ElevenLabs minimum — shorter was not available
  from the generator.
- **Three kicks cannot reach the 0.8s wind-up** their pack targets: **SCISSOR KICK at
  0.70s** and **FLIP KICK at 0.75s**, plus a third in the same sub-0.8s band — the
  manifest's shortest remaining k-pack `contactAt`s are `kickScissor` 0.35, `kickKipUp`
  0.372 and `kickFlip` 0.421 (post-retime, `rate: 1.1`). They kick correctly, just with a
  shorter tell than the pack's other moves.
- **No steals during the walk-up** (final review, 2026-08-26): the 3.5 s walk-up had opened a
  free, uncontested pre-pitch steal (a runner covers the bag in ~1.8 s and nothing races
  the throw until the pitch resolves). `stealAllowed()` in `walkup.js` refuses while a
  walk-up is live and the steal chips stay hidden until the kicker is set at the plate.
- **Speed-trail threshold 0.6×maxSpeedMs** (spec said 80 %): the 80 % mark was never reached
  in fifteen at-bats of the real-play pass, so the cleat payoff would not have been SEEN.
- **Crown-meter `score` feed** was registered on the constructor's `MatchEngine`, which
  `startMatch` replaces — runs never fed the meter (pre-existing). Moved into `startMatch`.

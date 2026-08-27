# Locker Rebuild, GEAR UP, Walk-up Camera & Kick Contact — Design

**Date:** 2026-08-27
**Source:** dev phone check after the 2026-08-25 round (PR #104): players must be able to
customize the character with what they've unlocked and SEE it on the player in the Locker
preview; the Locker is one long menu (kicks, then apparel below) — put it in sections so it's
easy to navigate and changes show immediately as you tap; bring the Locker up before the game
starts so people know they have options; make one thing totally free at the start so people
see the unlock system exists; the new kicks must be timed so the kick actually hits the ball;
the walk-up should be more cinematic — a camera change that highlights the player walking to
the plate.

Decisions taken with the dev: free starter gear = FIRE REDS cleats + THE FLAIR kick; a GEAR UP
screen after team select every game (one-tap PLAY); walk-up camera = side dolly → taunt
close-up → hard cut to the kick cam.

Design law unchanged: every feature must be SEEN / UNDERSTOOD / FELT on a phone.

## 1. Kicks actually hit the ball

**Root cause (found in the code map):** `attemptKick` plays the kick clip and creates the
ball's approach glide, both advanced on *scaled* `dt` — and the director drops
`engine.timeScale` to 0.3 for the kick beat *before* they start. The launch fallback
`this.after(holdS + 0.35, launchNow)` ticks on *unscaled* `rawDt`. So the fallback fires at
`holdS + 0.35` real seconds while the clip's contact frame arrives at `holdS / 0.3` real
seconds: for every special kick (holdS 0.54–0.67 s) the ball launches at ~46 % of the glide
with the foot nowhere near it; the base `kick` (holdS 0.185 s) only just gets away with it.
Second cause: `kickFootPos()` hard-codes the RIGHT foot; Armada, Scissor, Flip, Meia Lua and
Kip-Up strike with the left.

- **Fallback in the clip's clock.** `attemptKick` schedules the safety launch at
  `holdS / max(0.05, engine.timeScale) + 0.35` real seconds (helper
  `safetyLaunchDelayS(holdS, timeScale)` in `src/game/kickTiming.js`, pure, tested). The
  clip's `onContact` remains the primary trigger; the fallback only rescues a swallowed
  callback.
- **Striking foot per clip.** `tools/retarget.js`'s analyzer already measures both toes'
  peak speed; the bake logs `FOOT <clip> L|R` and the manifest gains `foot: 'L' | 'R'` on
  every kick entry (base `kick` = R; pack x/k values from the analyzer). `kickFootPos()`
  reads `META.get(clip).foot` (default R) and looks up `LeftFoot|LeftToe` / `RightFoot|
  RightToe` accordingly. The approach glide therefore lands the ball on the foot that
  swings.
- **AI kicks** keep the base clip (unchanged), but `servePitch` reads the wind-up from the
  clip it will actually play (no behaviour change today; correct if CPU specials ever ship).
- Tests: `safetyLaunchDelayS` (at timeScale 1 → `holdS + 0.35`; at 0.3 → `holdS / 0.3 +
  0.35`, always ≥ the clip's real contact time); manifest test — every `cat: 'kick'` clip
  has `foot ∈ {L, R}`; a `kickFootPos` bone-name test on a fake skeleton.

## 2. Cinematic walk-up

Two named shots in `cameraDirector.js`, driven through the existing director so the
input-critical `kick` shot is restored by the normal `camTarget` branch:

| phase | shot | framing |
|---|---|---|
| walk (1.56 s) | `walkupDolly` | low (y 1.1) side-tracking shot on the third-base side of the kicker: `pos = kicker + (−2.6, 1.1, +1.4)`, `look = kicker chest + 1.2 m ahead along the walk`, `fovScale 0.8`, hard `cut` on the first frame, `stiffness 40` so it tracks tight |
| taunt (≤ 1.9 s) | `walkupTaunt` | front push-in at chest height from the camera side: starts `pos = plate + (0.9, 1.35, 3.2)` and eases to `+2.4` over the taunt, `look = kicker chest`, `fovScale 0.7`, hard `cut` at the phase change |
| squared up | `kick` / `pitchSelect` | existing shots, hard `cut` when the walk-up ends (natural end or tap-skip) |

`update()` requests `walkupDolly` / `walkupTaunt` while `this.walkup` is set (the
`camCtx()` gains `walkupPhase`, `walkDir`); `endWalkup` issues the cut back. Runner arrows
stay gated off during the walk-up. CPU kickers get the same package. The NOW KICKING card
timing is unchanged.

## 3. The Locker, rebuilt (`src/ui/screens/lockerScreen.js` + `src/ui/lockerPreview.js`)

- **Layout (portrait):** turntable pinned at the top (~42 % of the height, caption under
  it), a **tab bar** — KICKS · TAUNTS · CLEATS · KITS — and ONE section on screen at a time:
  its chips in a horizontally scrollable row (owned first, then locked). Each tab shows an
  "N owned" pill. The screen never scrolls vertically past the tabs.
- **One persistent preview.** `LockerScreen` keeps a single `LockerPreview` for its
  lifetime; equipping re-renders in place via `preview.show({ team, uniformHex, gear })`
  (token-guarded; the GLB is cached so this is a clone + recolour) — no router remount.
  `unmount()` destroys it (`forceContextLoss` stays).
- **Instant preview of moves.** `buildCaptainPreview` loads the base pack AND packs x/k for
  the captain (background, `addClips`); tapping an owned **kick** or **taunt** chip equips
  it and plays that clip on the turntable (one-shot, returns to `idle`), so the move is
  seen before it's used. Locked kick/taunt chips show the unlock hint and do not play.
- **Kits/cleats:** tapping re-tints immediately; the chip just tapped pulses (`.just`).
- The caption reads the full loadout (`gearLine`) plus "FREE" on stock items. The career
  strip stays at the bottom, out of the way.
- The menu's THE LOCKER card and the pre-game GEAR UP both mount this component.

## 4. GEAR UP before every game

- `TeamSelectScreen`'s START routes to a new `gearUp` screen with `{ away, home, kits }` as
  router params instead of calling `startMatchFlow` directly.
- `GearUpScreen` = the rebuilt Locker component in **pre-game mode**: title "GEAR UP",
  subtitle "what you're taking to the block", the turntable + tabs, and one big **PLAY**
  button (no MAIN MENU); a small BACK link returns to team select. PLAY calls
  `ctx.startMatchFlow(away, home, kits)` — which already reads `equippedGear(save)` after
  this point, so nothing else changes.
- The preview uses `away` (the player's team) so the captain shown is the one they field.

## 5. Free starter gear

- `kick-flair` and `cleats-fire` become `stock: true` in the catalog (`unlock: null`, hint
  "FREE · yours from day one"). Stock items are always owned and are the slot's default
  when nothing is equipped (`equippedGear` already does this for taunts) — so a fresh save
  fields FIRE REDS + THE FLAIR (POWER KICK ×2) with no action from the player.
- **First-run callout:** the first time GEAR UP mounts (save key `gearSeen` false), a
  "FREE — YOUR STARTER GEAR" banner sits over the turntable for 3 s, the CLEATS tab is
  selected and the Fire Reds chip pulses; then `gearSeen = true`.
- The menu counter counts non-stock items only (earned/25).

## Testing & verification

- vitest: `safetyLaunchDelayS`; manifest `foot` coverage; `kickFootPos` bone selection;
  `stock` fallback for kick/cleats (`equippedGear` on an empty save returns Flair + Fire
  Reds); `gearUp` params → `startMatchFlow` args (pure screen helper); walk-up shot
  functions (`walkupDolly`/`walkupTaunt` return the documented offsets); locker tab model
  (pure: sections, owned-first ordering, "N owned").
- Playwright harness (`scripts/round-e2e.mjs`) gains: GEAR UP appears after team select and
  PLAY starts the flow; Locker tabs switch sections without a remount (same canvas element
  survives an equip); a special kick launches at the clip's contact frame (the ball's glide
  reaches ≥ 95 % before launch); walk-up camera moves off the kick shot and is back on it
  at the first pitch.
- Real-play pass in Chrome per [verify-gameplay-by-real-play]: Flair kick meets the ball;
  a left-foot kick (Armada) meets the ball; walk-up dolly + taunt close-up; Locker tabs +
  instant preview; GEAR UP flow; first-run callout on a cleared save.
- PR to main; deploy only on the dev's explicit "push".

## Out of scope

New clips, kick power/mod tuning, the career strip, a kit designer, CPU special kicks.

## Real-play pass results (2026-08-27)

Chrome via claude-in-chrome, local dev on `:5173`, the app's own portrait letterbox
(~390x750 CSS inside a 1536x791 window). Screenshots in
`.superpowers/sdd/2026-08-27-locker-gearup-walkup-cam/playpass/`.

**How it was driven — read this before trusting any timing claim.** The automation window
is occluded (`document.visibilityState === 'hidden'`), so Chrome froze `requestAnimationFrame`
— measured **0 rAF callbacks in 1 s**. Every engine observation below is **virtual-clock
stepped, none is live-rAF**: `requestAnimationFrame` and `performance.now` were replaced with
a queue + virtual clock so the renderer's *real* `loop()` ran one faithful frame at a time
(every `engine.onFrame` callback, the shake block, `composer.render()`). Consequences:

- **OS-level input is unreliable here.** An explicit `left_click` on START MATCH produced
  nothing (`.locker-screen.gear-up` never appeared), yet stray equips *did* land in the save
  at other moments. Every tap reported below was therefore dispatched as a DOM `PointerEvent`
  on the real element, hitting the real listener. **Thumb hit-testing / touch-target geometry
  is NOT verified** — a phone check.
- `setTimeout` runs on real time while the engine runs on the virtual clock. For the GEAR UP
  callout, delays >= 1 s were stretched x100 so the 3 s auto-hide survived the screenshot
  round-trip; the banner in the shot is the real one, not a re-shown one.
- `LockerPreview` has **no rAF safety pump** (the renderer has one), so when its constructor
  ran before the clock patch its loop was dead and had to be pumped by hand. That is an
  artifact of this environment — a real phone never freezes rAF — but it is worth knowing that
  one dropped rAF would stop the turntable for good.
- The perf watchdog dropped MSAA 4 -> 2 during the pass. Expected: the virtual clock feeds it
  fat frames.

### 1. THE FLAIR meets the ball — VERIFIED (virtual clock)

`?match&nosplash&nointro`, `power.gear` = THE FLAIR, armed through the real `.special-btn`
(label read `THE FLAIR x1`), released at `pitchArrival` so the judge scored PERFECT.

- **Base kick** (no crown): clip `kick`, wind-up 0.185 s, launch at approach **0.948**,
  ball-to-striking-foot **0.141 m** on the frame before launch, `engine.timeScale` 0.30 (the
  slow-mo beat was live). `04-base-kick-contact.jpg` — the boot is *on* the ball.
- **THE FLAIR**: clip `kickFlair` (manifest foot `R`), wind-up 0.331 s, launch at approach
  **0.952**, ball-to-foot **0.186 m**, quality PERFECT. `05-flair-contact.jpg` — the dive
  kick's boot and the ball are in the same place, crown lit gold carrying the move's name.

### 2. ARMADA meets the ball with the LEFT foot — VERIFIED (virtual clock)

Clip `kickArmada` (manifest foot `L`), wind-up 0.665 s, launch at approach **0.955**.
Measured on that frame: ball -> **LeftFoot 0.155 m**, ball -> RightFoot **0.980 m**, and
`kickFootPos()` resolved to the left bone. `06-armada-left-foot-contact.jpg` shows the
inverted capoeira boot on the ball with the impact flash.
**MEIA LUA BACK** was run the same way as a second left-footer: `kickMeiaBack`, wind-up
**0.819 s**, launch at approach **0.952**, ball -> LeftFoot 0.151 m vs RightFoot 0.617 m; the
play resolved into a run with no stall.

### 3. Walk-up camera — VERIFIED (virtual clock), the cut included

One at-bat, frame by frame:

- **walk** — shot `walkupDolly`, camera `(-2.82, 1.10, 3.20)` against a kicker at
  `x -1.75, z 0.40`: exactly `kicker.z + 2.8`, low and to the side, `fov 59.2` (0.8x of the
  74 base). `01-walkup-dolly-midwalk.jpg` — he is walking in profile with the plate ahead.
- **taunt** — shot `walkupTaunt`, camera `(0, 1.35, 3.57)` easing in, `fov 51.8` (0.7x), clip
  `tauntPoint`, kicker squared to the lens at the plate. `02-walkup-taunt-pushin.jpg`.
- **the cut** — ONE frame at t = 3.27 s: `walkupTaunt -> kick`, camera snapping to
  `(0.000, 3.400, 8.000)` and fov back to 74, kicker on `plate`. No glide, no settle.
  `03-cut-back-to-kick-cam.jpg` is the ordinary kick framing with the pitch already on its way.

### 4. GEAR UP — VERIFIED end to end (live DOM, virtual clock for the turntable)

Save cleared to `{ tutorialPlayed: true }` (no `gearSeen`), `?nosplash&go=teamSelect`.

- START MATCH -> `.locker-screen.gear-up`, title **GEAR UP**, subtitle "what you're taking to
  the block", **PLAY / ROLL OUT** + **&larr; TEAMS**, and no MAIN MENU.
- **First-run callout**: the **FREE — YOUR STARTER GEAR** banner sits over the turntable, the
  **CLEATS** tab is selected (`CLEATS 1/6`), the FIRE REDS chip carries `.just`, the caption
  reads `KING REESE — THE FLAIR · FIRE REDS · STOCK KIT`, and `gearSeen` is now `true`.
  `08-gearup-first-run-free-callout.jpg`.
- **&larr; TEAMS** -> `.matchup-screen` back. **START MATCH** again -> GEAR UP with the callout
  gone and the default **KICKS** tab. The career strip is `display: none` in gear-up mode (the
  Task 4 fix), so PLAY keeps its row.
- **PLAY** -> the Locker is gone from the DOM in the same tick and the real flow is running:
  `intro-monarchs.mp4` playing with TAP TO SKIP. `09-play-into-intro-video.jpg`.

### 5. THE LOCKER — VERIFIED (virtual clock for the turntable, live DOM for the taps)

`?nosplash&go=locker` with `kit-blackout`, `cleats-ice`, `cleats-black`, `taunt-cry` and
`kick-armada` unlocked.

- Four tabs, counts **KICKS 2/14 · TAUNTS 2/5 · CLEATS 3/6 · KITS 1/3** — stock items counted
  as owned. `10-locker-kicks-tab.jpg`.
- **Instant, same-canvas equips.** The `canvas.locker-preview` node was stamped and re-checked
  after every equip: **the same node throughout**. CLEATS -> ICE KICKS repainted the boots and
  the caption in the same frame (`… · ICE KICKS · STOCK KIT`), chip `.on` + `.just`
  (`11-locker-cleats-ice-kicks.jpg`); KITS -> BLACKOUT KIT put the dark kit on the captain
  (`12-locker-blackout-kit-dark-chip.jpg`).
- **`.locker-chip.on.dark`** works: the BLACKOUT KIT chip is painted `rgb(27,27,34)` — its own
  colour — with a **gold** label (`rgb(245,179,18)`) and a gold border instead of the near-black
  ink it would otherwise inherit.
- **Moves play on the turntable.** TAUNTS -> BATTLE CRY: `playMove('tauntCry')` returned true,
  the preview's animator name became `tauntCry`, `spinning` went false and the captain squared
  to yaw 0 — the move is performed INTO the lens. `13-locker-taunt-battle-cry-playing.jpg` is
  mid-clip. (Read through a temporary hook on `LockerPreview.prototype`; nothing shipped was
  changed.)

### 6. Console — CLEAN

Zero errors and zero exceptions across the whole pass. The only output was the pre-existing
`THREE.Clock` and `THREE.WebGLShadowMap: PCFSoftShadowMap` deprecation warnings, the
`match harness: you KICK first` log, and `[skk] msaa samples -> 2` from the perf watchdog.

### Bug found (pre-existing, NOT fixed this round)

**Cool and neutral cleat colours do not survive the tint.** `applyCleatVertexTint`
(`glbCharacters.js`) writes the cleat hex into a vertex-colour attribute that **multiplies**
over the baked shoe texels, so the result is `warmBakedShoe x tint` and a channel the bake
lacks cannot come back. Measured off the Locker turntable (`?e2e`, `gl.readPixels`, most
saturated pixel in the boot band):

| cleat | catalog hex | rendered boot |
|---|---|---|
| FIRE REDS | `#ff3b1f` | `(160, 36, 6)` — right |
| ICE KICKS | `#7fe7ff` | `(159, 154, 27)` — yellow-olive, the blue is gone |
| BLACKOUTS | `#15151a` | `(70, 41, 0)` — dark warm brown, not neutral |

The *change* is instant and unmistakable (three cleats, three clearly different boots,
reproducible on a re-tap), which is what this round asked for — but two of the six cleats do
not read as the colour their chip and swatch promise. Shipped in the 2026-08-25 round, out of
scope here; the fix is a desaturate-then-replace step on the foot texels, not a multiply.

### Gaps / not verified

- **Nothing was watched at live 60 fps.** rAF was frozen; every frame was stepped. Real-time
  feel, frame pacing and the walk-up's *felt* length are untested here — phone check.
- **Touch/thumb hit-testing.** OS input did not reliably reach the page, so taps were DOM
  `PointerEvent`s on the elements. Whether the tab bar, the chip row's horizontal scroll and
  PLAY are comfortably hittable with a thumb is **open**.
- **No real device and no short phone.** Everything here is desktop Chrome at ~390x750 CSS.
  The 375x667 GEAR UP fit was verified by the Task 4 fix round through emulation, not on glass.
- **Zoomed crops came back black.** A second capture of the same frame returns an empty WebGL
  canvas in this occluded tab, so every contact claim rests on the full-frame screenshot plus
  the measured ball-to-bone distances, not on a magnified crop.
- **Kick contact was driven through `attemptKick` directly**, released at `pitchArrival` for a
  clean PERFECT. The real flick / `onUp` path (`risePx`/`durMs` off a live swipe) was not
  exercised in this pass — `booth-sound-e2e.mjs` scenario 5 covers it.
- **The gear the match actually fields.** `?match` passes no gear (the NOW KICKING card read
  `YOUR GEAR — STOCK KICK · STOCK CLEATS · STOCK KIT`), so the special kicks above were equipped
  by writing `power.gear`. The GEAR UP -> `startMatchFlow` -> `equippedGear(save)` path was
  verified up to the intro video, not through to a kick with equipped gear on the field.
- **The CPU walk-up camera** was verified in the harness (round-e2e scenario 14), not by eye here.
- Only two of the fourteen special kicks (ARMADA, MEIA LUA BACK) plus THE FLAIR and the base
  kick were kicked. The other eleven rest on the manifest test and `kickFootPos`.

### Amendments as shipped

- **Contact marks re-anchored** (commit `5d4bfe4`) after the Task 1 review: `kickHurricane`
  `contactAt` **0.527 -> 0.687** (at 0.527 the boot points straight BACKWARD, z -0.986; 0.687 is
  the forward extreme, z +0.936 — its toe orbits at a constant 13.2 u/s, so the speed-peak
  method carried no signal) and `kickMeiaBack` **0.55 -> 0.732** (at 0.55 both feet are still
  flat on the pavement, toe speed 1.1 u/s). Player-side wind-ups: hurricane 0.709 -> 0.924 s,
  meia-lua-back 0.800 -> 1.065 s.
- **`kickMeiaBack`'s wind-up is 1.065 s**, ~6 % past the 1.0 s guide, and it is accepted as is:
  `trim` is BAKED into the shipped GLBs (clip durations equal the manifest trim spans exactly),
  so tightening `trim[0]` is a no-op without re-exporting all 57 bakes. Measured again in this
  pass at 0.819 s of *player* wind-up (the 1.3x hot clip), launching at 0.952 — correct, just
  long. Re-export if it reads slow on the phone.
- **Tab owned-counts include stock items.** The plan's model excluded them; that read as
  `KICKS 0/14` on a fresh save with THE FLAIR sitting equipped at the top of the list — a lie
  the player can see. Owning a free item is still owning it.
- **`.locker-chip.on.dark`.** An equipped chip is painted in its own gear colour with `#0b0d12`
  ink; on BLACKOUT KIT (`#1b1b22`) and BLACKOUTS (`#15151a`) that made the one piece you ARE
  wearing the one you cannot read. Gear under 0.42 relative luma now gets a gold label and a
  gold border instead.
- **GEAR UP fits a short phone** (fix round after the Task 4 review, commit `b6133a4`): the
  turntable is `clamp(140px, 50vw, 240px)` x `clamp(150px, 34vh, 280px)` instead of a fixed
  `min(…, 280px)`, so it gives height back to the tabs, chips and PLAY; `.locker-screen` moved
  from `overflow: hidden` to `overflow-y: auto` as a safety net rather than a plan; and the
  lifetime career strip is hidden in gear-up mode — it is noise at the whistle and it costs the
  row PLAY needs. Verified at 375x667 and 390x844; the pre-fix build hid PLAY at <= 600 px tall.
- **`GearUpScreen` destroys its preview before PLAY** (commit `c1a92a0`): `startMatchFlow`
  replaces `#ui-root` itself instead of routing, so the router never calls `unmount()` and the
  turntable's WebGL context + rAF loop would have survived the whole intro (and leaked for good
  if anything threw before the coin toss).
- **`LockerPreview.destroy()` bumps the show token first** (commit `b6133a4`): a
  `buildCaptainPreview()` still in flight would otherwise resolve after teardown, pass the race
  guard and add a fully-loaded character to a scene nobody renders.
- **`walkupDolly`'s offset as shipped is `kicker + (-0.6, 1.1, +2.8)`, looking at
  `kicker + (1.0, 1.2, 0)`** - not the `(-2.6, 1.1, +1.4)` side-dolly in the SS2 shot table
  above. The plan's exact numbers (which the unit tests and the e2e harness both assert) won:
  the wide third-base offset framed the kicker against empty pavement, while a 2.8 m trail on
  the camera side keeps him large and reads as a follow. `walkupTaunt` shipped exactly as
  specced. `camCtx()` also never needed `walkupPhase` or `walkDir` - the phase gate lives in
  `matchScene.update()`, which picks the shot by name, and the dolly's look-ahead is a fixed
  `+1.0 x` offset rather than a walk-direction vector.

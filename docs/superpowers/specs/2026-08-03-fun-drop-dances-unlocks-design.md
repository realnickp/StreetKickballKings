# Fun Drop — Dances, Special Kicks, Unlockables, HR/Out Rework (2026-08-03)

Dev request via remote control 2026-08-03. Nine features, one round. Design law
from [fun-overhaul]: every feature must pass the phone-player test —
learn it / see it / feel it. Arcade-loud.

New source clips (19, copied to `tools/anims-src/`): Thriller Parts 1–4,
Locking/Tut/Wave/Step Hip Hop, Chicken Dance, Silly Dancing, Hip Hop Dancing,
Soccer Spin, and 8 kick moves (Flair, Hurricane Kick, Spin Flip Kick, Inside
Crescent Kick, Kicking, Meia Lua De Compasso, Meia Lua De Compasso Back, Leg
Sweep). Strike Foward Jog is already the shipped default `kick` clip.

## 0. Foundation — extras animation pack (everything depends on this)

- New manifest field `pack: 'x'` on the 19 new entries; `tools/retarget.js`
  bakes pack-x entries into a **separate** `public/assets/anims/mocap-x-<arch>.glb`
  per archetype. Base GLBs (1.35 MB each, eager-loaded) stay unchanged in size.
- New manifest field `bakeHz` (default 30): dances bake at 15 fps — half the
  size, imperceptible for dance moves. Kicks + soccerSpin stay 30 fps
  (contact timing).
- **Bake sanity fix in `tools/retarget.js`**: a retargeted `Hips.position`
  track that resolves to ~0 for the whole clip (the dance1/dance4/dejected/
  stumble defect — pelvis 1 m under the court) is floored to rest-pose Y.
  `inPlace` also gains Y-drift zeroing for dance clips. **Re-bake the base
  pack too** so dance1/dance4/dejected stop dancing waist-deep.
- `?auto=1` mode in retarget.js: bakes all requested archs sequentially and
  POSTs to the :5199 sink with no clicks (driven by Playwright/chrome).
- Runtime: `src/game/animExtras.js` — after teams are picked, background-fetch
  `mocap-x-<arch>.glb` for the archetypes actually in the match and merge into
  each character's `MocapAnimator` (`addClips()`, new method). Never blocks
  play. Every consumer has a fallback when extras aren't loaded yet:
  HR dance → dance1–4, walkout → legacy swagger intro, special kick → `kick`,
  soccerSpin → existing whirl rotation.
- Code-animator fallback aliases for all 19 names in `glbCharacters.js` CLIPS.

New clip names: `thriller1..4`, `danceLock`, `danceTut`, `danceWave`,
`danceChicken`, `danceStep`, `danceSilly`, `soccerSpin`, `kickFlair`,
`kickHurricane`, `kickSpinFlip`, `kickCrescent`, `kickBlast` (Kicking.fbx),
`kickMeia`, `kickMeiaBack`, `kickSweep`.

## 1. Home run — full rework, mandatory random dance (NO exceptions)

Kill `cut-crowned.mp4` (delete the video + its playback path). New all-in-engine
sequence in `director.crowned()`:

1. ~0.8 s: timeScale 0.5, crane hold as the ball sails; `hud.stamp('CROWNED!')`,
   vo `crowned`, crowd to 1.
2. Cut to home plate: kicker at the plate, `faceCam`, plays a **random dance
   from the full dance pool** — thriller1–4 + the 6 new dances + fixed
   dance1–4. Slow orbital cam ~3.2 s, crowd loop, shake beat. This dance is
   unconditional on every home run.
3. Cut straight to next play (same `cine:videoDone {kind:'crowned'}` path).
   Tap-to-skip enabled (the old video wasn't skippable; fast play wins).

Runners still resolve instantly (hidden); the kicker's dance IS the trot.

## 2. Caught out — robbed screen deleted, quick banner instead

- Delete the `cut-caught.mp4` branch from `director.robbed()`. Keep the 0.6 s
  slow-mo hold on the catch (shows WHO robbed you), then a single
  `hud.stamp(<line>, 'robbed')` sweeps across and play cuts on as today
  (finalize at +1.1 s). Net blocking time drops from ~video-length+0.8 s to
  ~1.4 s.
- Rotating creative lines, e.g.: `SNATCHED! SIT DOWN!`, `THE GLOVE SAID NO!`,
  `OUTTA THE SKY — YOU'RE OUT!`, `ROBBED BLIND!`, `CAUGHT IT. WALK IT OFF.`,
  `THAT BALL GOT MUGGED!`
- Tag-up race branch is untouched (already cutscene-free by design).
- Both MP4s (`cut-crowned`, `cut-caught`, 8.6 MB combined) removed from the
  payload.

## 3. Unlockables — THE LOCKER (earn as you play)

Persistence mirrors `trophies.js`: new headless `src/meta/unlocks.js` + tests.
Save keys: `career` (lifetime counters: wins, roadWins, hr, catches, pegs,
pickleEscapes, steals, crews), `gear.unlocked` (string ids), `gear.equip`
`{kick, cleats, uniform}`.

**Special kicks** (8) — used when the crown/special meter is armed (existing
`SpecialMeter` consume path). Equipped kick swaps the kick clip at the single
`play('kick')` call site and its modifier multiplies into the existing
`powerMult`:

| id | clip | flavor | unlock |
|---|---|---|---|
| flair | kickFlair | power ×1.45 | first home run |
| hurricane | kickHurricane | loft +10°, carry ×1.1 | 3 career HR |
| spinflip | kickSpinFlip | power ×1.4, aim spread +8° | 10 career HR |
| crescent | kickCrescent | curl range ×1.5 | 5 wins |
| blast | kickBlast | speed ×1.15 low liner (loft −8°) | 10 pegs/catches |
| meia | kickMeia | big curl + power ×1.35 | 3 road wins |
| meiaback | kickMeiaBack | reverse curl + ×1.35 | 5 pickle escapes |
| sweep | kickSweep | grounder speed ×1.25 | 15 career steals |

**Cleats** (6) — foot-region UV tint in `recolorKitTexture` (UV bbox of
verts weighted to Foot/ToeBase joints, cached per archetype): Fire Reds
(first win), Ice Kicks (first road win), Neon Volts (3 crews beaten), Royals
(5 crews), Blackouts (25 career runs), Gold Crowns (King of the Streets).

**Uniforms** (3 alternates) — kit recolor modes for the player's team:
Blackout kit (3 wins), Whiteout kit (win by 5+), Gold Rush kit (King).

UI: **LOCKER** screen from the menu (pattern of MapScreen trophy case):
category rows, locked items show silhouette + unlock hint, tap to equip.
Post-game: `UNLOCKED:` toasts on PostGameScreen. Career counters increment
from a per-match stats object matchScene already accumulates → passed on
`matchOver`.

## 4. Walkout — whole team, synced Thriller

Replace the 3-stars-one-at-a-time parade in `lineupIntro()` (extras-loaded
path; legacy flow is the fallback):

- All 8 away players visible at once in a staggered Thriller wedge
  (rows 3-3-2, captain on point), facing camera, **all playing thriller1 in
  frame-sync** (same `play()` frame, same rate, speedFactor pinned to 1 →
  choreographed). Formation drifts toward camera slowly; low wide dolly cam.
- Part switches on the beat: away side dances Parts 1→2, then team splash,
  then home side dances Parts 3→4. Walkout star cards keep cycling on top
  (the info layer stays). Thriller bakes are `inPlace` so the wedge holds.
- Total ≈ current ~20 s budget, tap-to-skip preserved.

## 5. Pickle — Soccer Spin + chaser un-burying

- Spin now plays the real `soccerSpin` clip on the runner (whirl-rotation
  fallback), and **it costs the defense**: chaser speed ×0.45 for 0.9 s
  ("falls behind"); if the holder is mid peg-windup, the windup restarts
  ("misses his timing"). Scene-side state; brain tuning untouched.
- Ground-sink fixes (root causes from the 2026-08-03 investigation):
  - Every bare `play('stumble')` on fielders routes through the existing
    `outStumble()` recovery ritual (tag-dodge at ~1580, dive whiff at ~3308,
    steal throwdown at ~1389).
  - `duelChase` guard gated on recovery state instead of clip name, so the
    chaser returns to `run`; `holder.group.position.y = 0` re-grounded every
    frame (parity with runners).
  - `MocapAnimator` hip floor: keep the higher floor during the 0.15 s
    crossfade out of `stumble`; dance-family clips get the 0.5×rest floor
    until the re-bake lands (belt and braces after it).
  - New `mocapAnimator` test with a realistic rest-Y rig asserting per-clip
    floors (current test rig has rest Y = 0 — zero coverage).

## 6. Foul ball kills the steal — scramble back, taggable

Today a stealing runner keeps the base on a foul. New rule: on FOUL with a
steal live, the steal dies — the runner reverses to his original base
(reusing the tag-up reversal mechanics: legs flipped, auto-run, taggable) and
the defense gets a quick tag window; safe the moment he's back on the bag.
Telegraph: `hud.call('FOUL! GET BACK!')` + runner alert. Player-side and
CPU-side both.

## 7. Dances across celebrations

- Scoring-at-home + steal-home celebrations draw from the full dance pool.
- Game end: before `matchOver` routes to postGame, ~2.8 s on-field party —
  every visible winner plays a different random dance, camera pulls wide,
  `hud.stamp('<WINNER> TAKE THE BLOCK!')`, then the box score. Skippable.

## Testing & verification

- vitest: `unlocks.test.js`, mocapAnimator floor test, spin-penalty duel test,
  foul-steal state test, manifest test extended for pack-x names.
- `scripts/verify-anims.mjs`: decodes every baked GLB, asserts clip presence,
  hips-floor sanity (no whole-clip ~0 tracks), and size budgets.
- Real-play pass via claude-in-chrome per [verify-gameplay-by-real-play]:
  walkout, HR dance, caught-out banner, pickle spin, foul-steal scramble.
- Merge to main by PR; deploy only on the dev's explicit "push".

## Out of scope

- New VO lines for these moments (existing crowned/robbed VO reused).
- Any currency/shop — unlocks are milestone-earned, winning stays the economy.
- Backdrop work (Pillar F owns it).

## Addendum — verification round + fix log (2026-08-03, post-build)

Full-branch double-check (four parallel verification agents, line-by-line spec
diff, every finding re-confirmed by direct read) before the real-play pass.
Everything below is either FIXED in code or recorded as the deliberate
as-shipped tuning where the code, not the tables above, is truth.

### Fixed this round
- **Foul-steal holes**: a stolen HOME now un-commits on a foul — the run comes
  off the board and the runner scrambles for 3rd, taggable (it used to stand on
  a dead ball). The 4th-foul dead ball reverts a committed steal before the
  books close (`revertStealBooks`, pure + tested). One steal per pitch, both
  sides — a second launch after a commit is blocked. Scramble arrivals can no
  longer write a 4th base slot into the 3-bag books.
- **Throwdown verdict is an ARRIVAL check** at ball-landing, tie to the runner —
  a man standing on his bag can never be "tagged out" by the old timing formula.
- **Scramble telegraph**: the runner alert now fires during the scramble
  ('SCRAMBLING BACK!', phase FOUL), and the foul count survives on the banner
  ('FOUL n/4 — GET BACK!' instead of two banners overwriting each other).
- **MocapAnimator**: a one-shot finishing mid-crossfade no longer fires the NEW
  clip's onDone (slide finishing was stomping soccerSpin a beat in); auto-slide
  now waits out the spin clip.
- **Chaser down-gate** keys on recovery state (self-healing if the ritual is
  superseded), not the clip name.
- **Spin penalty lives in PickleDuel** (headless): chaserSlowT 0.9 s + pegBroken,
  unit-tested — the spec's promised spin-penalty test now exists, as does the
  foul-steal state test (stealBooks) and a negative-runs engine test.
- **Locker**: stealing HOME counts toward Leg Sweep; Ice Kicks → 2 wins and
  Meia Lua → 3 wins (playerSide is hardcoded 'away', so "road wins" ≡ wins —
  the old conditions were redundant with Fire Reds/plain wins); Leg Sweep
  powerMult 1.3 → 1.35 (a special must never hit SOFTER than the stock crown
  kick — payoff must be felt).
- **Show**: the caught-out stamp is the teal ROBBED style (was red PEGGED,
  visually identical to a peg call); the HR dance happens AT THE PLATE (the
  camera cut hides the teleport); a skipped victory lap stops its camera
  callback (it fought CameraDirector for up to 2.8 s); every winner gets a
  DISTINCT dance (`pickDances` — repeats only start once the pool is on the
  floor); a skipped moment clears its stamp off live play.

### As-shipped tuning (deliberate deviations from the tables above)
- Special-kick mods REPLACE the stock 1.35 powerMult (no multiply-stack):
  flair 1.45, hurricane 1.38 + loft +10° (no separate carry mod), spinflip
  1.42 + curl ×1.2, blast speed ×1.12, sweep speed ×1.2 + loft −12°. The
  locker hints match the code.
- `defOuts` counts every out made while the player fields (tags and force outs
  too), not just pegs+catches — the hint says "10 outs in the field".
- Crowned beats run 0.7 s at 0.4× then a 3.4 s orbit (spec said 0.8/0.5/3.2).
- The walkout wedge is point + 2-3-2 (captain alone on point), not 3-3-2.
- `cine:videoDone` died with the videos; completion rides `cine:done` +
  finalizePlayHR's cinematicLock poll. Walk-off HRs now get the victory lap.
- The §5 belt-and-braces items (dance inPlace Y-zeroing in the baker, runtime
  dance-family floor) were superseded: the p90 hip re-anchor + full re-bake
  fixed the root cause and `scripts/verify-anims.mjs` guards every bake.

### Still open (needs the phone)
- Real-play pass per the house rule: walkout, HR dance, caught-out banner,
  pickle spin + penalty, foul-steal scramble (incl. a stolen-home foul), locker
  equip. Then PR to main; deploy only on the dev's explicit "push".

## Real-play pass results (2026-08-04, local dev via claude-in-chrome)

Driven frame-by-frame in real Chrome (hidden-tab rAF stall worked around with a
virtual clock stepping the REAL engine loop). Verified on screen:

- **Walkout**: splash → away wedge, all 8 frame-locked on thriller1 (one clip
  name across the squad), part switch to thriller2, Snappers splash, home
  thriller3→4, star cards + ticker cycling, clean handoff to first pitch.
- **HR**: organic fence-clear (sky flick, runner on 1st) → CROWNED! → dance at
  the plate (danceChicken/dance4 observed across runs, camera orbit) → both
  runs posted → instant next play.
- **Caught out**: real caught fly → 0.6 s slow-mo on the fielder → teal ROBBED
  banner "OUTTA THE SKY — YOU'RE OUT!" (`--burst #3ec6b5`) → quick resume.
- **Foul kills the steal**: live steal + foul → 'FOUL n/4 — GET BACK!' +
  MASH prompt → throwdown race → 'SAFE — BACK IN!', runner back on his bag.
- **Stolen HOME + foul**: STOLE HOME! posted (run +1, steal counted) → foul →
  run came OFF the board instantly, scramble raced, no gifted bag, 3-slot
  bases stayed legal, next at-bat clean.
- **Victory lap**: fireMatchOver → 8 winners, 8 DISTINCT dances (thriller +
  extras + base mix), 'MARYLAND MONARCHS TAKE THE BLOCK!', wide pull-back.
- **The Locker** (real flow `?nosplash&go=locker`): all 3 categories, 17
  locked chips with the FIXED hints (Ice Kicks = 2 wins, Meia Lua = 3 wins),
  career strip. Equip-tap untested (would write the dev's local save).
- **soccerSpin/extras clips** render standing (hips grounded — re-bake holds).

**New P0-class bug found AND fixed during the pass**: `MatchScene.update`
dereferenced `worldToScreen(ball.pos)` unguarded while the kick ring rode the
incoming pitch (`ringAt`); the class defined `worldToScreen` twice and the
winning version returns null once the ball slips behind the camera. The throw
landed ABOVE the TOO LATE branch, so the state machine could never leave the
pitch — a permanent per-frame throw = frozen game on a taken pitch (timing
race, explains intermittent phone freezes). Fixed: null-guard + hideRing, dead
duplicate method removed, regression-verified live (taken pitch now resolves).
Not verified live: pickle-duel spin penalty in an organic rundown (unit-tested
headlessly), walkout tap-to-skip, locker equip application in-match.

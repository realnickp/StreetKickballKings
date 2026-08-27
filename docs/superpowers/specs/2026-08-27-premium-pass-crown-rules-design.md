# Premium Pass + Crown Rules — Design

**Date:** 2026-08-27 (after PR #105 shipped)
**Source:** dev phone check: home runs are way too easy now; the crown must reset to zero every
time it's used and only build on offense (with a boost for holding the other side scoreless);
the break-dance kick releases the ball too early — the ball should fly once the motion is
finished; the NOW KICKING card is too big, boxy, intrusive, covers the walk-up and "looks vibe
coded"; runner indicators should be a moving icon, not a labelled chip, and must never be cut
off at the screen edge; every fielder should face the ball wherever it is / is coming from; the
camera sometimes films the kicker from behind the fence at contact; and a full display pass —
"everything needs to look premium and feel like PlayStation 3/4, fewer boxes, more video game,
less vibe-coded web app."

Decisions taken with the dev: one crown, offense-only, resets on use, the equipped Locker kick
is the crown swing's look/power (no separate charges); holding the opponent scoreless for a
half = +25; look = PS4 broadcast-clean base with graffiti accents where they make sense.

Design law unchanged: SEEN / UNDERSTOOD / FELT on a phone.

## 1. Crown rules (why homers were easy)

Today: an equipped kick = 2 POWER KICK charges per game, each consumed swing sets
`kickWasSpecial`, and the CROWN GUARANTEE floors the arc to clear the fence for any swing
within ±270 ms; the meter also fills from fielding (`peg`, `catch`) and mints more charges.

- **`Crown` replaces `PowerKicks`** (`src/game/crown.js`): one meter 0–100, `feed(event)`
  (offense events only: `hit 20, run 25, steal 15, PERFECT 35, homerun 40, pickleEscape 60`),
  `ready` at 100, `arm()` only when ready, `consume()` returns `{ gear, powerMult, label }`
  and **resets the meter to 0**. No charges; no minting.
- **Feeds are offense-only.** The `peg`/`catch` feeds are removed; `pickleEscape` gains the
  `kickingIsPlayer()` guard.
- **Shutout bonus:** the scene snapshots the score at every half start; on `halfEnd`, if the
  player was fielding and the opponent scored 0 in that half → `crownFeed('shutout')`
  (tuning `special.gain.shutout: 25`) with the callout `SHUTOUT! +25 CROWN`.
- **The equipped kick is the crown swing.** When the crown is consumed the equipped Locker
  kick's clip and mods play (as today's special path); with no gear, the stock crown kick.
  The CROWN GUARANTEE stays exactly as is, but it is now reachable once per full meter.
- **HUD:** the 👑 button shows the fill ring and lights only at 100; label under it reads
  `CROWN` while filling and the kick's name (`THE FLAIR`) when ready; tapping arms it.
  `hud.setCrown({ name, fill, ready, armed })` replaces `setPowerKick`.
- Locker copy: kicks say "your crown swing · ×1.45 power" (no "2 power kicks a game").

## 2. Acrobatic kicks release at the end of the motion

`contactAt` is the launch frame. For the flip/spin clips the ball currently leaves mid-move.
Set: `kickFlair 0.94`, `kickKipUp 0.93`, `kickSpinFlip 0.90`, `kickMeia 0.86`,
`kickMeiaBack 0.86`. During the hold the ball rides the striking foot (existing glide), then
flies when the motion lands. Contact SFX moves with it. Verified in the harness (launch
fraction ≥ 0.95) and by eye.

## 3. Fielders face the ball; the camera stays in front of the fence

- **Facing:** every fielder who is not moving under his own steering (cover/hold/idle/waiting
  for a throw) faces the ball every frame (`faceYaw = yawTo(pos, ball.pos)`); movers face
  their travel direction (unchanged); the chaser, thrower and receiver rules stay. The
  catcher faces the mound while the pitch is in flight.
- **Backstop clamp:** the two side fences form a V at `(±7, z 2.5)` rotated ±56°; a camera
  inside their footprint (|x| > 3.2 within −1.7 < z < 6.7) sees chain-link across the lens.
  `cameraDirector.clampNearHome(pos)` pulls `x` to ±3.2 in that zone; applied to every shot's
  target before the spring. `contact` moves to `kicker + (1.9, 0.95, 2.4)` (inside the V).
  The `kick` and `pitchSelect` framings never change.

## 4. NOW KICKING plate + runner markers

- **Plate (replaces the mini card):** a lower-third with no box — bottom-left, above the
  safe area, `max-width 58 %`: the nickname in Permanent Marker (graffiti) at 26 px with a
  2 px gold rule under it, `#N · POS` in Archivo 900 letterspaced 10 px, the gear line in
  9 px gold when it's yours. Background = a left-anchored translucent wash
  (`linear-gradient(90deg, rgba(8,9,13,.78), transparent)`), no border, slides in from the
  left. Shown when the walk-up starts, **hidden when the kicker reaches the plate** (before
  the taunt close-up), so it never covers the taunt or the swing.
- **Runner markers (replace the chips):** icon-only — an SVG runner glyph in the team colour
  with a small chevron on the side facing the runner, bobbing (`translateY` 0→−3 px, 0.7 s);
  no number, no text. Clamped with inset **56 px** plus the safe-area insets (top bug, bottom
  controls) so nothing is ever cut off. Urgent (heading home / stealing) = gold + faster
  pulse. Max 3. `data-base="2ND"` carries the target for tests.

## 5. The premium pass (every HUD element, menus, Locker)

One token system in `ui.css`, applied everywhere:
- **Type:** Archivo 900 uppercase with tight tracking for numbers, labels, buttons, tabs
  (`--display`); Archivo 700 for body; Permanent Marker (graffiti) ONLY for nicknames, crew
  names, and the big moment stamps (CROWNED!, PICKLE!, SHUTOUT!).
- **Surfaces:** no bordered boxes anywhere in the HUD. Plates are translucent dark gradients
  (`--plate: linear-gradient(180deg, rgba(8,9,13,.0), rgba(8,9,13,.72))` / side-anchored
  variants) with a 2 px accent rule (gold or team colour) and a soft glow for lit states.
  Corners: none or 4 px; broadcast diagonal cuts (`clip-path`) on the score bug and stamps.
- **Buttons:** actionable = lit backplate + glow; idle = text with a rule; never a pill with
  a border. Throw pad = four soft translucent discs with base letters; the recommended base
  glows gold; PEG pulses gold as THE play. GO / DUEL / REVERSE / CALL = wide gradient bars
  with display type. SKIP = `SKIP ›` text. Crown = ring + icon, label under it.
- **Score bug:** broadcast bug — abbr + runs in display type on a diagonal-cut dark plate,
  team-colour rule, inning/outs/count in small caps, the live diamond as is.
- **Stamps/banners/callouts:** keep the diagonal band language; drop borders; callouts are
  text with a shadow, no box; the gear toast is a thin gold line; hints are letterspaced
  sans.
- **Menus (title, menu, team select, coin toss, post-game, map):** dark gradient backgrounds
  with the existing `splat-gold`/`burst` art at low opacity as graffiti accents; mode cards
  become large typographic tiles with a colour rule (no borders); PLAY = wide gradient bar;
  post-game mixtape rows = ruled lines, no boxes.
- **Locker / GEAR UP:** hero turntable full width (top ~48 %), a typographic tab bar
  (uppercase, letterspaced, gold underline on the active tab, counts as small caps), an item
  strip of borderless cards (name in display type, sub in muted, a colour bar for kits/cleats,
  a small lock glyph when locked, the equipped card with a gold rule and glow), PLAY as a wide
  gradient bar, career line as a thin muted rule of stats.
- All test-facing class names, ids, `data-*` and label formats stay (see plan).

## Testing & verification

- vitest: `Crown` (feeds, ready, arm/consume/reset, offense-only, shutout +25); scene
  snapshot/diff helper for the half; `clampNearHome` cases; runner-marker clamp with the
  56 px inset + safe insets; manifest late-contact values; fielder-facing helper.
- Harness: crown scenario (fill → ready → arm → consume → 0), runner markers icon-only
  (`data-base`), contact fraction ≥ 0.95 for Flair, camera never inside the V during a
  contact cut / walk-up, NOW KICKING plate hides at the plate, Locker still renders +
  memory-flat.
- Real-play pass + 390×844 screenshots of every redesigned element; PR; deploy on "push".

## Out of scope

New art assets beyond the existing splat/burst, new fonts, 3D backdrop work, kick power
tuning beyond the crown rules.

## As-shipped amendments (2026-08-27)

What the build actually does where it diverged from, or went past, the sections above. The
sections stay as written; these are the corrections.

**§3 — the backstop clamp is a fence LINE, not a box.** The flat `|x| > 3.2` box was wrong in
both directions: it over-clamped shots down at the plate and under-clamped them out toward the
panels. Shipped: `fenceMaxX(z)` (exported from `src/game/cameraDirector.js`) returns the
backstop's own line, `|x| = 4.22 + 0.668·(z + 1.66)`, less a 0.35 m lens margin inside
`-1.7 < z < 6.7`, ramped open at 8 m per metre of z outside that band so the ceiling is
continuous everywhere and a dolly crossing an edge never jumps sideways (`FENCE_V`, `RAMP`).
`clampNearHome(p)` pulls a target back to that line. It is applied to every `CameraDirector`
shot target **and** to the camera-locked `contactKick` / `perfectKick` / `robbed` beats, which
sit outside the director's spring. The two kick beats do more than clamp: clamping alone froze
the push-in whenever the ceiling bit for the whole beat, so each solves a per-shot reach
against `fenceMaxX` first (`reach = min(5.0, fenceMaxX(z) - side·x)`) and dollies from there,
with `clampNearHome` left in as the safety net; `robbed` is clamped only (its shallow-catch
offset is the case that lands inside the V). Both pull directions are covered — the beat
mirrors its shot around the kicker, so a single kick would hide a one-sided bug.

**§4 — SAFE insets.** Shipped as `SAFE = { top: 96, bottom: 216, left: 12, right: 20 }`
(`src/ui/runnerArrows.js`), on top of the 56 px glyph inset. The spec's 150/12 cleared neither
the crown button nor the power-meter glow at the bottom of the frame; 216 does. The NOW KICKING
plate also hides **immediately on a tap-skip**, not only when the kicker reaches the plate.

**§1 — crown rules as built.**
- The `TAP THE 👑` hint fires **on offense only, once per fill**. A crown banked while you were
  fielding hints at the at-bat handoff instead of firing behind a hidden button; `_crownHinted`
  resets whenever the meter is not ready, so the next fill hints again.
- The **final half's shutout feeds nothing.** A `+25 CROWN` stamp over GAME OVER is noise for a
  crown nobody will ever swing. The same bottom half one inning earlier still pays.
- **A crowned swing is never a dribbler.** `attemptKick` judges on `effErr = |errMs| +
  alignErrM·175`, so good timing while standing ~0.8 m off the ball judged FOUL and the weak-
  contact path then overrode the floored CROWN GUARANTEE — a consumed meter producing nothing.
  `crownJudge()` promotes a FOUL-quality judge to OK right after the consume (keeping
  `errorMs`), and the weak branch is guarded on `!kickWasSpecial`. The guarantee still keys off
  RAW timing, so the promotion buys the swing a live ball, not a free homer.
- **A whiff keeps the crown.** It still strikes; the meter stays armed.

**§5 — premium pass as built.** The graffiti splat accent is `.screen::before` at **8 %**
opacity, top-right, and is switched **off on the title and post-game screens** — the two
darkest backgrounds, where it read as a stain rather than a texture. `.pk-label` idles at
near-white (`rgba(255,255,255,.82)`), goes gold at ready and white-hot when armed. The city
element chip and the pitch readout **share the top strip** rather than each owning a band.

**NEW — a short kick is LIVE (Task 7 dev rule).** "Foul balls should only be called foul if it
goes outside the boundaries; short kicks should not be called fouls." A timing-FOUL contact is
no longer an automatic foul call: it squirts off the foot as a weak live kick and falls through
to the same landing prediction and geometric test as every other kick. Weak contact has **one
speed for everyone**, priced off the FOUL power band and independent of the incoming launch
(the player's speed came from raw `power01` while the judge came from `effErr`, so the same
ruling produced a 6 m roller for you and a 1.5 m dribbler for the CPU): ≈**13.5 m/s at 14°,
direction jittered ±25°**, which measures through `Ball.predictLanding` as **~7.9 m out**, apex
0.81 m (under the 2.8 m fly threshold, so never a catch-out), hang 0.61 s — an infield roller
that is usually an out and can be beaten out. The foul test itself is the pure helper
`src/game/foulRule.js`: foul only if the ball **first lands** behind the plate line (`z > 0`,
was `z > -1.0`, which called a ball dying 50 cm in front of home foul) or outside the 45° lines,
with the existing 1 m plate tolerance. **No roll modelling** — the call is made at first
landing.

**Harnesses run silent (`?mute`).** The E2E harnesses drive the real game, and the dev shares
this machine with the agent browsers. `isMuted()` (`src/engine/audio.js`) reads the `?mute` URL
flag **lazily** (audio.js is imported by node-environment vitest suites, where `location` does
not exist) and pins `userVol.master` at 0 for the session; `setVolume('master', …)` cannot lift
it. `src/cinematics/videoPlayer.js` mutes every set piece it creates. Both harnesses open every
page through `url(q)` = `${BASE}/?${q}&mute` and assert the run is provably silent before the
show starts. That assertion runs off a media **census** installed before page scripts, not off
`querySelectorAll`: the field's two backdrop `<video>` elements (`src/game/field.js`) are never
appended to the document, and a detached element plays sound just fine — so every video/audio
the page creates is recorded, and any that reaches `play()` un-muted by the app is logged
before the harness's belt-and-braces net forces it quiet.

## Real-play pass results (2026-08-27)

Controller's pass, headless chromium (muted, `?mute` proven: `muted true / master 0`),
390×844, fresh save, `?match&nosplash&nointro` — screenshots in the SDD workspace
`realplay/`. Two things the dev reported mid-round, played end to end:

- **A mistimed short kick is live.** 330 ms late, lined up: judge `FOUL` → weak-contact
  roller, landed at z −8.7 m in fair ground, `fouls 0`, no call, `RUNNER TO 1ST` +
  `TAP TAP TAP TO RUN!` — a real play, not a foul horn.
- **A crowned kick is never a normal kick.** Crown filled to 100, armed through the
  on-screen 👑 (label `CROWN KICK`), swung 120 ms late AND 0.9 m off the ball (the exact
  case that used to judge `FOUL` and dribble): promoted to `OK`, `kickWasSpecial`,
  HR-eligible, landed 46 m out, crown reset to 0, then refilled to 65 from the homer + run
  (offense-only feeds). Camera at contact at x −4.69 — inside the fence line (4.71).
- NOW KICKING plate: on screen during the walk-out, gone before the taunt close-up.
- Harness (WebKit, muted): round-e2e 177/177, booth 31/31; verify-anims ALL GOOD; vitest 274.

Observed, not fixed (for the phone check): the `EL TRAIN RUMBLE` element chip wraps to
two lines in the top strip; the side-on contact framing puts the far backstop panel
behind the kicker (background, not across the lens); headless swiftshader runs the game
clock ~2–3× slow, so long plays were not waited out here. Not verifiable locally: real
60 fps, thumb feel of the new disc throw pad, the crown-swing balance over a full game.

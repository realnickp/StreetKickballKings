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

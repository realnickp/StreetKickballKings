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

# Pickle v4 — "The Duel" (design spec)

Date: 2026-07-05 · Status: APPROVED by dev ("go for it")

## Why v4 exists

Six shipped iterations (PRs #44, #47, #48, #49, #52, #57) all kept the same core
interaction — the player steers a runner back and forth in real time — and each
added another UI layer to explain it (side cam, freeze intro, bullet time,
threat marker, identity rings/tags, tactical cam + coach line + smart arrow,
duel-lane 1D bar + close dolly). Dev verdict after all six: "the pickle is
terrible... nobody will understand this." The aids now compete with each other.

Diagnosis: steering a rundown on a phone is inherently illegible (direction
flips, screen-mapped buttons, ball moving behind you). No aid fixes that. v4
changes WHAT the player does, not how it's explained.

Dev's goal for the feature: a stimulation spike the player LOOKS FORWARD to —
dodge/spin fantasy on offense, peg/throw-out fantasy on defense.

## Design thesis

**The characters do the running. You make the calls.**

Real pickles are decided by discrete moments: the runner breaks the instant the
ball is in the air; the fielder throws the instant the runner commits the wrong
way. Player input = exactly those decisions, nothing else. The AI shuttle
(runner juking, fielders converging and relaying) is the spectacle you watch.

Direction is never a player choice: a trapped runner always runs AWAY from the
ball-holder, so the game state decides direction and it is always the correct
baseball read.

## Stage & presentation (both sides)

KEEP (already built, already good):
- Freeze-frame entrance: timeScale=0, camera flies to the stage, PICKLE! call +
  bass drop, ~1.5s to set thumbs, then GO.
- Letterbox bars.
- Bullet time 0.6 for the entire duel (PICKLE_SLOWMO).
- Close side dolly cam (players fill the frame). Since there is no steering,
  camera side no longer needs to map to input — legibility burden drops to
  "can I see the ball and the runner," which this shot already does.

DELETE (the aid pile-up):
- Duel-lane 1D bar (#57)
- Smart arrow on the court (#52)
- Coach text line (GO GO GO!/REVERSE!/...) (#52)
- Floating bag tags (#49)
- Gold→red threat marker (#48/#52)
- Pickle pad (⬅bag / 🌀SPIN / bag➡) (#44/#57)

The ONLY identity cue left: one ring under the character the player controls
(runner on offense, current ball-holder on defense). HUD during a pickle = ONE
button + one swipe gesture. Nothing else new on screen.

## Offense — GO! and SPIN

- **Auto-shuttle:** the trapped runner works the pickle himself — retreats from
  the ball-holder, jukes believably, drifts toward safety when the defense is
  sloppy. Taps do NOT steer and do NOT pump speed (mash is gone in pickles).
- **GO! (one big button):** lights gold ONLY while the ball is in flight
  between fielders. Tap → full-commit sprint toward the bag the ball just LEFT.
  Earlier in the flight = bigger head start (timing grade scales a burst).
  Unlit = inert (no wrong tap exists). If the player never presses it, the
  auto-shuttle plays patient and will usually earn the retreat-safe outcome.
- **SPIN (swipe up):** brief i-frames + tagger stumble. Two windows:
  1. Tagger lunge (existing behavior) — dodge the tag, gain ground.
  2. **Incoming PEG** — defense telegraphs a peg with a visible windup; a spin
     inside the window makes the ball whiff past = LOOSE BALL = runner takes
     the next bag. (Dev requirement: "jukes and spins timed right actually
     dodge a peg.")
  Mistimed spin has recovery frames (vulnerable) and keeps its cooldown, so it
  can't be spammed.

## Defense — THROW and PEG

- **Auto-converge:** fielders squeeze the runner back toward his ORIGINAL bag
  (correct rundown shape) with a relay man at each end. No dragging.
- **THROW (one button):** relay to the other end. Throwing while the runner is
  committed toward you traps him in no-man's land.
- **PEG (swipe at the runner):** kill shot with a telegraphed windup. Hit a
  committed runner mid-break = OUT + highlight. The AI runner can spin-dodge a
  badly timed peg; a miss = loose ball and the runner takes the EXTRA bag.
  Greed is punished symmetrically.
- AI runner mirrors the player verbs (breaks on flights, jukes, spins) so the
  defense duel reads the same as the offense duel.

## The counter-web

GO beats a slow relay → THROW beats a greedy GO → PEG kills a committed runner
→ SPIN beats a PEG (and tag lunges). Every option loses to something, on both
sides. This is what keeps the mini-game a duel instead of a script.

## Outcomes & rewards

| Outcome | Result | Presentation |
|---|---|---|
| Retreat to original bag | SMALL WIN — no out, runner survives | SAFE! call, crowd exhale |
| Steal the FORWARD bag | JACKPOT | special-meter surge + Crowns bonus, crowd erupts, announcer big call |
| Tagged / pegged / relay out | LOSS | OUT! (defense conversion gets double-play-energy celebration) |

Pickles keep spawning organically (GO FOR 2 sends, loose throws, steals,
tag-up races) — the normal game occasionally hands the player a slot machine.

## Tutorial drill (rebuilt)

Teach ONE verb per forced slow scenario, one sentence each:
1. "Ball in the air → hit GO!" (staged rundown, defense forced to relay)
2. "He lunges → SPIN!" (staged tagger lunge)
3. Defense: "He breaks → THROW!"
4. Defense: "Line him up → swipe to PEG!" (optional/last)
No more explaining six systems at once.

## Engineering notes (load-bearing)

- Offense and defense pickles become **ONE state machine** with explicit exit
  conditions and its own watchdog. The rundown/steal paths are where the P0
  infinite-runner glitch lives (steals run pre-kick in SETUP/PITCH, outside the
  LIVE-phase 14s watchdog) — rebuilding this properly and fixing the P0 are the
  same job.
- Add a phase-independent runner watchdog: any runner in 'running' for ~6s
  with no meaningful position progress ⇒ force-settle him to the nearest safe
  bag and close the play. Runs every frame regardless of match phase.
- Every pickle ending must release ball control and close with the standard
  return-throw-to-pitcher flow (the #38 stall class).
- Regression tests: none of the current 113 cover AI-steal loops or
  runner-stuck states — the new state machine ships with headless vitest
  coverage (state transitions, watchdog, all three outcomes) plus the WebKit
  E2E pickle probe rewritten for the new inputs.
- Verify by REAL PLAY (per project rule) — drive the duel in-engine both sides,
  screenshot the stage, before claiming done.

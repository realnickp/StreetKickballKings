# Booth, Sound & Contact Round — Design

**Date:** 2026-08-05
**Source:** dev punch list (phone playtest): announcers talk over each other; announcer says
"he" to a girl; needs way more sound effects; needs a break between the opening dance number
and the game; music must change/stop/restart after the lineup dance; kicks need sound; kick
animation must line up on every kick; pegging the runner needs to be more of an option.

## 1. The booth never talks over itself (VO queue)

`AudioBus.vo()` currently fires every line immediately — two events close together = two
announcers stacked. Fix: a single-slot VO queue inside AudioBus (all VO already flows
through one channel).

- While a line plays: **play calls** (crowned, robbed, pegged, safe, forced, strike,
  doubleplay, tripleplay, pickle, walk, playball, gameover) go to a one-deep queue —
  the newest call wins the slot; **flavor lines** (elements, fire, lineups, walkout tags,
  nowkicking, ball) are dropped, never queued.
- When the current line ends, the queued line plays only if it's still fresh (< 4s old).
- Walkout star tags arriving every 2.3s stop piling up by design — the booth calls the
  stars it has breath for.

## 2. Proper pronouns (gendered line pools)

Characters already carry `gender` ('he'/'she', from FEMALE_ARCHETYPES). Only `crowned`
uses it. Generalize:

- `gen-announcer.mjs`: a `GENDERED` table — pegged, safe, strike, forced, pickle, walk
  (+ crowned as-is) — each with he/she variants of the pronoun lines. Neutral pools keep
  only genuinely pronoun-free lines. `ball` lines (mixed subjects: pitcher vs kicker)
  are rewritten neutral.
- Manifest schema: `gendered: { <event>: { he: [...], she: [...] } }`; `crowned`
  migrates in. `vo({event, gender})` plays gendered pool when present, merging with the
  neutral pool for variety; a bare string event falls back to neutral-only.
- Emit sites pass the subject's gender: strike/walk → kicker char; safe/forced/pegged/
  pickle → the runner's char.

## 3. Way more sound effects

New ElevenLabs SFX (gen-sfx.mjs, resumable): ball **bounce** on asphalt, chain-link
**fence** rattle, pavement **slide**, **homer** blast (air horn + fireworks crackle),
crowd **ooh** (disappointment), throw **whoosh**, whiff **swish**, sneaker **squeak**
(replaces the synth juke blip), rolling-pitch **roll**. Wiring:

- bounce: scene watches `ball.bounces` increments (gain tapers with bounce count).
- fence: ball.js counts wall hits; scene plays the rattle.
- slide/stumble: out ritual + slides play the pavement scrape.
- homer(): blast + big cheer layer.
- crowd-ooh: when the defense retires YOUR runner/kicker (sympathy beat).
- throw/whiff swap from synth blips to real files; pitch serves roll the real ball.
- **Warm-up preload:** AudioBus.warm() decodes the common set at match start — first-kick
  silence (lazy fetch+decode) is why kicks felt soundless.

## 4. The break + the music change after the dance

The dance number ends with its music; the game starts on its own groove:

- Walkout rides the city track (the city showcase, unchanged).
- Walkout cleanup → record **scratch** + `music stop` — the dance ends WITH the music.
- ~1.6s breather: letterbox holds, GAME TIME stamp, crowd swells.
- Then PLAY BALL VO + the **in-match beat pool** starts fresh — an audibly different
  groove for gameplay. (City track = the show; beat = the game.)
- MatchScene reaches music through a new `music` bus event handled by AudioBus.

## 5. Kicks: audible and aligned

- Swing **whoosh** at kick-clip start + kick thump gain up; contact SFX already fires at
  the clip's contact frame.
- A **whiff now swings**: the too-late/too-far tap plays the kick clip missing through
  the ball instead of the kicker standing frozen (the worst "didn't line up" read).
- During the approach glide the **kicker also steps into the ball** (capped ~0.45m lateral
  ease toward ball.x) so correction comes from both bodies, not a magnetized ball.

## 6. Pegging is a real option

- PEG button **dims** with no live target, **lights** when a runner is peggable, and
  **pulses gold as THE play** when no force out exists (today the pad recommends nothing
  and pressing PEG dead-ends silently).
- AI defense pegs from farther out (5.5m → difficulty-scaled reach using aiWantsPeg) so
  the mechanic is SEEN in normal games.

## Out of scope

City-track registry, walkout choreography, kick judging/tuning values (Addendum truth),
pickle duel internals.

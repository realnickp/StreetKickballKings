# Street Rules — Fun & Engagement Round (approved 2026-07-16)

Four pillars that make every match feel different, every big play feel bigger,
and every win worth something. Approved by the dev pillar-by-pillar over
remote control (design cards), city table corrected against `src/data/teams.json`.

## Pillar 1 — City Elements

Every field has ONE signature element: **fixed identity, rolled intensity**.
The element is part of the city's character (Chicago is always windy); its
strength/direction re-rolls each inning so matches stay fresh. Arcade-loud:
a HUD icon + intensity pips shows what's active, the effect is visible in the
world, and Tony & Carter call it out. Elements apply to BOTH teams equally —
home advantage emerges because the home AI plays its element smart (kicks
with the wind, runs on hustle innings, plays small ball in heavy air).

Physics must be honest, not faked: wind is a real force in the ball flight
integration (`src/game/ball.js`, currently gravity-only `G = 11.5`), bounce
is a restitution scalar, heat/fatigue scales fielder sprint speed.

### The 10 (canonical teams from `src/data/teams.json`)

| Field | Crew | Element | Effect |
|---|---|---|---|
| The Blacktop | Brooklyn Bullies | **El Train Rumble** | Periodic train pass shakes the screen; pitch timing wobbles during the rumble. A perfect kick through it earns bonus crowd heat. |
| Subway Yard | New York Snappers | **Steam Vents** | Outfield vents puff steam clouds that screen fielders — kicks into steam are harder to catch. Offense-friendly. |
| The Block Party | Philadelphia Funk | **DJ Drop** | The DJ drops a beat; the kick meter pulses on it. Kick ON the beat for bonus power. |
| Neon Night Court | Memphis Hustlers | **Night Hustle** | Runners get hot jumps under the neon — steals and extra bases are live. Fits the Hustlers; synergizes with the Steal Call. |
| Boardwalk Kings | Los Angeles Threshers | **Sea Breeze** | Steady onshore wind carries deep kicks toward the fence. Flag shows direction. HR-friendly. |
| The Mall | DC Metros | **Motorcade** | Sirens sweep past behind the fence — fielders flinch, throws lose zip during the pass. |
| The Rubber Yard | Akron Marauders | **Extra Bounce** | Rubberized ground = lively hops. Grounders skip past gloves; monster bounces over the fence = ground-rule double. |
| Winter Classic | Chicago Kestrals | **The Hawk** | Chicago's wind. Strength/direction rolled per inning bends every deep kick; scarf on the fence shows it. |
| The Scorchyard | Phoenix Gilas | **Heat Wave** | Ball carries farther in the heat; fielders tire and slow late innings. Heat shimmer visuals. |
| The Crown | Baltimore Monarchs | **Heavy Air** | Thick harbor humidity kills deep kicks at the track — bombs die, small ball wins. The champs' fortress is the hardest park to homer in. |

Mix check (per dev: "some good and helpful, some not"): offense-friendly
(Steam Vents, DJ Drop, Sea Breeze, Heat Wave carry, Night Hustle), hostile/
chaotic (El Train, Motorcade, Extra Bounce, The Hawk), defense-friendly
(Heavy Air).

### Architecture

- `src/data/fields.json`: add `element: { id, label, blurb }` per field.
- New `src/game/cityElements.js`: headless element engine — owns the
  per-inning intensity roll (seeded per match), exposes modifiers the
  existing systems query: `windForce()`, `bounceScale()`, `fielderSpeedScale
  (inning)`, `catchDifficulty(pos)`, `stealJumpBonus()`, `beatWindow(t)`,
  `throwZipScale()`, `timingWobble(t)`. Zero rendering; unit-testable.
- Consumers: `ball.js` (wind force, restitution), fielding/AI (speed, catch,
  throws), `kickTiming.js` (beat bonus, rumble wobble), base running (jump
  bonus). Visuals/FX live in the scene layer (`matchScene.js` / `fx.js`);
  HUD icon + pips in `hud.js`; announcer lines via the existing manifest
  pattern.
- Events (`EventBus`): `element:roll` (new inning intensity), `element:proc`
  (a rumble/motorcade/steam/beat window opening) so HUD, audio, and AI all
  react to one source of truth.

## Pillar 2 — Crew Heat (momentum)

Per-team heat meter (0–100), lives in the match layer beside `MatchEngine`
(subscribes to its `play`/`score` bus events plus scene-level events like
pickle wins and robberies — the rules engine stays pure).

- Builders: extra-base kicks, multi-out defensive plays, pickle wins,
  robbed catches, perfect-timing kicks.
- Stealers: a big defensive play STEALS heat from the kicking crew.
- Decay: slow passive drain; answering plays drain the other side faster.
- Full bar = **ON FIRE** for the next few plays: juiced kick power window,
  faster fielders, laser throws, crowd roar, flame VFX reusing the
  impact-cam fire pass. Announcer escalates.
- The Crown's Prime Time synergy from the draft design was replaced by
  Heavy Air; heat effects are uniform across fields.
- HUD: slim heat bar under each score chip.

## Pillar 3 — Street Calls (timed calls mid-inning)

Extends the pickle-duel formula (see `src/game/pickleDuel.js` and the
mini-game UX bar: characters run, the player makes timed calls; ONE button,
lit only when actionable; never steering).

- **Steal Call** (offense): with a runner on, the button lights during the
  pitch wind-up; tap = send the runner. Tap timing sets the jump quality;
  resolution uses the existing steal/base-event path
  (`MatchEngine.applyBaseEvent`).
- **Dive Call** (defense): on a sinking liner / gap grounder, a short window
  lights; perfect tap = diving robbery, late = ball skips past (worse than
  not diving). Risk/reward.
- **Fence Rob** (defense): on a deep HR-eligible fly near the wall, window
  lights; perfect tap = wall-climb robbery. Triggers impact cam and a huge
  heat steal.

All three feed Crew Heat (pillar 2) and respect Night Hustle (pillar 1).

## Pillar 4 — Crew Trophies (unlockables)

Beat a crew **on their home field** → unlock their ball design + signature
kick style, equipable from a trophy case screen (10 crews, silhouette until
won). No currency, no shop — winning is the economy.

- Persistence: existing `SaveManager` (`src/meta/save.js`) under keys
  `unlocks.crews` (array of team ids) and `equip` (`{ ball, kickStyle }`).
- Trophy case: new screen in `src/ui/screens/`, entered from the main menu.
- Ball designs: per-team ball texture/tint; kick styles: per-team kick
  animation flavor + trail FX. Cosmetic only — no stat changes, no balance
  creep.

## Build order (one PR each; game playable after every step)

1. **City Elements** — engine + physics + HUD + FX + announcer lines
2. **Crew Heat** — meter, fire state, VFX reuse
3. **Street Calls** — steal, dive, fence rob
4. **Crew Trophies** — unlocks, trophy case, equip

## Testing & verification

- `cityElements.js` and heat meter are headless → unit tests beside
  `tests/worldConfig.test.js` (run `npx vitest run`, check the exit code —
  never gate on grep, see process-burn note).
- Per the verify-by-real-play rule: every pillar gets an in-game
  verification pass via claude-in-chrome on the production-like build
  (`?match&field=<id>`), and the dev's phone verdict on prod after merge
  gates the "it works" claim. Elements need per-field spot checks (at
  minimum: The Hawk, Extra Bounce, Heavy Air, DJ Drop) from BOTH cameras.
- Mobile perf guard: element FX must not add persistent per-frame
  allocations; heat/element visuals reuse existing FX passes where possible
  (phone frame rate is a known suspect — see graphics round-2 notes).

## Out of scope (this round)

- Backdrop video regeneration (parked separately; dev said hold off).
- King of the Streets campaign/season mode (candidate for a future round —
  trophies are designed to slot into it as the reward spine).
- Character look upgrades / movement-choppiness diagnosis (graphics round 2).

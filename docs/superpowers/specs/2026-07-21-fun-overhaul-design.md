# Fun Overhaul — Full Round (approved 2026-07-21)

Response to the dev's Street Rules verdict (2026-07-21, phone playtest on
prod): *"didn't impact the game in any real way… no way to track any stage
based elements… all seems the same… boring and redundant… everything seems
thrown together. You must think from the point of view of the player at all
times."*

Root cause of the flop: the round shipped as simulation tuning. City
Elements reported through a 12px corner chip, Crew Heat through a 3px bar,
and effect magnitudes (×0.91–1.08 carry) are imperceptible in play. Nothing
taught the player what an element IS, telegraphed when it was live, or paid
it off when it fired.

**Design law for this round and all future work: every feature must pass the
phone-player test — (1) how do I LEARN it exists, (2) how do I SEE it
happening, (3) how do I FEEL the payoff. Arcade-loud beats honest-subtle.**

Four pillars, one PR each, game playable after every step. All four approved
by the dev over remote control 2026-07-21. ElevenLabs VO spend explicitly
approved ("vo approved, just do it") — no re-ask needed.

## Pillar A — SEE IT (presentation floor)

- **Brighter grade**: ACES filmic tone mapping currently runs at default
  exposure (`src/engine/renderer.js` `toneMapping` block) which mutes and
  darkens everything. Raise `toneMappingExposure` (~1.2–1.3 starting point)
  and punch up per-field light params (`src/game/field.js` hemi/ambient
  table) + material saturation where fields read muddy. Tuned by
  screenshots from BOTH cameras on at least 4 fields; the dev's phone
  before/after verdict gates the final numbers.
- **Popup containment**: nothing may render off-screen. Coach callouts
  (`src/ui/screens/hud.js` `callout()`) anchor to world positions with
  `translate(-50%)` and no clamping — the reported cut-off text. Add a
  clamp step: measure the bubble after insert, clamp x/y into the visible
  safe-area rect (respect `env(safe-area-inset-*)`), flip `dir` near top/
  bottom edges. Audit every popup surface: coach callouts, cine banner,
  runner banners, element badge, steal chips, action hints.
- **Regression guard**: Playwright viewport test at 390×844 and 360×780
  that pops callouts at extreme anchor positions and asserts
  `getBoundingClientRect()` stays inside the viewport.
- **HUD legibility**: Crew Heat becomes a real meter (≥8px, labeled, flame
  icon that ignites at full) + floating "+N HEAT" numbers on gains. The
  element chip becomes an element badge sized for arm's-length reading.

## Pillar B — KNOW IT (teach → telegraph → payoff)

- **Element intro card**: full-screen card after the coin toss, before
  first pitch. Element name huge, one plain sentence of effect, one
  sentence of player guidance (e.g. "NIGHT HUSTLE — steals are live under
  the neon. When the chip burns gold, SEND HIM."). Tap to dismiss / auto
  ~4s. Each new-inning intensity roll shows a compact re-banner
  ("THE HAWK ▲▲▲ blowing OUT to left").
- **Payoff banners**: every element/heat event that changes an outcome
  states what happened and what it was worth, center screen: "HOT JUMP!
  LEAD ×2", "HEAVY AIR — THAT BOMB DIED", "GROUND RULE DOUBLE — OVER THE
  FENCE ON A HOP". ON FIRE gets a full-screen team-name takeover.
- **Arcade-loud retune** (`src/game/cityElements.js` constants +
  `crewHeat.js` modifiers): baseline effects stay modest; PROC WINDOWS hit
  hard enough to see in one play. Starting targets (tuned by real play,
  not spreadsheets): Heavy Air carry ×0.91→~×0.78, Heat Wave carry
  →~×1.2, steam fielder slow ×0.75→~×0.6, gust-window carry +35%, fire
  buffs ×1.12→~×1.25. Rule: if a change can't be noticed in a single
  play, it's too subtle to ship.
- **Announcer VO**: generate Tony & Carter lines for all 10 elements +
  heat/fire moments via the existing pipeline
  (`scripts/gen-announcer.mjs`); the `vo: element-<id>` hooks already
  no-op in matchScene. Spend approved 2026-07-21.

## Pillar C — PLAY IT (element moments)

Each element periodically **procs a telegraphed window**: ~2s warning
(world FX + banner + sound), then a short live window with a real player
decision. Decisions use ONLY the three existing verbs — kick timing, GO!
runner call, one-lit-button defense call ([[skk-minigame-ux-bar]]: never
steering, one button, lit only when actionable).

| Field | Proc + decision |
|---|---|
| The Blacktop | Train rolls mid-at-bat: "HOLD YOUR NERVE" — perfect kick through the rumble = juiced power + big heat |
| Subway Yard | Kick lands in steam: "STRETCH IT!" lights — take an extra base while the fielder is screened |
| The Block Party | "DROP INCOMING…" — beat pulse rendered ON the kick button; kick on the beat = +power |
| Neon Night Court | Hustle surge: steal chip burns gold — hot jump = double lead |
| Boardwalk Kings | Gust window, flags whip: "RIDE THE BREEZE — KICK NOW" = big bonus carry |
| The Mall | Sirens pass: "RUN ON 'EM!" — defense throws weak; green-light extra bases |
| The Rubber Yard | Monster hop: timed dive-style grab (defense) / stretch call (offense) |
| Winter Classic | "THE HAWK IS HOWLING" — kick with it = LET IT FLY carry; against it = keep-it-low warning |
| The Scorchyard | Late innings: "THEY'RE GASSED — TAKE OFF!" aggressive base-running windows |
| The Crown | Heavy air kills bombs; fence-rob windows are extra generous at the track — defense showcase |

Architecture: extend `cityElements.js` with a proc-window API on the
existing `element:proc` event (windows have open/close times, the HUD/
scene/AI all consume the same event). The offense "stretch" call routes
through the call-button system into `MatchEngine.applyBaseEvent` like the
steal path. CPU crews use the same windows (home AI plays its element
smart — that stays the home advantage).

## Pillar D — WIN IT (Run the Map + trophies)

- **Run the Map**: new screen — stylized city map with all 10 fields.
  Beat a crew ON THEIR home field → claim their trophy. Progress lights
  up the map (won fields crowned). Beat all nine rivals → **KING OF THE
  STREETS**: crown moment + persistent title-screen flair.
- **Trophies** (pillar 4 of the original Street Rules design, now off
  hold): each trophy = that crew's ball design (texture/tint) + signature
  kick style (animation flavor + trail FX), equipable from a trophy case
  screen; silhouettes until won. Cosmetic only — no stat changes.
- **Persistence**: existing SaveManager (`src/meta/save.js`) under
  `unlocks.crews` (team ids) and `equip` (`{ ball, kickStyle }`), plus
  `map.progress`. Quick Match stays in the menu for casual play.

## Pillar E — PLAY FAIR (dev goal additions, 2026-07-21)

Added via /goal after spec approval ("I want all of this done"):

- **Pickle direction control**: in a pickle, the player changes their
  runner's direction THEMSELVES. This is an explicit dev override of the
  no-steering minigame rule for pickles only: a big, always-visible
  REVERSE control while your runner is in a rundown — every tap instantly
  flips the runner's direction; defense AI reacts with a human-ish delay,
  so well-timed jukes beat the throw. CPU runners keep the existing
  auto-juke logic.
- **Bad pitches are BAD PITCHES**: the pitch-trace quality now matters.
  A badly-traced pitch: (1) counts as a BALL — HUD shows the ball count,
  and **4 balls = a walk** (batter to first, forces advance) via a new
  MatchEngine ball/walk path; (2) if the kicker kicks it anyway, the kick
  is rewarded — aim biased away from the fielder coverage and a slight
  home-run odds bump. Announcer sells it ("that one got away from him —
  ball two!"). Trace quality thresholds tuned by real play so honest
  pitching stays safe and sloppy tracing walks people.

## Pillar F — LEVEL THE BLOCK (backdrops, off hold permanently)

The dev has flagged this repeatedly: backdrops are too zoomed-in,
background people look huge next to the players, the field reads as
elevated. Requirements, non-negotiable this time:

- **Horizon level with the playing field** — eye-level camera in every
  generated scene; no downhill/elevated look from either gameplay camera.
- **Proportional**: background people/objects must read as DISTANT and
  smaller than the 3D players at all times.
- Regenerate per-field backdrops (Higgsfield, one cohesive animated scene
  per the standing backdrop style rule — never flat comic or stitched
  layers), pilot one field, horizon-gate every still BEFORE animating,
  and verify scale/level from BOTH gameplay cameras before rollout.
  Credits available: ~3379 at last count.

## Build order (one PR each)

1. **A — See It**: brightness + containment + HUD upsize. Pure
   presentation; instant felt change on the phone.
2. **E — Play Fair**: pickle reversal, balls/walks, bad-pitch punishment.
   Core-loop fairness lands before any theater.
3. **F — Level the Block**: backdrop regen (generation jobs start early
   and run concurrently with the code pillars; rollout is its own PR).
4. **B — Know It**: intro cards, payoff banners, retune, VO generation.
5. **C — Play It**: proc windows + per-field moments.
6. **D — Win It**: map, trophies, equip, crown.

Built strictly in order. Per the standing deploy workflow, each merge to
main waits for the dev's explicit "push" authorization; his phone verdict
after any pillar can redirect the rest of the round.

## Testing & verification

- Headless engines (`cityElements.js` proc windows, heat changes, map/
  unlock state) get unit tests beside the existing suites; run
  `npx vitest run` and check the exit code.
- Playwright text-containment test (Pillar A) runs at phone viewports.
- Per [[verify-gameplay-by-real-play]]: every pillar gets a real
  claude-in-chrome pass on the dev server — play the moments, screenshot
  the banners/cards at phone viewport, confirm nothing clips. Occluded-
  window rAF throttle workaround: pump `window.__skk` per SESSION_LOG 24a.
- The dev's phone-on-prod verdict is the only real "it's fun now" gate.
  The specific re-test script for him: play Neon Night Court (his named
  example) and confirm he can answer "what is Night Hustle, when was it
  live, what did it pay me."

## Out of scope

- Backdrop video regeneration (still parked; dev has said hold off twice).
- Character look upgrades / movement choppiness (graphics round 2).
- Any currency/shop economy — winning is the economy.

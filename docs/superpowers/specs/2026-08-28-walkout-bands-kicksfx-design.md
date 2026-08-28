# Walk-out choreography, bands on the body, kick sound & Meia release — Design

**Date:** 2026-08-28 (after PR #108 shipped)
**Source:** dev phone check, verbatim: "wristbands and headbands look crazy still... I hate the
walk out when they do the walk out every character just appears randomly instead of them all
just walking out … the whole team at the same time … all players should be rendered when the
camera hits them not rendering one by one at random times … they walk through each other …
like ghosts … there's no sound effect when the kick meets the ball … for the newest unlocked
kick (Meia Lua) the ball needs to release at the right time … closer to the end of the
animation but not right at the end … analyze that particular kick frame by frame … and there
needs to be sound effects."

## 1. Bands are printed on the body (no more bolted-on primitives)

`src/game/accessories.js` primitives (torus/cylinders/box on Head/Hand bones) are replaced by
**skinned patches** — the same technique as the jersey decals (`jerseyDecals.js`): a band of
the body mesh's own triangles, same skeleton/weights, 3 mm along the normal, flat accent-colour
`MeshBasicMaterial` (slight dark rim via the grazing fade), `userData.owned`, disposed with
the character.
- `wristbands`: triangles whose dominant joint is `LeftForeArm`/`RightForeArm` (or `Hand`)
  and whose bind position lies within 2.5–5.5 cm proximal of the wrist joint along the
  forearm axis → one ring per wrist, ~3 cm wide.
- `headband`: triangles dominant to `Head` within a 2.5 cm band at brow height (the
  `measureHead` brow line, `BROW_LIFT_M`), full circumference, hair triangles excluded by the
  same shirt/hair joint logic (hair on shoulders never qualifies; a hair-covered brow simply
  gets no band on that arc).
- `shades`: dropped (no convincing skinned form) — casts with `shades` become `headband` or
  `none` (keep the 2–5-per-crew rule and the test).
Cost: a few dozen triangles per band, zero per-frame JS.

## 2. Walk-out: the whole crew, together, no ghosts

`src/game/walkoutShow.js` / `matchScene.js runWalkout`:
- **All 8 visible from t = 0**, queued at the gate in a file (captain at the mouth, 0.9 m
  spacing back along the gate lane, facing the field), already dressed. Nothing pops in later.
- **Lanes that never cross:** every player walks the same lane from the gate mouth to the
  wedge's outer flank and along the wedge's back edge, then peels off to its slot; slots are
  filled **back row first, far side first**, so a planted player is never in a later walker's
  path. Pure `walkoutTimeline(side)` returns polylines per slot; a test asserts no two
  polylines' active segments intersect and that no walker passes within 0.6 m of a planted
  player. Spacing along the lane ≥ 0.9 m (stagger 0.20 s at 2.3 m/s = 0.46 m → stagger
  becomes **0.40 s**; total still ≤ 8.0 s: gate moves to x ±5.5).
- `squadWalk` walks the polyline (heading = next segment); idle on arrival, captain's taunt.
- Gate dolly now frames the queue (the camera sees the whole file at t 0).

## 3. The kick is HEARD

Investigate first (`src/engine/audio.js` `sfx()` path: per-alias throttle? polyphony? gain
vs music ducking; `onKickContact` emit at `matchScene.js:1496`; the special path's
`launchNow`), then:
- new SFX via `scripts/gen-sfx.mjs` (ElevenLabs): `strike` — "hard rubber kickball struck
  by a sneaker, sharp thump with a snap, 0.5 s"; `bigwhoosh` — "fast martial-arts leg whoosh,
  0.6 s".
- Contact = `strike` (gain 1.6) layered on `kick`; PERFECT/crown adds `fireball` as today.
  Special-kick clips emit `bigwhoosh` at clip start and `swing` at 60 % of the wind-up.
- Music ducks −6 dB for 250 ms on contact (`audio.js` music gain envelope).
- Harness (booth): the sfx log at contact contains `strike` for a normal kick and a crown
  kick; `bigwhoosh` for a special.

## 4. Meia Lua releases at the strike, not the landing

Frame-by-frame analysis in node: load `public/assets/anims/mocap-x-<arch>.glb` for two
archetypes, sample the striking foot's (R for `kickMeia`, L for `kickMeiaBack`) world position
per frame through skeleton FK; the strike = the frame of **peak foot speed toward the ball
(+z in rig space) after the foot passes hip height**, before the landing plant. Set
`contactAt` = that time / clip duration for both clips (expect ≈ 0.72–0.80 given today's 0.86
"landing"). Record the per-frame table in the report; a manifest test pins the values.
Contact SFX moves with it (it fires at `launchNow`).

## Testing & verification
vitest (band selection on a synthetic forearm/head mesh; lane non-intersection; manifest
values; sfx alias table); harness (walk-out: 16 visible at t 0.1 s per side, no two players
within 0.5 m during the walk, census; KICK CONTACT for Meia ≥ its new mark; booth sfx log);
headless muted screenshots (bands on a captain front/45; walk-out t 0.3/3/6 frames).

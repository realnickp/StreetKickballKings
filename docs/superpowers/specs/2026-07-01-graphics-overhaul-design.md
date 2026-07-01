# Graphics & Feel Overhaul — "PlayStation quality" (Design Spec)

**Date:** 2026-07-01
**Status:** Approved by dev (spec review waived — "I approve it all, lets build")
**Goal:** Make Street Kickball Kings look and feel like a modern console arcade sports
title (target: NBA Street / PS4-era arcade sports) — real mocap animation, broadcast
cameras, a true 3D world, cinematic polish. Zero new spend: everything ports from
assets the dev already owns in `C:\Unity Projects\KickballGame\Assets\`.

## Locked decisions (from brainstorm Q&A)

| Topic | Decision |
|---|---|
| Character models | **Keep the 6 diverse Meshy archetypes** (incl. 2 women); retarget Mixamo clips onto them. SK_Gang01–03 (native-Mixamo rigs) are the proven-rig FALLBACK only. |
| World scope | **One hero field first**: The Blacktop becomes a real 3D NYC block. Other 9 fields stay on the backdrop system until this proves out. |
| Performance bar | **Locked 60fps on the dev's Galaxy S26 Ultra** ("playable perfectly"). Graceful quality drop elsewhere; no hard support floor below that. |
| Camera philosophy | **Full broadcast treatment** — camera CUTS between designed shots; input-critical views (kick timing, pitch trace) stay stable and predictable. |
| Lighting mood | **Golden-hour dusk** for the Blacktop now; per-field moods (night/floodlights etc.) later. |
| Asset processing | **Offline bake** — scripts run once on the dev PC; the game only loads finished, optimized files. Never parse FBX at runtime. |
| Big-moment presentation | Current one "looks terrible... really really bad" (dev). DOM speed-lines, spray-stamp slams, and the dead ComicShader are **deleted**; replaced by a true instant-replay system. |
| Phasing | 1) Mocap animation → 2) Broadcast cameras + replay → 3) Blacktop 3D world → 4) Polish. Each phase independently shippable as one PR via the normal "push" deploy flow. |

## Source assets (already owned — port, don't buy/generate)

All under `C:\Unity Projects\KickballGame\Assets\`:

- **17 Mixamo clips** (`GangsPack01/Animations/*.fbx`, genuine `mixamorig:` skeleton).
  Note the misspelled filename `Strike Foward Jog.fbx`.
- **SK_Gang01–03** rigged characters + per-team kit textures (`Resources/Kits/Kit_<Team>_Gang0X.png`) — fallback path only.
- **NYC environment**: `Assets/Assets/Gameready3D/NYC_Building` (~2GB, 202 FBX: buildings A–G,
  modular pieces, props: dumpsters/hydrants/mailbox/billboards/AC units/barricade fence, foliage,
  decals) + `Assets/GameReady3D/NYC_Buildings_Volume2` (4GB `.unitypackage` — tar.gz, extract without Unity).
- `Field/Textures/ChainLink.png` for the see-through fence.
- **NOT portable:** TwoUncleVFX (Unity VFX Graph), `.controller`/`.prefab`/`.mat` — only FBX+PNG payloads port.

## Clip → game-action mapping (dev's calls included)

| Game action | Mixamo clip |
|---|---|
| Kick | Strike Foward Jog |
| Kicker side-step (reposition) | Jog Strafe Left / Jog Strafe Right |
| Fielder holding ball | Goalkeeper Idle |
| Pitch / low release | Goalie Throw |
| Throw | Throwing |
| Catch | Baseball Catcher |
| Run | Running |
| Slide | Running Slide |
| Juke | Left Strafe |
| Idle / ready | Idle |
| Walk / swagger walk-up | Walking / SwaggerWalk |
| Victory / defeat | Victory / Defeated |
| Dances | Hip Hop Dancing ×2 |
| At-plate stance | Idle variant (no dedicated clip; tune in harness) |
| Catcher crouch | Goalkeeper Idle (or keep code-clip if it reads better) |
| Stumble | Defeated intro frames or keep code-clip |

Skip: Gunplay, WalkingToDying.

## Architecture

### 1. Offline asset pipeline (new `scripts/` tooling, Node)

- **`scripts/convert-anims.mjs`** — FBX → GLB conversion of the 17 clips, retarget
  `mixamorig:*` tracks onto the shared Meshy 24-bone skeleton, emit ONE compact
  `public/assets/anims/mocap.glb` (animations only, no mesh). All 6 archetypes share
  a skeleton, so one retargeted set drives every character.
- **`scripts/build-world.mjs`** — extract the Volume 2 `.unitypackage` (tar.gz),
  convert selected NYC FBX meshes → GLB, downscale 4K textures to phone sizes
  (≤1K props / ≤2K hero buildings, compressed), merge static geometry into a few
  chunked GLBs under `public/assets/world/blacktop/`.
- **`anims.manifest.json`** — per-clip metadata: loop flag, contact frame
  (normalized t where foot/hand meets ball, marked once by eye in the harness),
  playback-rate hints.
- The game never sees an FBX. Conversion bugs surface on the dev PC, not in prod.

### 2. Animation system — `src/game/mocapAnimator.js`

Replaces `GlbCodeAnimator` (hand-coded joint rotations) with a
`THREE.AnimationMixer`-based animator:

- **Same public surface** as the old animator — `play(name, {onContact, onDone,
  speedFactor, speed})`, `update(dt)`, `ctx.speedFactor`, `name` — so
  `matchScene.js` needs minimal changes.
- **Crossfade blending** (~0.15s) between states; run cycle `timeScale` follows
  `speedFactor`; one-shots fire `onContact` at the manifest frame and `onDone` at end.
- Clip names keep the existing vocabulary (`idle/plate/run/kick/throw/catch/...`)
  mapped per the table above.
- **Fallback:** `GlbCodeAnimator` stays behind a dev flag (`?codeanim=1`) as an
  emergency path; nothing ships if a clip retargets ugly.
- **Dev harness:** extend the `?glb` page to cycle every clip on every archetype
  for eyeball verification before wiring into the match.
- **Named risk:** Mixamo→Meshy retarget is the same rig-mismatch territory as the
  old "flinging mesh" bug (Meshy A-pose vs Mixamo rest pose). Mitigations: offline
  bake, `SkeletonUtils.retargetClip` with explicit bone map + rest-pose correction,
  harness eyeball pass, code-animator fallback.

### 3. Broadcast camera system — `src/game/cameraDirector.js`

Replaces the 3 static `CAM` presets + linear lerp in `matchScene.js`:

- **Shot system:** each game situation = a designed shot `{position rule, look rule,
  FOV, cut|blend, duration/exit condition}`. A play, televised:
  - *Awaiting pitch:* slow push-in behind the kicker — same base angle as today
    (timing readability is sacred), just alive.
  - *Contact:* hard CUT to a low hero cam, ~0.4s slow-mo launch.
  - *Ball flight:* telephoto tracker (narrow FOV ~28–35° from distance) — background
    compression, the broadcast look.
  - *Runners/fielding:* elevated sideline cam framing runner + play.
  - *Deep ball:* crane shot rising with the ball toward the fence.
- **Spring-damper motion** (critically-damped, slight settle) everywhere — replaces
  `position.lerp(target, dt*3)`. The camera has weight.
- **Input-critical views stay stable:** pitch-trace and kick-timing windows never
  get a cut or FOV change mid-input.
- Portrait framing preserved (FOV widening for narrow aspect stays, per-shot).

### 4. Instant replay + big-moment redesign — `src/cinematics/replay.js`

- **Recorder:** ring buffer (~6s) of ball + character transforms + animation states,
  recorded every frame during live play. Cheap: positions/quaternions only.
- **Playback:** on homer / robbery / peg / double-play, re-run the buffer through the
  scene from a NEW cinematic angle in slow-mo — telephoto lens, subtle letterbox bars.
  The replay is the real play, not a canned panel.
- **Deleted:** DOM speed-lines, spray-paint stamp slams over the action, the dead
  `ComicShader` pass, `engine.setComic`, and the `director.js` freeze-frame treatment.
- **Calls** (SAFE!/OUT!/CROWNED!) move to a clean broadcast lower-third strip near the
  score bug.
- Set-piece videos (splash/intros/coin toss) unchanged.

### 5. The Blacktop world — `src/game/world/blacktop.js`

Replaces the backdrop/skyline cylinders in `field.js` for the hero field
(other fields keep the backdrop path — `buildField` branches on field config):

- **NYC block at dusk:** 2–3 rows of brick buildings past the outfield (full-detail
  near, cheaper silhouettes behind), rooftop AC units/billboards, street props
  (dumpsters, hydrants, mailbox, cardboard, barricades) around the lot.
- **See-through chain-link fence** (ChainLink.png alpha) replaces the opaque wall.
- **Dusk lighting:** low warm directional sun (long shadows), orange-teal gradient
  sky dome, faint window glow. Brand palette as lighting.
- **Gameplay untouched:** field dimensions, fence distance/height, ball physics,
  collision — all identical. Pure visuals.

### 6. Performance budget (S26 Ultra contract)

- Static world merged to a handful of draw calls; scene target ≤ ~120 draw calls.
- Textures compressed for mobile GPUs; new download budget ~25–40MB (PWA-cached).
- Auto quality tiers via existing `engine.setQuality`: high = everything;
  lower tiers drop shadows/DOF/props count, never framerate.

### 7. Polish phase (last)

Depth-of-field (hides world edges, reads cinematic), color-grade pass tuned for dusk,
per-player jersey numbers (canvas-composited onto kit textures), foot-plant cleanup /
blend tuning, ball squash-and-stretch on contact.

## Error handling

- Every new loader path degrades gracefully (missing mocap.glb → code animator;
  missing world chunk → backdrop path) — a bad asset must never blank the screen
  (house rule from the env-map/GTAO incidents).
- Replay recorder overflows overwrite oldest frames; replay skips if buffer
  incomplete (early-game moments just play live).

## Testing

- **Vitest:** retarget bone-map + track renaming, camera spring math, shot-selection
  state machine, replay ring buffer.
- **Real play** (claude-in-chrome, NOT headless — renders black) for every visual
  claim, per [[verify-gameplay-by-real-play]].
- **Dev phone playtest** each phase via the "push" → Vercel production flow.
- One phase = one PR; the game is never broken between phases.

## Out of scope (this overhaul)

- Other 9 fields' 3D worlds (config-driven follow-up once the hero field proves out).
- Multiplayer, new gameplay rules/tuning, new teams.
- TwoUncleVFX port (Unity-specific; our fire/lightning ball FX already exists).
- Facial animation, cloth sim.

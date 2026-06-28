# Workstream 3b — Full graphics pass report

Branch `feat/feel-graphics-overhaul`. Three.js r0.184. Render-only changes to
`src/engine/renderer.js`, `src/game/field.js`, `src/game/ball.js`. The 72 headless tests
were untouched and stay green; build clean after every item.

## Addon path / fallback notes
All three candidate addons exist in r0.184 at the expected paths (verified in
`node_modules/three/examples/jsm/...`), so no import fallback was needed:
- `three/addons/environments/RoomEnvironment.js` — constructor takes NO args (`constructor()`),
  so `new RoomEnvironment()` (not `new RoomEnvironment(renderer)`) is correct.
- `three/addons/postprocessing/GTAOPass.js` — used GTAO (the preferred option). SSAOPass was
  NOT needed.
- Every addon usage is still wrapped so a future rename can't blank the screen.

## Per-item changes

### 1. Environment map (IBL) — commit 26a8e38
`renderer.js`: after `new THREE.Scene()`, generate a neutral PMREM environment from
`RoomEnvironment` and assign `scene.environment`. Wrapped in try/catch (console.warn + skip on
failure). Gives every `MeshStandardMaterial` real reflectance. Per-material `envMapIntensity`
held back on the shinier surfaces (ball 0.8, bases/plate 0.6, fence/posts 0.7) so nothing
washes out. MeshBasicMaterial sky/backdrop ignore env as intended.

### 2. Ambient occlusion — commit 4bd27cb (GTAOPass used)
`renderer.js`: `GTAOPass(scene, camera, 1, 1)` built in a try/catch (degrades to no-AO on
failure, `aoPass = null`). Added in `rebuildChain()` AFTER RenderPass, BEFORE bloom, **only when
`quality === 'high'`** (mobile/low skips it). Sized via `aoPass.setSize(w,h)` in `resize()`.
Tuned subtle: `output = GTAOPass.OUTPUT.Default` (scene blended with AO, not the raw grey buffer),
`blendIntensity = 0.55`, `updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 1.0,
scale: 1.0, samples: 16 })`. All tunable.

### 3. Rim / back light — commit a47303f
`field.js`: a second `DirectionalLight` at `(-20, 30, -40)` aimed at origin, `castShadow:false`,
intensity 0.8, tinted with the preset's `hemiSky` hue (cool/warm per field). Accent only.

### 4. Field + ball materials — commit eef50f5
- `ball.js`: hero ball is now glossy rubber — `roughness 0.38, metalness 0, envMapIntensity 0.8`
  (castShadow already true).
- `field.js`: new `makeAsphaltNormal()` canvas normal map (linear `NoColorSpace`, flat-blue base
  + perturbed-normal flecks) on `groundMat` with `normalScale 0.3`, repeat matched to the ground
  (10×10). Bases/plate nudged to `roughness 0.5` + `envMapIntensity 0.6`; fence + posts given
  `envMapIntensity 0.7`; mound left matte. The optional contact-shadow blob was intentionally
  skipped — GTAO already grounds the ball and the blob would add per-frame logic to `Ball.update`
  for marginal gain (conservative call).

### 5. Backdrop integration — commit 6a62054
`field.js`: crowd-ring `tuneTex` repeat `4 → 2` (bigger fans, still even so the mirrored ring
stays seamless). Backdrop material dimmed via `mat.color.setScalar(0.85)`. Added
`scene.fog = new THREE.FogExp2(<horizon sky colour from SKY_DOME>, 0.006)` — light enough to keep
the infield crisp; backdrop + sky carry `fog:false` so only field geometry/players haze with
distance. Skyline fallback path left as-is (separate, rarely-used path; its repeat of 3 is already
low-clone).

### 6. Sharper shadows — commit 848af66
`field.js` `sun`: `shadow.mapSize 1024 → 2048`, frustum `±45 → ±38` (still covers the ~42m fence
play near home), `shadow.bias = -0.0004`, `shadow.normalBias = 0.02`.

## Gates
- `npm run build`: clean after every item (only the pre-existing chunk-size + dynamic-import
  advisory warnings, unrelated to this work).
- `npx vitest run`: **72 passed (12 files)**.

## Concerns
- Fog is set on the shared `scene` (last `buildField` wins). Single field is built per match, so
  no conflict in practice; noted in case multiple fields are ever built simultaneously.
- GTAO tuning (radius/blendIntensity) was set by reasoning, not live playtest — the human should
  eyeball it; all values are single-line tunables.
- AO runs only at `quality:'high'`; low/mobile get env map + materials + fog + sharper shadows but
  no AO, by design.
- Fallback buildings (no-backdrop path) use MeshStandardMaterial without `fog:false`, so they haze
  slightly with distance — acceptable (they're far background), noted for completeness.
</content>
</invoke>

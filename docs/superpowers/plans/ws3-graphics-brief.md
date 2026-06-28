# Workstream 3b brief — Full graphics pass (the "looks cheap" fix)

Spec §3c. Branch `feat/feel-graphics-overhaul`. Vite + Three.js r0.184. The human's #1 gripe
is "backgrounds / it looks like a cheap 3D game." This pass lifts overall render quality. The
human playtests the LOOK — you make the mechanically-correct, conservative, TUNABLE changes and
keep `npm run build` clean + the 71 tests green. Commit in chunks (plain messages, no trailers).

Key files (already structured for this): `src/engine/renderer.js` (composer chain: RenderPass →
UnrealBloom → Grade → Comic → Output; ACES tone-mapping; PCFSoftShadowMap; pixelRatio capped 2),
`src/game/field.js` (lighting per `sky` preset: HemisphereLight + AmbientLight + one shadow-casting
DirectionalLight `sun`; procedural asphalt/bases/mound/fence; backdrop cylinder ring with a
mirrored ×4 video/still; sky dome), `src/game/ball.js` (the hero ball mesh + material).

Do the items below. Each is independent — commit per item. After EACH, run `npm run build`.
If an `addons` import path doesn't exist in r0.184, fall back as noted and record it.

## 1. Environment map (IBL) — biggest material win, cheap
- In `renderer.js` (or a small helper it calls), generate a neutral PMREM environment and set
  `scene.environment` so the PBR (`MeshStandardMaterial`) surfaces get real reflectance:
  ```js
  import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  ```
  (If `RoomEnvironment` constructor in r0.184 takes no renderer, the above is correct; if it
  errors, `new RoomEnvironment(renderer)`.) This brings the rubber ball + metal to life.
- Materials default to `envMapIntensity 1`. If the scene looks too shiny/washed, expose a modest
  intensity (~0.6–0.9) on the key materials (ball, fence metal). Keep MeshBasicMaterial sky/backdrop
  as-is (they ignore env, intended).

## 2. Ambient occlusion pass — grounds everything (gate behind quality:'high')
- Add an AO pass to the composer in `renderer.js`, AFTER `RenderPass`, BEFORE bloom. Prefer GTAO:
  ```js
  import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
  const aoPass = new GTAOPass(scene, camera, 1, 1); // sized in resize()
  ```
  Add it inside `rebuildChain()` only when `quality === 'high'` (mobile/low skips it). Call
  `aoPass.setSize(w,h)` in `resize()`. Tune its output to a SUBTLE contact darkening (not a heavy
  grey halo) — set a small radius / low intensity via its parameters; if GTAO's defaults look
  heavy, dial the `aoPass.output` to default and reduce blend. If `GTAOPass` import fails in
  r0.184, fall back to `SSAOPass` from `three/addons/postprocessing/SSAOPass.js` with a small
  `kernelRadius` (~8) and low `minDistance/maxDistance`. Record which you used.

## 3. Rim / back light on players — broadcast separation
- In `field.js` lighting, add a second directional (or hemispheric) RIM light from BEHIND-ABOVE
  the play (e.g. position `(-20, 30, -40)` aimed at origin), `castShadow:false`, modest intensity
  (~0.6–1.0), tinted cool or warm per the sky preset (reuse the preset's `sun`/`hemiSky` hue).
  This catches the tops/edges of the players so they pop off the crowd ring. Keep it from blowing
  out the scene — it's an accent, not a key.

## 4. Field materials
- `ball.js`: make the hero ball a glossy rubber — `MeshStandardMaterial` with the red color,
  `roughness ~0.38, metalness 0, envMapIntensity ~0.8`, `castShadow = true`. (If it's already
  Standard, just tune.) Optionally add a soft contact shadow: a small dark radial-gradient
  `MeshBasicMaterial` circle (a CanvasTexture blob) parented to the scene that follows the ball's
  ground projection (x,z, y≈0.02) and scales/fades with ball height — crash-safe, optional.
- `field.js`: give the asphalt a subtle normal map for floodlit texture — generate a small canvas
  normal map (derive from noise) and set `groundMat.normalMap` + a low `normalScale` (~0.3). Nudge
  base/plate/mound/fence roughness/metalness so they read as real surfaces under the new env/AO
  (e.g. bases slightly glossy `roughness 0.5`, mound matte). Keep it tasteful and subtle.

## 5. Backdrop integration — make the crowd ring sit BEHIND the action
- In `field.js` `tuneTex` (~L142) the ring mirrors the panorama `repeat.set(4, 0.82)`. Reduce the
  horizontal repeat `4 → 2` (bigger fans, far less obvious cloning; still even so the mirrored ring
  stays seamless). Keep the same for the `skyline` fallback path if relevant.
- Add subtle scene fog so midground recedes: `scene.fog = new THREE.FogExp2(<horizon-ish color>, ~0.006)`
  set per field (sample the sky/backdrop horizon color or use the sky preset). The backdrop + sky
  materials already have `fog:false`, so fog only hazes the FIELD geometry/players with distance —
  exactly the depth cue we want. Make sure fog density is light enough not to grey out the infield.
- Slightly dim/grade the backdrop so it doesn't read as full-bright wallpaper: multiply the backdrop
  material color toward the sky tint (e.g. `mat.color.setScalar(0.85)` or a gentle tint). Subtle.

## 6. Shadows — sharper
- `field.js` `sun`: `shadow.mapSize.set(2048, 2048)` (from 1024). Pull the frustum a bit tighter to
  the play area (`left/right/top/bottom` ±45 → ±38) for crisper contact shadows, and add
  `sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;` to kill acne/peter-panning. Verify the
  outfield fielders still cast shadows (±38 should still cover the ~42m fence play area near home).

## Constraints / done criteria
- `npm run build` clean after every item; `npx vitest run` stays at 71 green (these are render-only
  changes — they shouldn't touch tested headless logic, but run it to be sure).
- Keep 60fps in mind: AO gated to quality high; fog/env conservative. Nothing should throw at runtime
  — wrap any addon that might be missing in a try/catch and degrade gracefully (log + skip), so a
  missing pass never blanks the screen.
- Do NOT regenerate any Higgsfield assets (out of scope) — this is shading/integration only.
- Commit per item (env, AO, rim, materials, backdrop, shadows). Write a report to
  `docs/superpowers/plans/ws3-graphics-report.md` (per-item what changed, which AO pass you used,
  any addon fallbacks, final build+test lines, commit hashes, concerns). Return only: status, commit
  hashes, one-line build+test summary, concerns.

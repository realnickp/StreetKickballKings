# Crews, Kits & Walk-out — Design

**Date:** 2026-08-27 (after PR #106 shipped)
**Source:** dev phone check + two screenshots. Verbatim: "I want every team to have
different players and I want team logos on the uniforms front and back with numbers. you need
to make light and dark versions of each also you need to fix the Philadelphia logo and the
brooklyn logo needs the background removed. look at the intro video for each team and try to
make them look similar to each. we need the line you trace when pitching to be a different
color because you can't see it in certain fields like phoenix... also we need to see different
cinematic angles of the teams walking out to the field, all of them for starting lineups...
the crown resets to the level in the first screenshot after a special crown kick. its like back
to back crowns. also... there is still this issue in the 2nd screenshot where the 2 sides of
the field meet at the corner." Then: "the characters we have are good just add to them."

Decision: keep the 19 GLB archetypes; ADD per-team casting (which archetype in which slot,
height/build, skin tint, accessory), jersey decals, light/dark kits, the walk-out. No new
character meshes. Design law unchanged: SEEN / UNDERSTOOD / FELT on a phone.

## 1. Bugs

- **Back-to-back crowns.** `Crown.consume()` zeroes the meter, then the crown swing's own
  homer feeds `homerun +40` and the `score` listener `+25` per run → 65 % right after the swing.
  Fix: `this.crownPlay = true` when the crown is consumed; `crownFeed()` returns early while
  `crownPlay`; cleared in `finalizePlay`/`finalizePlayHR` (after the outcome is applied) and in
  `nextAtBat`. The shutout half feed is unaffected. Test: a crown HR with two runners leaves the
  meter at 0.
- **Field corner seam.** The backdrop is two open half-cylinders (`field.js` front `π/2..3π/2`
  and back `−π/2..π/2`) that butt at θ = ±90° (world x = ±R, z 0 — right behind the side
  fences). Each half is cropped by its own `backdropWindow{oy,ry}` / `backdropBack{oy,ry}`, so
  the painted horizons sit at different heights (Phoenix front `oy .30 ry .68` vs back
  `oy .42 ry .55`; boardwalk `.31/.69` vs `.29/.69`; underpass `.29/.71` vs `.125/.712`; …), and
  the two images are different scenes. Fix, two parts: (a) **horizon match** — the back half's
  crop is derived so its horizon line lands at the same world height as the front's
  (`horizonY = bottom + h·(1 − (oy + ry·hFrac))` with a per-field `horizon` fraction measured
  from each image; the back `oy` is solved, `ry` kept); (b) **cross-fade** — both halves extend
  12° past the join (front `π/2−12°..3π/2+12°`, back likewise), the back half gets
  `transparent:true` + a 1×256 `alphaMap` ramp that is opaque except the two 24° overlap bands,
  where it fades 1→0, so the seam is an 8–10 m soft blend instead of a hard edge. Video and
  poster textures both. Verified per field by screenshot at the side-fence camera.
- **Pitch trace line.** `.pat-ref` gold and `.pat-trace` teal vanish on Phoenix's sunset. New:
  reference = white `#fff` dashed over a 4.2 px `rgba(8,9,13,.85)` underlay (two polylines,
  `.pat-ref-halo` + `.pat-ref`), trace = white 2.6 px over a dark halo, start dot green with a
  dark ring, end dot gold with a dark ring. Readable on every field (checked on the 5 bright
  ones: scorchyard, winter-classic, the-underpass, rubber-yard, boardwalk-kings).

## 2. Jersey decals: logo front + back, numbers

The GLB atlas reuses texels across UV islands, so no texel-space decal. Decals are
**bone-parented planes**: `src/game/jerseyDecals.js` `attachJerseyDecals(char, { logoImg,
number, kit })` builds one `CanvasTexture` (512×512) per (team, kit, number) — cached in a
`Map` — and two `PlaneGeometry` meshes on the **Spine2/chest** bone (found by
`/Spine2|Spine1|spine_02/i`, fallback `Spine`): **front** = logo (0.34 m wide) on the chest +
small number (0.10 m) at the wearer's left chest; **back** = big number (0.26 m, Archivo 900,
stroked) + small logo (0.16 m) above it. Planes sit 0.035 m off the torso surface along the bone's
local ±Z, `depthTest:true`, `polygonOffset` −2, `transparent:true`, `MeshBasicMaterial` with
`toneMapped:false` and a 0.55 emissive lift so they read on dark kits. They ride the bone, so
they follow the walk/kick/dance without re-skinning; a slight bend clip is acceptable at
extremes (checked in the Locker turntable on the kick and dance clips). Disposal follows
`disposeCharacter` (`userData.owned`). The number colour is the kit's `ink` (light kit → dark
number, dark kit → light number); the logo variant is `kit.logo` (`'light'|'dark'` file).

Numbers become real data: `teams.json` roster entries gain `number` (unique per team;
captain keeps the team's marquee number). `JERSEY_NUMBERS` stays as the fallback.

## 3. Light + dark kits per team

`teams.json` gains `kits: { dark: { hex, ink, logo }, light: { hex, ink, logo } }` per team
(seeded from today's `KITS` in `screens.js`, which moves to data). `kitFor(team, tone)` keeps
its signature. Match dressing: **home wears dark**, **away wears light**; if the two kits'
contrast (ΔL in Lab) < 25, away flips to dark and home to light; if still < 25, keep the
existing `contrastUniform` fallback. The 3D recolour uses `kit.hex`; the decal uses `kit.ink`
+ `kit.logo`. The Locker KITS tab lists **your team's LIGHT and DARK first** (stock, both owned)
then the unlockables (Blackout/Whiteout/Gold keep working with the team logo on them,
`ink` derived by luminance). GEAR UP shows the kit you'll actually wear vs this opponent.

Logo files: `public/assets/logos/<id>.png` (dark-background-safe, transparent) and
`<id>-light.png` (a version that reads on light kits — for marks that are already
high-contrast the light file is the same image). **Brooklyn**: `bullies.png` gets its black
background removed (Higgsfield remove_background). **Philadelphia**: `funk.png` regenerated
from the current mark (nano_banana_pro, image reference) with the PHILADELPHIA arc clean, then
background-removed. Both re-cut to 1024² with 6 % padding.

## 4. Every crew looks like its intro video

New `src/data/casts.json`: per team, 8 slots `{ archetype, height, build, skin, accessory }`:
- `archetype` — index into the 19-pool (BENCHED 17 remaps as today), chosen per team from the
  intro stills (hair, face, gender mix) — **no two teams share the same archetype in the same
  slot**, and every team's 8 are distinct.
- `height` 0.92–1.08 and `build` 0.92–1.10 — applied as bone scales in `buildTeamCharsGlb`
  (root/Hips uniform scale for height; shoulders/upper-arm/upper-leg lateral scale for build)
  — today everyone is exactly 2.05 m.
- `skin` — a tint applied by the kit-recolour pass: skin texels are detected by hue 10–40°,
  sat 0.18–0.75, val 0.25–0.95 (the atlases keep skin in that band; kit is grey, hair is
  darker/less saturated) and multiplied toward the target tone by luminance-preserving mix
  (`mix(src, tone·L/Ltone, 0.85)`); tones: `deep #5a3a2a`, `brown #8a5a3c`, `tan #b98461`,
  `light #e2b58f`. Verified in the Locker turntable on 4 archetypes.
- `accessory` — `none|headband|wristbands|shades` as small bone-parented meshes (headband: a
  torus band on Head; wristbands: two short cylinders on the hands; shades: a thin dark
  visor on Head) in the team's accent colour. Cheap, reads at phone size.
Casting is written by looking at each team's stills (5 per intro in the SDD workspace
`stills/sheet-<team>.jpg`): gender mix, skin mix, hair (locs/braids/afro/short/bald/pony),
build (stocky vs sprint). The dev's word: "the characters we have are good just add to them."
Rosters keep their nicks/positions/stats; only the look changes.

## 5. Starting-lineup walk-out (replaces the splash-only intro)

`lineupIntro` becomes: stamp `STARTING LINEUPS` → **away walk-out** → **home walk-out** →
`GAME TIME!` (unchanged) — tap-skip at any point (`.skip-chip`), `?nointro`/`?drill` skip.
Per team (`src/game/walkoutShow.js`, `WALKOUT_SHOW = { gateX: ±14, gateZ: −6, slotsWedge: the
8 `victoryLap` slots mirrored to the infield at z −8…−12, mps: 1.7, stagger: 0.28 s,
holdS: 1.6 }`): the 8 players walk in from the side gate (third-base side for away, first-base
side for home) in a staggered file to their wedge slots, `walk` clip, captain first; when the
captain arrives, the crew hits an idle/`swagger` pose. Camera, three shots, cut on the beat:
1. **gate dolly** (0–3.0 s): low, 1.1 m, tracking beside the file from the front-quarter
   (`camera = lead + (side·2.2, 1.1, 2.6)`, look at the lead's chest), fence-line clamped;
2. **side steadicam** (3.0–5.6 s): from the foul line, 1.4 m, panning with the file;
3. **crane reveal** (5.6–8.0 s): pull back and up from the captain to the whole wedge
   (`(0,1.6,−4) → (0,4.2,4)`), the team splash card (`hud.teamSplash`) over the last 1.5 s.
Announcer: `vo 'lineups'` at the stamp, `walkout-captain` on the captain's arrival, the crew's
`intro` sting. Music continues under. Each team ≈ 8 s; both ≈ 17 s with the GAME TIME break.
All 16 characters are visible for their own team's segment only; the kicking-side reset that
`lineupIntro` already does (`cleanup`) places everyone for the first pitch.

## Testing & verification

- vitest: `crownPlay` gate; horizon-match solver + alpha ramp; `kitFor`/contrast dressing;
  decal texture cache key + number colour; casts.json schema (8 unique archetypes per team, no
  cross-team duplicates per slot, all numbers unique per team); walk-out timeline math.
- Harness (muted): crown HR → meter 0; every field's side-fence camera has no hard seam
  (pixel gradient across the join < threshold); decals present on all 16 chars; kits differ
  home vs away; walk-out plays and skips; trace line colours.
- Controller pass (headless muted chromium): every field at the seam, the Locker on 4 teams,
  one walk-out, the pitch trace on Phoenix; 390×844 screenshots. PR; deploy on "push".

## Out of scope

New character meshes; jersey pattern textures (stripes/chevrons — the kit stays a solid colour
+ decals this round); new intro videos.

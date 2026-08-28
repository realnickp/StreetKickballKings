# Crews, Kits & Walk-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ten distinct crews (cast from their intro videos) wearing logo'd, numbered light/dark kits, a three-shot starting-lineup walk-out, and four fixes: crown refill after a crown kick, the backdrop corner seam, the invisible pitch-trace line, and the Brooklyn/Philadelphia logos.

**Architecture:** Data-first — `teams.json` gains `kits` + roster `number`; new `src/data/casts.json` drives per-slot archetype/height/build/skin/accessory inside `buildTeamCharsGlb`; `src/game/jerseyDecals.js` attaches bone-parented canvas decals; `field.js` cross-fades the two backdrop halves; `walkoutShow.js` + `lineupIntro` run the walk-out with three cut shots through the existing `CameraDirector`/`clampNearHome`. Everything verified by vitest + the muted WebKit harness + a muted headless-chromium screenshot pass.

**Tech Stack:** Vite 8, three r184, vitest 4, Playwright (WebKit harness, chromium screenshots), Higgsfield (logos — already generated).

**Spec:** `docs/superpowers/specs/2026-08-27-crews-kits-walkout-design.md`

## Global Constraints

- **AUDIO (hard rule):** never open a Chrome MCP tab; browsers only as Playwright chromium `headless: true` with `args: ['--mute-audio','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']` and every game URL carrying `&mute`; the harnesses already run muted. Close browsers after each check.
- Test-facing hooks that must survive (class names / ids / data / label formats): `.special-btn` + `.ready/.armed/.hidden`, `.pk-label`, `.runner-arrow` + `data-base`, `.walkout-card`, `.stamp span`, `.team-splash` + `.ts-crew`, `.skip-chip`, `.throw-pad button`, `.pitch-select button`, `.pattern-pad` with `.pat-ref`/`.pat-trace`/`.pat-start`/`.pat-end`, `.locker-tab`, `.locker-chips .locker-chip` (+`.on/.just/.locked`), `canvas.locker-preview`, `.locker-stage-cap`, `.locker-free`, `.locker-play`, `.locker-back`, `.m-start`, `.big-play`, `.dm-dot`, `.gear-toast`, `.cine-banner`, `.runner-alerts`, `.power-meter`, `.pitch-readout`, `.element-intro`; `window.__skk`, `window.__bus`, `window.__audio`; `walkoutActive`, `cinematicLock`, `engine.cameraLock`; `PREGAME` export name in `src/game/pregame.js` (values may change).
- `kick` (0,3.4,8)/(0,1.2,−12) and `pitchSelect` (0,5,−19)/(0,1.1,−1.5) camera framings never change. `clampNearHome`/`fenceMaxX` apply to every new shot.
- `kitFor(team, tone)` keeps its signature; `buildTeamCharsGlb(team, uniformColor, gear)` and `buildCaptainPreview(team, uniformHex, gear)` keep theirs (new behaviour is data-driven).
- The 19-archetype GLB pool is unchanged (BENCHED 17 → 5 remap stays). No new meshes except tiny accessory primitives and decal planes. Per-frame allocation-free in the frame loop.
- Commit trailers on every commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01VHDK3xmrcqrgDpzGCVSg81`. Never stage `.superpowers/`, `.codex/`, screenshots, logs.

---

### Task 1: The crown play feeds nothing

**Files:** `src/game/matchScene.js` (`attemptKick` consume block ~1131, `crownFeed` ~3634, `finalizePlay` ~2128, `finalizePlayHR` ~3846, `nextAtBat` ~700), `src/game/crown.js`, `tests/crown.test.js`

- [ ] **Step 1: Failing test** (`tests/crown.test.js`): a pure gate on the `Crown` — add `crown.play` (boolean) + `feed()` returns false and does not add while `crown.play`:
```js
it('the crown swing\'s own play feeds nothing', () => {
  const meter = makeMeter(); const crown = new Crown({ meter });
  meter.value = 100; crown.arm(); crown.consume();
  expect(crown.play).toBe(true);
  expect(crown.feed('homerun')).toBe(false); expect(crown.feed('run')).toBe(false);
  expect(meter.value).toBe(0);
  crown.endPlay(); expect(crown.play).toBe(false);
  crown.feed('run'); expect(meter.value).toBe(25);
});
```
- [ ] **Step 2: Implement** — `Crown`: `this.play = false` in the ctor; `consume()` sets `this.play = true` on success; `feed(event)` returns false first if `this.play`; `endPlay() { this.play = false; }`. Scene: call `this.crown.endPlay()` at the END of `finalizePlay(...)` and `finalizePlayHR(...)` (after `applyOutcome` so the `score` listener's `run` feeds are swallowed) and in `nextAtBat` (safety). `crownFeed` needs no change (it calls `crown.feed`). The shutout feed goes through `crownFeed` too — a crown play never spans a half end, so it's unaffected; assert that in a test if cheap.
- [ ] **Step 3: Harness** — extend scenario 4 (`CROWN`): after the consume, force a HR via the same staging as scenario 13 and assert `s.crown.fill === 0` once `phase` returns to `PITCH`/walk-up; then a normal (non-crown) HR feeds 40 + 25·runs.
- [ ] **Step 4:** `npm test`; `SKK_ONLY="CROWN" node scripts/round-e2e.mjs`; commit `fix(crown): the crown swing's own play never refills the crown`.

### Task 2: The backdrop corner seam

**Files:** `src/game/field.js` (backdrop build ~170-327, sky cap ~392-402), `src/data/fields.json` (`backdropBack.oy` per field), `tests/backdropSeam.test.js`

- [ ] **Step 1: Failing tests** — extract two pure helpers into `src/game/backdropSeam.js`: `overlapArcs(edgeDeg = 12)` → `{ front: { start: π/2 − e, length: π + 2e }, back: { start: −π/2 − e, length: π + 2e } }`; `seamAlpha(u, edge01)` → the alpha ramp along the back cylinder's u ∈ [0,1]: 0 at u=0, 1 from `edge01` to `1 − edge01`, 0 at u=1, linear in the bands (`edge01 = 2e / (π + 2e)`). Tests: arcs overlap by exactly 2e each side; `seamAlpha(0)=0`, `seamAlpha(edge01)=1`, `seamAlpha(0.5)=1`, `seamAlpha(1)=0`, monotone in the bands.
- [ ] **Step 2: Implement** — both `CylinderGeometry` calls use `overlapArcs()`; the BACK material becomes `transparent: true, depthWrite: false` with an `alphaMap` = 256×1 `DataTexture` built from `seamAlpha` (`ClampToEdgeWrapping`, `LinearFilter`); render order: front `renderOrder = -2`, back `-1`. The video path (`VideoTexture`) uses the same material flags. The sky cap radius uses `Math.max(front r, back r) + 0.4`.
- [ ] **Step 3: Horizon match by eye, per field** — a throwaway muted headless-chromium script loads `?match&nosplash&nointro&mute&field=<id>` (check how a field is chosen: `fields.json`/`?field=` — if no query flag exists, add `?field=<id>` support in `main.js` for dev only, or drive `window.__skk`), sets `s.engine.camera.position.set(-3.2, 1.2, 1.0)` looking at `(-40, 3, -2)` (the left seam) and `(3.2,…)`/`(40,…)` (the right seam) with `s.engine.cameraLock = true`, screenshots both at 390×844 for all 10 fields into the SDD workspace `seams/`. Adjust `backdropBack.oy` (and `ry` only if the back scene's scale is clearly off) so the horizon lines meet within ~2 % of screen height at the join; re-shoot. Worst offenders first: `scorchyard`, `the-underpass`, `rubber-yard`, `the-crown`, `blacktop`.
- [ ] **Step 4: Harness** — new scenario `SEAM`: for `scorchyard` and `boardwalk-kings`, at the left-seam camera, sample a 1×120 px column of pixels through the join from the WebGL canvas (`preserveDrawingBuffer` is on under `?e2e`) and assert the max adjacent-pixel luminance step across the join < 0.35 (a hard edge is ≈ 0.6+). Record the values for all 10 in the report.
- [ ] **Step 5:** `npm test`; harness; commit `fix(field): the two backdrop halves cross-fade at the corners; horizons matched per field`.

### Task 3: The pitch trace reads on every field

**Files:** `src/ui/screens/hud.js` (`.pattern-pad` markup ~43-48, `showPattern` ~715, `updateTrace` ~726), `src/ui/ui.css` (~522-541)

- [ ] **Step 1:** markup: add `<polyline class="pat-ref-halo" />` BEFORE `.pat-ref` and `<polyline class="pat-trace-halo" />` before `.pat-trace`; `showPattern` sets both ref polylines' `points`; `updateTrace` sets both trace polylines'. Circles gain `stroke: rgba(8,9,13,.85); stroke-width: 1.2`.
- [ ] **Step 2:** CSS: `.pat-ref-halo { fill:none; stroke: rgba(8,9,13,.85); stroke-width: 4.2; stroke-dasharray: 4 5; stroke-linecap: round }`, `.pat-ref { stroke: #fff; stroke-width: 1.8; stroke-dasharray: 4 5; opacity: .95 }`, `.pat-trace-halo { stroke: rgba(8,9,13,.8); stroke-width: 5 }`, `.pat-trace { stroke: #fff; stroke-width: 2.6; filter: drop-shadow(0 0 6px rgba(255,255,255,.6)) }`; start dot `#43e06a`, end dot `var(--gold)`, both with the dark ring.
- [ ] **Step 3:** screenshot the pattern pad on `scorchyard` and `winter-classic` (muted headless chromium, stage the player as fielder → pitch select → a pattern pitch; the harness's PITCH scenario shows the calls) into the SDD workspace `trace/`. Existing harness pitch assertions stay green.
- [ ] **Step 4:** `npm test`; `SKK_ONLY="PITCH" node scripts/round-e2e.mjs` (whatever the pitch scenario is named); commit `fix(hud): the pitch trace is white on a dark halo — readable on every field`.

### Task 4: Logos + light/dark kits as data

**Files:** `public/assets/logos/bullies.png` (replace), `public/assets/logos/funk.png` (replace), `public/assets/logos/*-light.png` (new ×10), `src/data/teams.json` (`kits`, roster `number`), `src/ui/screens/screens.js` (`KITS` → data, `kitFor`), `src/main.js` (dressing rule ~282-287), `src/game/kits.js` (new: `dressTeams(home, away, gearKit)` + `contrastDeltaL`), `src/ui/lockerModel.js` + `src/ui/screens/lockerScreen.js` (KITS tab: LIGHT/DARK first), `src/meta/unlocks.js` (`stock` uniform entries), `tests/kits.test.js`

- [ ] **Step 1:** install the logos: Brooklyn cut = `.superpowers/sdd/2026-08-27-crews-kits-walkout/logos/bullies-cut.png`; Philadelphia = the newest `funk-*.png` in that folder that the controller marked `USE` in `logos/README.txt` (if the file is absent, use `funk-regen.png` after running it through a background cut with Pillow: flood-fill white→alpha from the corners, tolerance 12). Re-cut both to 1024² RGBA with 6 % transparent padding (Pillow). `-light.png` for all 10 teams = a copy of the main logo for now (the hook exists; art can diverge later).
- [ ] **Step 2: Failing tests** (`tests/kits.test.js`): `contrastDeltaL('#1b1b22', '#f2f2f4') > 25`; `dressTeams(home, away)` → home dark / away light by default; when the light/dark pair clashes (ΔL < 25) the away flips to dark and home to light; a player gear kit overrides the player's side; every team in `teams.json` has `kits.dark` and `kits.light` with `hex`, `ink` (`#0b0c10` or `#f4f4f6`), `logo` (`'<id>'` or `'<id>-light'`); every roster has 8 unique `number`s.
- [ ] **Step 3:** seed `teams.json.kits` from `screens.js KITS` (`dark.hex`/`light.hex` as today; `ink` by luminance of `hex` — L > 0.55 → dark ink), delete the `KITS` constant, `kitFor(team, tone)` reads `team.kits[tone]`. Roster numbers: captain keeps the marquee number (23 for monarchs' King Reese etc. — take the existing `JERSEY_NUMBERS` order per slot as the seed, then make them unique per team by bumping duplicates), stored on each roster entry.
- [ ] **Step 4:** `src/game/kits.js` `dressTeams({ home, away, playerSide, gearKit })` → `{ home: kit, away: kit }` per the rule; `main.js` uses it for `homeColor/awayColor` (and passes the kit objects through to `buildTeamCharsGlb` via `gear`/a 4th field — see Task 5's interface: `buildTeamCharsGlb(team, uniformColor, gear, { kit })`). GEAR UP's caption shows `WEARING: DARK vs <opponent> LIGHT`.
- [ ] **Step 5:** Locker KITS tab: two stock chips first — `LIGHT` and `DARK` (ids `kit-team-light`/`kit-team-dark`, `stock: true`, swatch = the kit hex) — then the unlockables; equipping one sets `gear.uniform = { hex, ink, logo }`.
- [ ] **Step 6:** `npm test`; harness `SKK_ONLY="LOCKER,GEAR UP"` (existing names); commit `feat(kits): light + dark kits per crew as data; Brooklyn cut, Philadelphia re-drawn; real numbers`.

### Task 5: Jersey decals — logo front + back, numbers

**Files:** `src/game/jerseyDecals.js` (new), `src/game/glbCharacters.js` (`buildTeamCharsGlb`, `buildCaptainPreview`, `disposeCharacter`), `src/ui/lockerPreview.js` (no change expected), `tests/jerseyDecals.test.js`

**Interfaces:** `attachJerseyDecals(char, { logoUrl, number, ink, hex })` → `{ front, back, dispose }` (meshes tagged `userData.owned = true`); `decalTexture(logoImg, number, ink, side)` → `CanvasTexture` (cached by `${logoUrl}|${number}|${ink}|${side}`); `findChestBone(root)` → bone matching `/Spine2|Spine1|spine_02|Spine/i` (first match in that priority).

- [ ] **Step 1: Failing tests** — `decalTexture` cache returns the same object for the same key and different for a different number; `layoutFront()`/`layoutBack()` (pure) return the rects `{ logo: {w:.34,h:.34,y:.06}, num: {w:.10,y:.16,x:-.10} }` and `{ num: {w:.26,y:.02}, logo: {w:.16,y:.22} }` in metres; `findChestBone` on a fake hierarchy picks `Spine2` over `Spine`.
- [ ] **Step 2:** canvas 512×512: logo drawn with `drawImage` preserving aspect; number in `900 <size>px Archivo, system-ui` (Archivo is loaded by the page CSS; `document.fonts.load` before drawing when available, else fallback), fill `ink`, `lineWidth 10` stroke in the opposite ink. Two `PlaneGeometry(0.40, 0.40)` meshes on the chest bone at local `(0, +0.10, ±0.11)` rotated to face ±Z (verify the bone's local axes on `arch-locs.glb` — the report must state the axis you found), `MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false })`, `renderOrder = 2`. Scale with the character's `heightM` factor. Front/back are separate textures (different layouts).
- [ ] **Step 3:** wire: `buildTeamCharsGlb(team, uniformColor, gear, opts = {})` attaches decals per char with `number = roster[i].number`, `ink = opts.kit?.ink ?? inkFor(uniformColor)`, `logoUrl = /assets/logos/${opts.kit?.logo ?? team.logoId}.png`; `buildCaptainPreview` too (the Locker turntable shows the decal — this is where the dev SEES it). `disposeCharacter` disposes the decal materials/textures (textures shared via the cache: dispose only when the cache entry is evicted — keep the cache bounded at 64).
- [ ] **Step 4:** headless muted chromium: Locker turntable screenshot (front and, after rotating the turntable 180°, back) for two teams; in-match screenshot of both dugouts. Check the decal doesn't float off the chest on the kick clip (play `kickFlair` in the Locker and screenshot mid-swing).
- [ ] **Step 5:** `npm test`; harness `SKK_ONLY="LOCKER"` + memory-flat assertion still green; commit `feat(kits): crew logo on the chest and back, numbers on every jersey`.

### Task 6: Cast every crew from its intro video

**Files:** `src/data/casts.json` (new), `src/game/glbCharacters.js` (`archIdxFor`, `buildTeamCharsGlb`, `recolorKitTexture` → + skin tint, bone scaling, accessories), `src/game/accessories.js` (new), `tests/casts.test.js`, `tests/skinTint.test.js`

- [ ] **Step 1: Study the stills** — view `.superpowers/sdd/2026-08-27-crews-kits-walkout/stills/sheet-<team>.jpg` for all 10 teams (Read tool). For each team write 8 slots: gender mix (female archetypes are `2,5,7,9,11,13,15`), hair (locs 0 / durag 1 / braids 2 / bald 3 / afro 4 / twists 5 / pilot 6 / sprint 7 / stocky 8 / pony 9 / waves 10 / puff 11 / shaggy 12 / bun 13 / curls 14 / fro 15 / vet 16 / longhair 18 / stache 19), skin (`deep|brown|tan|light`), height (0.92–1.08), build (0.92–1.10), accessory (`none|headband|wristbands|shades`). Rules: 8 distinct archetypes per team; no two teams share an archetype in the same slot; the captain (slot 0) is the most recognisable figure in the stills.
- [ ] **Step 2: Failing tests** — `casts.json` schema (10 teams × 8 slots, ranges, uniqueness rules above); `skinTintPixel(rgb, tone)` pure: a skin-band pixel moves toward the tone with luminance preserved (±8 %), a grey kit pixel and a black hair pixel are untouched.
- [ ] **Step 3:** `recolorKitTexture(srcTex, primaryHex, { skinTone })`: add the skin pass (hue 10–40°, sat .18–.75, val .25–.95 → `mix(src, tone·(L/Ltone), 0.85)`), cache key includes the tone. Bone scaling: Hips uniform × `height`; `LeftShoulder/RightShoulder/LeftArm/RightArm/LeftUpLeg/RightUpLeg` lateral × `build` (verify names on the GLBs; report). Accessories (`src/game/accessories.js`): `headband` = `TorusGeometry(0.11, 0.014)` on Head, `wristbands` = two `CylinderGeometry(0.045, 0.045, 0.05)` on Hand bones, `shades` = a `BoxGeometry(0.16, 0.03, 0.02)` on Head at eye height, all `MeshStandardMaterial` in the team accent, `userData.owned`.
- [ ] **Step 4:** wire `archIdxFor` to prefer `casts[team.id][i].archetype`; `buildTeamCharsGlb` applies height/build/skin/accessory; `buildCaptainPreview` too.
- [ ] **Step 5:** headless muted chromium: a 10-tile contact sheet (Locker captain for each team, front) into the SDD workspace `casts/`, plus one in-match dugout shot per 3 teams. Eyeball vs the stills; adjust.
- [ ] **Step 6:** `npm test`; harness `SKK_ONLY="LOCKER,KICK CONTACT"` (foot tracking must survive bone scaling — the striking-foot assertion is the guard); commit `feat(crews): every crew cast from its intro — hair, skin, build, accessories`.

### Task 7: Starting-lineup walk-out

**Files:** `src/game/walkoutShow.js` (new: `WALKOUT_SHOW`, `walkoutTimeline(side)` pure), `src/game/pregame.js` (`PREGAME` timings), `src/game/matchScene.js` (`lineupIntro` ~363-427, a `squadWalk(side, t)` per-frame mover), `src/game/cameraDirector.js` (`SHOTS.walkoutGate/walkoutSide/walkoutCrane`), `tests/walkoutShow.test.js`, `scripts/round-e2e.mjs` scenario 1

- [ ] **Step 1: Failing tests** — `walkoutTimeline('away')` returns per-slot `{ start, from:{x,z}, to:{x,z}, arriveAt }` with `start = i·0.28`, gate `(-14, -6)` for away / `(14, -6)` for home, slots = the wedge `[[0,-8.2],[-1.7,-9.4],[1.7,-9.4],[-3.1,-10.6],[0,-10.6],[3.1,-10.6],[-2.2,-11.8],[2.2,-11.8]]`, `arriveAt = start + dist/1.7`; the captain (slot 0) arrives first; the last arrival ≤ 6.0 s. Shot cuts at `[0, 3.0, 5.6]`, total 8.0 s.
- [ ] **Step 2:** `lineupIntro`: stamp → `runWalkout('away')` → `runWalkout('home')` → cleanup/GAME TIME as today. `runWalkout(side)`: show that side's 8 chars at the gate, per-frame `squadWalk` moves each along its line (`walk` clip while moving, `swagger`/`plate` idle on arrival, `faceTo` the plate), camera: `request('walkoutGate', ctx, {cut:true})` at 0, `walkoutSide` at 3.0, `walkoutCrane` at 5.6 (all via the director so `clampNearHome` applies), `hud.teamSplash` over the last 1.5 s, `vo 'walkout-captain'` on the captain's arrival, `hud.walkoutShow({mini:true, …})` plate for the captain at 0.4 s hidden at 3.0 s. Tap-skip: `endLineup()` snaps everyone to their play positions (existing cleanup) — the `.skip-chip` stays.
- [ ] **Step 3:** shots (`SHOTS`): `walkoutGate: c => ({ pos: V(lead.x + side·2.2, 1.1, lead.z + 2.6), look: V(lead.x, 1.2, lead.z), fov 0.85, stiffness 30 })`, `walkoutSide: c => ({ pos: V(side·9, 1.4, -9.5), look: V(0, 1.1, -10), fov 0.75 })`, `walkoutCrane: c => ({ pos: lerp((0,1.6,-4) → (0,4.2,4), t), look: V(0, 1.0, -10), fov 0.8 })` — `ctx` gains `lead` (the current front-most walker) and `side` (±1).
- [ ] **Step 4:** harness scenario 1 (`PRE-GAME`): assert `walkoutActive` → both teams visible in turn (8 chars with `group.visible` per side), the three shot names in order (`s.cam.current` or the director's `name`), captain arrival ≤ 6 s, plate shown then hidden, skip at 1 s ends it within 2 frames and everyone is at play positions; `GAME TIME!` stamp still fires; total pre-game ≤ 20 s real.
- [ ] **Step 5:** headless muted chromium screenshots: the three shots for one team (390×844) into the SDD workspace `walkout/`.
- [ ] **Step 6:** `npm test`; `SKK_ONLY="PRE-GAME,WALK-UP"`; commit `feat(show): starting lineups walk out — gate dolly, side steadicam, crane reveal`.

### Task 8: Harness, controller pass, PR

- [ ] Both harnesses full + `npm test` + `node scripts/verify-anims.mjs`; the controller's muted headless pass (seams on all 10 fields, Locker for 4 teams, one walk-out, the trace on Phoenix); spec `## Real-play pass results`; PR `Crews, kits & walk-out`; deploy on "push".

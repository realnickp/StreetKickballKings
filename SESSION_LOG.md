# Street Kickball Kings (Web/Three.js) — Session Log & Handoff

> **Purpose:** Complete snapshot of this build so a fresh session gets up to speed instantly.
> **To resume:** "Read SESSION_LOG.md to get up to speed."
> Last updated: 2026-06-15 (session 5 — NY/Black announcers, Madden matchup screen w/ logo-on-jersey diverse players, portrait phone frame + PWA, big fielding/rules pass, deployed to GitHub/Vercel)

This is the **browser/Three.js** rebuild of *Street Kickball Kings*. (There is an
earlier **Unity** version at `C:\Unity Projects\KickballGame\` — its
`KICKBALL_GAME_OVERVIEW.md` / `CLAUDE.md` hold the canonical **kickball gameplay
rules** we are aligning this build to. This web build is a different, fresh
take using AI-generated art via the Higgsfield MCP.)

---

## 1. What this is

A complete, polished **3D arcade kickball game** as a single-page web app:
**Vite + Three.js (r0.184) + custom arcade physics**, 60fps target, portrait,
touch-first (mouse = finger on desktop). Later wrappable with Capacitor.
Project dir: `C:\Users\nickp\OneDrive\Desktop\streetkickballkings`.

Brand: dark slate + **orange/teal** with graffiti accents, golden-era hip-hop
street-ball energy. Logo/brand assets supplied by the dev.

Run it: `npm run dev` → http://localhost:5173
Tests: `npm test` (Vitest, headless logic).

---

## 2. Locked design decisions (from the brainstorm with the dev)

| Topic | Decision |
|---|---|
| Multiplayer | **None in v1** — single-player vs AI only (Rookie/Street/King). |
| Teams | **10**: 9 supplied logos + **Brooklyn Bullies** (logo generated). |
| Characters | **Real 3D** (Higgsfield/Meshy `image_to_3d`, rigged+textured GLB). Was sprites, see §6. |
| Cinematics — in-play (homer/catch/peg/crushed kick) | **In-engine motion-comic panels** (comic post-FX + speed lines + stamp). NOT pre-rendered video — video can't match dynamic play. |
| Cinematics — set pieces (splash, team intros, coin toss, championship) | **Higgsfield AI video** (fixed context, one clip each). |
| Higgsfield budget | "Go all out", generate freely. Ultra plan, ~2,600 credits left. |
| "Red Rubber Felony" mp3 | Main game theme (title/menu). Plays over the splash too. |
| Splash intro video | Plays every launch (tap to skip), with the theme song behind it. |
| Currency | Single play-earned currency (Crowns). No IAP. |
| Spelling | **Phoenix Gilas** (not Gilas... it's "Gilas"). |
| Fields | Each is a team's **home city** turf (Baltimore = Monarchs, etc.). |
| Controls | Touch-only: tap-to-kick (see foot connect), tap-mash = run speed, swipe = juke, drag-to-field, 4-base + PEG throw picker, fire+lightning perfect kick, dejected/dance cutscenes. |

Specs in repo: `docs/superpowers/specs/2026-06-12-street-kickball-kings-design.md`,
plan in `docs/superpowers/plans/2026-06-12-vertical-slice.md`.

---

## 3. Teams (src/data/teams.json)

10 teams, each: city, colors, logo, genre-matched anthem (TODO), signature
special move, intro video, 8-player roster. **Monarchs** + **Snappers** have
full 8-player rosters built; the other 8 are identity-only (`status: phase3`).

Baltimore **Monarchs** (gold/red), New York **Snappers** (green/tan), Brooklyn
**Bullies**, Philadelphia **Funk**, Akron **Marauders**, DC **Metros**, Chicago
**Kestrals**, Phoenix **Gilas**, Memphis **Hustlers**, LA **Threshers**.

Fields (src/data/fields.json): The Blacktop (Bullies, starter, **ready**) +
9 city-themed home fields (phase3): Subway Yard, Block Party, Neon Night Court,
Boardwalk Kings, The Underpass, Rubber Yard, Winter Classic, Scorchyard, The Crown.

---

## 4. Architecture / file map

```
src/
  engine/
    renderer.js     Three renderer, portrait cam, post-FX chain:
                    bloom + grade(vignette/CA) + COMIC pass + output.
                    engine.setComic(0..1), engine.shake(), engine.timeScale.
    input.js        GestureInput: tap / mash-rate / swipe / drag (pointer events). TESTED.
    audio.js        AudioBus: music/sfx/vo channels, ducking, synth blips.
    events.js       EventBus pub/sub. TESTED.
    assets.manifest.json
  game/
    matchState.js   MatchEngine — headless kickball rules (innings/outs/score/bases).
                    applyOutcome() records exact multi-runner field results. TESTED.
    kickTiming.js   timing-ring -> kick quality + launch params. TESTED.
    baseRunning.js  mashSpeed + RunnerSim (tap-run, juke, cooldown). TESTED.
    throwing.js     resolveBaseThrow / resolvePeg. TESTED.
    specialMoves.js per-team meter. TESTED.
    ai.js           pitch selection, AI kick error, fielder/runner AI.
    ball.js         arcade ball physics (ballistic, bounce, roll) + predictLanding.
    field.js        procedural Blacktop diorama (asphalt+skyline textures, fence, crowd).
    characters.js   OLD procedural primitive characters (deprecated, kept for ?dance harness).
    spriteCharacters.js  Higgsfield sprite-sheet characters (chroma-keyed billboards) — being replaced by 3D.
    glbCharacters.js     NEW real 3D GLB characters (SkeletonUtils clone, outer-scale wrapper). See §6.
    matchScene.js   THE CONDUCTOR — binds engine+ball+chars+input+HUD into a playable match.
  cinematics/
    director.js     CinematicDirector — in-engine motion-comic panels (homer/catch/peg) + perfect-kick fire FX. comicMoment().
    fx.js           BallFx — fire + lightning on perfect-kick ball.
    videoPlayer.js  full-screen mp4 player (splash/intros/coin toss), tap-skip.
  ui/
    router.js       ScreenRouter.
    ui.css          all styling (dark/orange/teal, HUD, screens, comic speed-lines).
    screens/
      hud.js        match HUD: LED score bug, base diamond, pitch readout, timing ring,
                    aim bar, throw pad, special meter, graffiti stamps, speed lines.
      screens.js    Title, Menu, TeamSelect, CoinToss (video), PostGame (mixtape).
  meta/
    save.js         SaveManager (localStorage + memory + export codes). TESTED.
  data/             teams.json, fields.json, tuning.json (ALL gameplay tuning), assets.manifest.json
  main.js           boot + full flow + dev harnesses (?dance procedural, ?glb 3D model, ?nosplash).
public/assets/      logos, branding, video, audio, sprites, models, textures.
tests/              Vitest suites (46 passing).
docs/               specs, plans, higgsfield-jobs.json (asset job IDs).
```

**Flow:** splash video (theme behind it) → title → menu → team select (intro
video per team) → **coin toss video** → match → post-game mixtape → menu.

---

## 5. Higgsfield assets generated this session

All job IDs logged in `docs/higgsfield-jobs.json`. Downloaded into `public/assets/`.
- **Logos:** Brooklyn Bullies (generated to match the supplied 9).
- **Textures:** Blacktop asphalt, NYC skyline panorama, graffiti sheet.
- **Sprite sheets** (being superseded by 3D): Monarchs/Snappers ×2 chars, 4×4 pose + 16-frame run.
- **Team intro videos:** Monarchs, Snappers.
- **Cutscene videos (kickball-correct, style-anchored to keyframe `4d685d3a-...`):**
  cut-crowned-monarchs, cut-robbed, cut-pegged, cut-cointoss. *(Note: these are
  now only a fallback — in-play moments use in-engine comic panels per §2.)*
- **Audio:** announcer VO ×7 (play-ball, crushed, pegged, crowned, robbed, coin
  toss, game-over), SFX (bassdrop, scratch, crowd cheer, crowd ambience), match beat.
- **3D character:** Monarchs #23 A-pose → `image_to_3d` rigged+textured GLB
  (`public/assets/models/monarchs-23.glb`). **WORKS, looks great statically.**

**Kickball art rules for ALL future AI gen:** red rubber playground ball **~soccer-ball
size** (size of a head, NOT a torso); caught with **BARE HANDS** (no gloves/mitts/
bats/baseballs/helmets); painted street **kickball diamond** setting. Anchor cutscene
art style to keyframe job `4d685d3a-2945-408e-948a-b9a14ee7c24f`. Kicks go **far, not
straight up**; close-ups kick **toward camera** then follow the flaming ball.

---

## 6. 3D character pipeline (the big shift — IN PROGRESS)

The dev disliked flat billboard sprites. Switched to **real 3D rigged characters**
via Higgsfield `image_to_3d` (Meshy). Pipeline:
1. Generate a clean **A-pose front** full-body image per character (style-anchored).
2. `image_to_3d`: `should_texture`, `enable_rigging`, `pose_mode`, `target_polycount:18000`,
   `rigging_height_meters:1.85` → rigged textured GLB (~35–60 credits each).
3. Load in `glbCharacters.js`.

**Loader gotchas already solved (don't relearn):**
- **MUST clone SkinnedMesh with `SkeletonUtils.clone()`** — plain `.clone()` leaves
  the copy bound to the original skeleton → renders off-screen (showed as 1 render tri).
- **Scale via an OUTER wrapper group, never the armature root** — scaling the rig
  desyncs it from the clips.
- Meshy GLB exports tiny (native height ~0.0185); the outer wrapper normalizes to ~2.05m.

**OPEN ISSUE — animation rest-pose mismatch:** the baked clip from `image_to_3d`
(`pose_mode: a-pose` + `animation_action_id`) pitches the body over — Meshy rigs
A-pose but its clip library is **T-pose** authored. Symptom the dev saw: "two huge
feet running at the top of the screen." **Fix being tested:** regenerate with
`pose_mode: 't-pose'` (job `bd50e2f1-5f87-4690-ace7-c51a086b4e44`, rendering at
session end). If that animates cleanly, convert the roster. The `?glb=1` harness
shows the **static** model (great); add `&anim` to test the clip.

**Status:** static 3D character CONFIRMED great by dev ("He looks awesome!").
Glow was too strong → bloom strength dropped 0.6→0.35. Animation pending the T-pose test.

---

## 7. Cinematics — motion-comic system (DONE, dev likes it)

In-play moments render in-engine as **comic-book panels**: a `ComicShader` post-FX
pass (Sobel ink outlines + posterize + halftone) ramps on, time freezes, DOM
**speed lines** (colored per event) + spray-paint **CROWNED!/ROBBED!/PEGGED!** stamp
slam in. `director.js` `comicMoment()`. Always matches the live play; flat-ish
characters read as intentional comic art. Perfect kicks keep the **fire+lightning**
ball FX + slow-mo (no comic). Coin toss / splash / intros = AI **video**.

---

## 7b. M1 — role-based gameplay port (DONE 2026-06-13, session 2)

The web build was a shallow auto-pitch + tap-to-kick prototype; the canonical design
(Unity `KICKBALL_GAME_OVERVIEW.md` §5) is **role-based**. Ported as **playable
milestones**; **M1 = the pitcher-vs-kicker duel**, built + verified live:

- **Role = inning half** (no free toggle). Your side up → **KICK mode**; in the field → **PITCH mode**.
- **KICK mode — swipe-to-kick:** AI auto-pitches a random surprise; you press/drag-up-to-aim/
  **release on time** (release timing → `judgeKick`; swipe angle → aim; downward flick = bunt).
  Aim buttons removed. Low behind-home `CAM.kick`. Trigger = enriched `up` event in `input.js`.
- **PITCH mode — pick + trace:** 5 buttons (FASTBALL/LEFT CURVE/RIGHT CURVE/CHANGEUP/BOUNCY) →
  trace the pitch's signature swipe pattern → `scoreTrace` quality drives speed/break/wildness →
  AI kicks. Behind-mound `CAM.pitch`. New module `src/game/pitchPattern.js` (PATTERNS + scoring,
  headless+tested). `ball.js` pitch flight now does late curve break (∝ kEff²), changeup ease, bouncy hop.
- **M1 auto-resolve stub:** once the AI kicks (you pitching) the existing AI defense auto-fields so
  innings complete. **Real player fielding = M2** (`updatePlayerDefense`/`onPlayerThrow`/throw-pad
  are kept but dormant). `matchScene` always calls `assignAiDefense`/`updateAiDefense` for now.
- **5 pitch types** now in `tuning.json` (was 4): `curver`→`curveLeft`/`curveRight`, `bouncer`→`bouncy`,
  each with `durScale`/`curveM`/`ease`/`bounce`. `ai.pickPitch` returns `{curveM,ease,bounce}`.
- Tests: **57 pass** (added `pitchPattern.test.js`, `inputStroke.test.js`). `npm run build` clean.

**🔴 Root-cause bug fixed (was a big reason the game felt empty):** `ScreenRouter.go()` does
`root.replaceChildren()` on `#ui-root`, but the **HUD was mounted into `#ui-root` too** — so going
to the coin toss **wiped the entire HUD** and the match played with **NO UI** (no picker, ring,
score bug, hints). Fix: HUD now mounts into its own `#hud-root` layer (main.js + ui.css), which the
router never touches. Screens (z-index 20) still overlay the HUD (z-index 5).

**M1 feel-fix pass (dev playtested, was brutal & right):** the first M1 cut executed but was NOT
playable. Fixed the specific bugs the dev hit:
- **Curveballs sailed ~3.2m off the plate** (ended up beside/behind the kicker, still called a strike).
  `curveM` ±3.2→**±1.1**, `quality.maxWildM` 5→**1.4** → pitches now arrive AT the plate (verified ball
  x≈0). Kick window widened (perfect/good/ok 60/140/270, whiff > ~432ms).
- **Runner auto-ran** at `baseSpeedMs` 4 with zero input (`mashSpeed(0)`=4). Added `humanRunSpeed()`
  (0 taps = **0 movement**) + `RunnerSim({human})`; player runners use it; tap window 1000→**500ms**.
  Verified: 0 taps → 0m, tapping → 12m. **You now control the run.**
- **Camera couldn't see first base** — offense now uses a tight **infield cam** (frames home+bags+runner,
  follows runner x); defense follows the ball.
- **AI fielder fielded a grounder then stood idle** — `aiThrowDecision` with no live runner now still
  flips to first so it's not a statue; throw-race uses `humanRunSpeed` for the human runner.
- **Dev fast-boot:** `?match` (you kick) / `?match=field` (you field) jumps straight into a match,
  skipping splash/menu/team/video/cointoss. Big time-saver for playtesting (in `main.js`).

**⚠️ Still true / honest gaps:** the **defensive half is still auto-resolve** (you pitch, then watch the
AI field) — that's the M1 stub, and it's why "all you do is kick" still partly stands. **Real player
fielding is the next build (M2)** and should come now so both halves are hands-on.

**M1 round-2 fixes (dev punch-list, verified live):**
- **Fence**: `fenceM` 45→**42**, new `fenceHeightM` **4.0** (field.js reads it). Ball **containment** added
  (`ball.setFence(r, topY)`): balls below wall height **bounce back into the park** instead of passing
  through. Homer now requires clearing the wall IN THE AIR → only a perfect, centred kick. Verified:
  center kick maxDist 43.8 (stayed in), no cheap HR.
- **Real foul logic**: foul by landing position (behind home or outside the 45° lines, `|x| > -z`);
  `aimSpreadDeg` 35→**52** so a hard pull actually goes foul. Fouls use a 4-foul counter (`foulBall()`),
  never a 3rd strike; **4 fouls = out**. Verified: hard-pull kick → FOUL, counter ticked.
- **Camera trails the kicked ball** for ~1.3s after contact (`ballCamUntil`), then cuts to the infield
  run view — so you see where you kicked it (L/R/deep/foul). Foul balls get a ball-follow too.
- **Kicker steps toward the ball** during `KICK_ANIM` (lerp x→ball.x) so the foot meets it.
- **Catch-out comic**: ball hidden during the `robbed` panel (`comicMoment({hideBall})`) so it no longer
  covers the fielder.
- **Sky**: richer cloudy day gradient (512² + soft cloud puffs, pale horizon) so the top blends.

**Run animation — Higgsfield run-cycle frames GENERATED (background agent, ~18 credits):**
`public/assets/sprites/run-gen/` has `front-1..4`, `back-1..4` + `anchor.png` + `REPORT.md`. Consistent
generic streetball runner (TEAL tank, deliberately so it **recolors per team**), cel-shaded, chroma-green
bg, compatible with `loadSheet()`. Reusable Higgsfield Element registered: `skk-runner` (id
`86190980-0956-4de2-87de-e1658a784f6d`) — use it to keep identity for more frames / diverse characters.
**NOT yet wired**: frames are individual 1792×2400 images; need compositing into the 4x4 sheet
(rows 0-1 front, 2-3 back) + **per-team recolour** (teal→team primary) before referencing as `runSprites`.

**Still ahead (honest):** wire the run sheet (+recolour) · **player diversity** (more characters via the
same Higgsfield Element method — skin tones, genders) · **good hip-hop music + more announcer VO**
(supervised Higgsfield) · **real interactive fielding** (the "froze" / "all you do is kick" issue — M2).

## 7d. /goal — autonomous full-game build (IN PROGRESS, session 2)

Dev invoked `/goal`: build the ENTIRE game, no more layer-by-layer prompts. Working autonomously.

**DONE — real interactive fielding RE-ENABLED + verified:** M1 had bypassed the existing
`assignPlayerDefense`/`updatePlayerDefense`/`onPlayerThrow` with auto-resolve, so the dev had
"no interactive fielding whatsoever." Restored the role branch in `onKickContact` + `update()`:
you kick → AI fields; you're in the field → YOU field (drag fielder, catch=out, grounder→throw pad,
peg). Camera frames `activeFielder`+ball. Added a 5s anti-freeze: holding the ball without throwing
auto-resolves. Verified live (?match=field): activeFielder set, fielder engages ball, play resolves.

**ASSET GENERATION — 3 background agents running (Higgsfield):**
1. Hip-hop in-match music (2 loops) + announcer VO variety (3 variants/event) → `public/assets/audio/{music,vo}/`.
2. Diverse characters (~6: varied skin/gender, neutral jersey to recolor) → `public/assets/sprites/diverse/`.
3. Team intro videos (Monarchs/Snappers first, then more) → `public/assets/video/intro-<id>.mp4` (auto-activates, filename matches teams.json).
Plus prior run-cycle frames in `public/assets/sprites/run-gen/` (8 frames, Element `skk-runner`).

**AUDIO WIRED ✅:** `audio.js` `FILES.music.beat` = 2 new hip-hop loops (random per match via `pick()`);
`FILES.vo` events are now arrays (3 variants each: playball/crowned/robbed[=caught]/pegged/strike/safe/
gameover) random-picked per play. Added `vo:'strike'` (on strikeout) + `vo:'safe'` (on a base hit) emits
in matchScene so the announcer talks more. Files in `public/assets/audio/{music,vo}/`, build clean.

**REMAINING integration (as agents finish):** assemble run-gen + diverse frames into 4x4 sheets (+ per-team
teal→primary recolor) and reference as `sprites`/`runSprites`; confirm intro videos play (auto-activate on
download). Then M3 running depth (spin) + M4 rules polish.

**Dev fast-boot:** `?match` (kick) / `?match=field` (field) jumps straight into a match.

## 7e. TEAM INTRO VIDEO RECIPE — LOCKED (after many failed attempts, dev approved the style)

The dev's approved style (he showed his own Higgsfield session as reference). Match it EXACTLY:
- **Model:** `seedance_2_0`, 9:16, 8s. NO start_image (pure cutscene, not a logo card).
- **Prompt template:** `"Epic video game cutscene: a [ethnicity] [gender] street kickball athlete with [hair],
  [team-colored jersey + number], crushes a kick on a giant red rubber kickball that EXPLODES off his
  foot wrapped in fire and lightning, launching over a city schoolyard chain-link fence into the night
  sky like a comet. Slow motion at the moment of impact, then camera follows the flaming red ball.
  Gritty [CITY] [setting] at dusk, [team colors], golden-era hip-hop street energy, dramatic cinematic
  lighting, highly detailed stylized 3D."`
- **Style = GTA-style detailed stylized 3D** (real athletic proportions, gritty, cinematic). NOT
  photorealistic real humans, NOT chunky/midget proportions, NOT flat 2D cartoon, NOT NBA-2K-cartoony.
- **DON'T** write "live-action" (→ photoreal), "chunky/heroic proportions" (→ midgets), "NBA 2K
  Playgrounds" (→ basketballs), or name IP like "Fortnite/Spider-Verse" (→ ip_detected flag).
- **ALWAYS** frame-check before claiming: `ffmpeg -ss N -i clip.mp4 -frames:v 1 frame.png`, copy into the
  project dir (NOT /tmp — Read can't see it on Windows), Read it. The "wrong sport" bugs were only ever
  caught by looking. `ip_detected` status is transient — it still completes on the next poll.
- Monarchs intro DONE with this recipe (gold #23 kicker, fire+lightning red ball, Baltimore street) →
  `intro-monarchs.mp4`. **Dev may be generating the rest himself** (his history showed Akron/Bullies).

## 7f. TEAM INTRO VIDEO RECIPE — FINAL/APPROVED (supersedes 7e; dev approved after a long iteration)

The intro is a **team SHOWCASE**, NOT gameplay. Crew stands/poses/walks looking tough & cool, city-relevant.
- **Model** `seedance_2_0`, 9:16, 8s. **Logo passed as a reference** — `medias:[{role:"image", value:<logo media_id>}]` (NOT start_image; that opens on a logo card). Upload logo: media_upload → curl PUT bytes → media_confirm. Also pass `declined_preset_id:"24bae836-2c4a-48e0-89b6-49fcc0b21612"` to skip the "IN THE DARK" preset nag.
- **Approved prompt:** `"Stylized 3D video game character render, clean polished like a modern 3D sports game intro. Not photorealistic, not a flat 2D cartoon, not little kids — grown adult athletes. A confident crew of DIVERSE adult street kickball teammates, each clearly looking different, wearing <COLORS> <TEAM> jerseys, each jersey showing the team's logo from the reference image on the chest. They stand and pose together looking tough and cool in <CITY+SETTING>. One teammate casually holds a red rubber playground ball the size of a soccer ball under his arm — only one red ball, no basketball, no soccer ball. Confident hip-hop swagger, team showcase. Instrumental <CITY-GENRE> beat, no lyrics, no vocals."`
- **WORD LANDMINES (each caused a rejected video):** "Pixar"→kid-like; "live-action"/"cinematic/highly detailed"→photoreal; "NBA 2K Playgrounds"→basketballs; "Fortnite/Spider-Verse"→`ip_detected`; "crush a kick"→smashes the ball; "giant ball"→wrong; omitting "no basketball"→basketballs in hands; omitting "instrumental, no vocals"→gibberish AI lyrics; "block party/dancers"→identical-clone crowd.
- **ALWAYS frame-check before accepting** (agents mis-judge): `ffmpeg -ss N -i clip.mp4 -frames:v 1 f.png` into the PROJECT dir (not /tmp — Read can't see /tmp on Windows), then Read it. Reject photoreal / clones / basketball / kid-like.
- **Phoenix/Gilas gotcha:** the desert **sunset** setting kept forcing photoreal; fixed by setting it at **night** (neon, cactus silhouettes, lowrider) like the other night/urban teams.
- **Logo OUTRO + sound — DONE on all 10.** Each `intro-<team>.mp4` = 8s showcase → white-flash `xfade` → punch-in zoom of the real logo PNG, ~10.3s, audio==video length. Three reusable scripts in `scripts/`:
  - `add-logo-outro.sh <team>` — the flash→logo transition (auto-strips a prior outro so re-runs don't stack)
  - `add-outro-sound.sh <team>` — overlay outro sound, `-c:v copy` (fast, no re-encode)
  - `fix-outro-audio.sh <team>` — **the keeper**: the outro rides **THAT TEAM'S OWN music** (continued/looped from its showcase) + a bass hit, NOT a shared clip (the dev hated a shared loop on every logo).
- **Status: ALL 10 team intros DONE** (monarchs, snappers, bullies, funk, marauders, metros, kestrals, gilas, hustlers, threshers) — showcase + flash-to-logo + own-team music, auto-play at team select. `Intro-Threshers.mp4` was renamed lowercase so the game loads it.

**Next:** integrate the generated character art → M3 running depth → M4 rules glue.

## 8. Current state (session 2 — 2026-06-13)

**DONE & in the build:**
- **M1 role-based gameplay** (§7b) — PITCH mode (pick 1 of 5 pitches → trace its swipe pattern) /
  KICK mode (swipe-to-kick, release timing), real fouls (4 = out), fence + ball containment,
  ball-follow + infield cameras, **tap-to-run control**. **57 Vitest tests pass**, `npm run build` clean.
- **Real interactive fielding** (§7d) — on defense you drag a fielder, catch = out, grounder → throw
  pad → throw to a base / PEG; 5s anti-freeze. (The player-defense half is no longer the auto-resolve stub.)
- **Audio wired** (§7d) — 2 hip-hop in-match beats (random per match) + announcer VO pools (3 variants
  per event, rotated) + new `strike`/`safe` announcer calls.
- **HUD root bug fixed** (§7b) — HUD lives in its own `#hud-root`; the router no longer wipes it.
- **All 10 team intro videos** (§7f) — stylized-3D Higgsfield showcases w/ real logos + flash-to-logo
  outro + each team's own outro music. Play at team select. Reusable scripts in `scripts/`.
- **Dev fast-boot:** `?match` (you kick) / `?match=field` (you field) — straight into a match.

**GENERATED but NOT yet wired into the game (next big task):**
- **Diverse character sprites** — `public/assets/sprites/diverse/<id>/` (luca/maria/kenji/jamal/aisha/sofia:
  3 men/3 women, varied ethnicities; idle/run/catch/throw + anchor). ⚠️ some catch/throw poses hold a
  **basketball** — regenerate empty-handed before use. Element ids in `diverse/REPORT.md`.
- **Run-cycle frames** — `public/assets/sprites/run-gen/` (8-frame generic teal runner, Element `skk-runner`).
- Both need: composite into 4x4 sheets (rows 0-1 front, 2-3 back) + **per-team recolour** (teal→primary)
  → wire as team `sprites`/`runSprites`. **The match still renders the old 2-pose sprites** (goofy run +
  non-diverse roster) until this lands.

### Next session
1. **Integrate the new character art** (sheet assembly + recolour + wire) — fixes the goofy run AND the
   all-one-look roster in one pass. Swap `spriteCharacters` for the new sheets in `matchScene`/`teams.json`.
2. **M3 running depth** (circle-swipe spin) · **M4 rules glue** (dead-ball-at-mound, coin-toss-winner-picks).
3. Remaining teams' rosters/fields, season mode, meta systems (daily challenges, streaks, chemistry, gear).
4. 3D GLB character pipeline (still has the A-pose/T-pose animation mismatch from session 1) — a separate track.

---

## 8b. SESSION 3 — full game completion (2026-06-13, /goal continued)

Goal: "finish building the game" — all teams, clean coin toss, full kicking logic, **real
fielding** (was "not even close"), force-aware base running, announcers calling team names.
All verified by REAL PLAY via Playwright (drove pointer events, read live scene state,
screenshots), per [[verify-gameplay-by-real-play]]. **57 tests pass, build clean.**

**CHARACTERS — unified on procedural 3D for ALL 10 teams.** Dropped the sprite/GLB split:
`buildTeamChars(team)` in `characters.js` builds 8 procedural `buildPlayer` players per team,
recolored to the team's uniform (jersey=primary, shorts=accent, sneakers=secondary, chest
number). The ONLY universal path — every team looks consistent + real-3D + gets its uniform,
no per-team art needed. `matchScene` now lerps `c.faceYaw` each frame (procedural chars have a
real front, unlike billboards) so runners/fielders/kicker orient correctly. Added `plate` +
`crouch` clips to the procedural Animator. `spriteCharacters.js` is now unused (kept for a
possible future art pass). `main.js` builds chars via `buildTeamChars`.

**FIELDING — fully rewritten, works both ways (you field AND AI fields).** One shared system in
`matchScene`: `assignDefense({playerControlled})` → closest fielder CHASES (lead-intercept via
`ballLeadPoint`), 2nd-closest BACKS UP, others COVER the bases a play can happen at
(`basesToCover`). `updateDefense` moves ALL of them (multi-fielder, verified 3 moving at once).
`handleChaserBall`: catch a fly (→`catchOut`) or scoop a grounder (→`possessBall`). Then throw
to ANY base incl. home (race via `resolveBaseThrow`) or PEG the lead runner (`resolvePeg`).
You-field: chaser auto-runs to the predicted spot, TAP to redirect (`onTap`), throw-pad picks
base/peg. AI-field: same code, AI drives the chaser + `aiThrowDecision`.

**BASE-RUNNING — real force logic** (the dev's explicit ask: "1st→2nd pushes 2nd→3rd"). `launchRunners`
computes a contiguous FORCE chain; held runners `mustVacate` when a teammate runs into their bag
(no stacking); `defenseHasBall` makes AI runners cautious once the infield secures the ball (kills
the old infinite-circling). `finalizePlay` accumulates `playOuts` and settles at the natural end
(fielder's-choice: force the lead runner, kicker safe at first — verified `X..→X..`, `XX.→XXX`).

**KEY TUNING FIXES (all were real bugs found by playing):**
- AI fouled ~75% of kicks: discrete AI aim used the full 52° spread (foul line is 45°). Added
  `kick.aiAimDeg:30` (player swipe still uses 52° as a skill risk). `kickTiming.js`.
- Homer derby: AI hit PERFECT ~57% (→ fence-clearing HR). Widened AI `kickTimingErrMs`
  (Rookie/Street/King) so PERFECT is rare; player's perfect-kick HR reward kept (maxBallSpeed 26).
- Grounders un-fieldable (rolled to the wall): `ball.js` `ROLL_FRICTION 2.2→9`, added `GROUND_GRAB 0.5`
  (turf grabs a settling ball). Fielders too slow: `fielding.dragSpeedMs 7.5→9`, `scoopRadiusM 2.0`,
  `leadTimeS 0.28` (cut-off intercept). Runner speed `maxSpeedMs 8.5→7.5`, `baseSpeedMs 4→3.5` so
  prompt throws beat runners. Result: grounders fielded ~0.6s, force outs land.

**ALL 10 TEAMS PLAYABLE.** The 8 phase3 teams got full 8-player rosters (generated by a parallel
agent workflow, city-flavored nicknames — Brick City Bones, El Capi Veneno, Big Crunk, Twinkie
Toes…), merged via `scripts/merge-rosters.mjs`, all `status:"ready"`. TeamSelect is now two-step:
PICK YOUR SQUAD (10) → PICK YOUR RIVAL (9 + RANDOM). Verified Bullies-vs-Gilas plays with correct
red/orange uniforms.

**PA ANNOUNCER (team names).** `audio.js` `announce()` uses browser `speechSynthesis` (dynamic, all
10 teams, no extra audio gen). Bus event `announce`. Calls the matchup at the coin toss + the
kicking team each half (`matchScene` `_lastKickSide`). Layered with the pre-recorded event VO. A
future upgrade = pre-rendered announcer clips per team.

**COIN TOSS** result is a clean `.coin-result` card (crown/coin pop, "YOU CALLED X · IT'S **Y**",
"YOU WIN/OPPONENT WINS THE TOSS", KICK/FIELD buttons) — no more wrapping `<h1>`. `.stamp` font is
now `clamp()` so long stamps ("SWITCH! YOU'RE UP!") no longer overflow. Aim-bar hidden (M1 unused).

**ADVERSARIAL REVIEW (18-agent workflow) → fixed the real ones:** human runner froze in 'running'
if you stopped tapping → 14s hang (FIXED: stalled human commits to a bag once `defenseHasBall`);
empty-roster crash guard in `nextAtBat`; peg now stamps SAFE! if the runner already reached a bag.
Left intended behaviors (`defenseHasBall` persistence, AI holding on short hits) — they're what
prevent circling.

**Fast-boot still:** `?match` (you kick) / `?match=field` (you field) / `?nosplash` (full flow, skip
splash). `window.__skk` is the live scene.

## 8c. SESSION 4 — DETAILED GLB CHARACTERS (replaced the "boxy/Minecrafty" procedural ones)

The dev hated the procedural primitive players ("look like Minecraft"). Replaced them with detailed
textured 3D athletes that match the intro-video look — **verified in-engine, 60fps, no Meshy/Mixamo/
Blender needed** (Claude drives Higgsfield + writes all the code; dev does nothing).

**How it works now (`src/game/glbCharacters.js`):**
- **Models:** 6 diverse archetypes in `public/assets/models/archetypes/` (locs/durag/braids/afro/
  bald/twists). Each = Higgsfield `generate_image` (neutral-grey-kit A-pose, video style) →
  `image_to_3d` (`enable_rigging`+`should_texture`, 35 credits each). The original `monarchs-23.glb`
  is the fallback. Source A-pose images saved in `arch-src/`.
- **One shared skeleton:** every Meshy rig is the same standard 24-bone humanoid (Hips/LeftUpLeg/
  LeftArm/Spine/Head…), so a single code animator drives them all. `buildTeamCharsGlb(team)` cycles
  the archetype pool across each 8-player roster.
- **Animation = CODE, not the baked clips.** The models ship clips (`Armature|RunFast`) authored for
  a different rest pose → they FLING the mesh ("giant feet at top" — the old blocker). `GlbCodeAnimator`
  instead captures each bone's rest quaternion and adds rest-RELATIVE rotations per frame: idle, run
  (speedFactor), plate, crouch, kick (onContact), throw (onDone), catch, stumble, dance1-4. Same
  surface as the sprite/procedural animators (`play/update/ctx.speedFactor/name`) → matchScene UNCHANGED.
- **Facing:** mesh faces +z (procedural convention) → `faceOffset:0`.
- **Per-team uniforms (`recolorKitTexture`):** canvas recolour of the neutral-grey kit pixels (low-sat,
  v>0.52) → team `colors.primary`, per-character material clone. **GOTCHA that cost an hour:** Meshy
  exports `metalness:1` (albedo invisible) + a white `emissiveMap` (self-lit with the ORIGINAL grey
  texture, overriding the recolour). The fix is `metalness:0, roughness:0.85` AND
  `emissiveMap = recoloured map, emissiveIntensity 0.55`. Confirmed Monarchs gold vs Snappers green.

**Wiring:** `main.js` builds chars via `await buildTeamCharsGlb(team)` (was the procedural
`buildTeamChars`). `?glb=<url>` harness loads any GLB; `?glb=1&anim` plays the (broken) baked clip —
don't use it, it's only there to show the flinging bug. `characters.js`/`spriteCharacters.js` unused.

**Honest remaining polish:** run-cycle foot-plant could be tighter; archetypes are assigned by roster
index (not gender-matched to the nick); jersey NUMBER is baked per-archetype (not per-player); 43MB of
GLBs load on first match (cached after). All cosmetic — the system works and looks like the videos.

## 8d. SESSION 5 — announcers, Madden matchup, mobile/PWA, fielding & rules pass (2026-06-15)

Rapid-fire dev punch-list session. All verified by **Chrome-headless screenshots** (the Playwright MCP
died mid-session when node was restarted — see the screenshot pipeline note below). 57 tests pass, build clean.

**ANNOUNCERS — real NY/Black voices (ElevenLabs).** Rejected, in order: charlie (Australian), george
(British), then renzo/alex (sounded Indian). Generated 5 samples → dev picked **Tony — Brooklyn**
(`ICwKbPHDHAM3eal5tHEZ`) + **Carter — NY street** (`GorLj2SsI4u2JqL58gAA`). `scripts/gen-announcer.mjs`
regenerates the 118-clip pack (model `eleven_multilingual_v2`, stability .32/style .6); `audio.js`
`vo()` routes bus events → manifest pools (non-repeat, gender-aware crowned, per-team nowkicking, +
new doubleplay/tripleplay). Voice IDs + the "don't ship without the dev hearing samples" rule live in
[[skk-asset-pipeline-decisions]]. Discovery helpers: `scripts/eleven-find-black.mjs`,
`scripts/gen-voice-samples.mjs` → `/voice-samples.html`.

**MADDEN-STYLE TEAM SELECT** (`TeamSelectScreen`, `.matchup-screen`). YOU (left) vs RIVAL (right),
cycle each side, START MATCH. Each side = BIG team logo + name + stat bars + **a man AND a woman**
standing together. Player art: **20 images** (10 teams × man/woman), each generated with the **team
logo uploaded as an image reference** so the crest is printed on the jersey chest (nano_banana_pro
`medias:[{role:image}]`), then **`remove_background`** for true transparency (it bakes an opaque dark
bg otherwise → players were dark rectangles). **Diverse by design** (balanced Black/White/Latino/Asian,
no majority — dev called the all-Black first batch out). Saved `public/assets/players/<id>-man|woman.png`.
Generated via two `Workflow` runs (20 agents each: gen→poll→remove_bg→poll→return URL).

**INTRO SEQUENCE** reordered to: YOUR team video → opponent video → **ONE** VS/clash set-piece → coin
toss (`introSequence.js` `showLogoClash`, dropped the duplicate standalone VS). Fixed the
"bounces back to select" bug (clear `#ui-root` + black backdrop before the videos).

**📱 PORTRAIT PHONE FRAME + PWA (mobile).** Whole app was `position:fixed;inset:0` → stretched full
desktop width. Wrapped canvas+UI in **`#stage`** = a centered portrait frame (`width: min(100vw, 100vh*0.52)`,
letterboxed on desktop, fills a phone). **Renderer** sizes to the canvas (`setSize(w,h,false)`), **input**
scoped to `#stage`, `screenToGround`/`worldToScreen` map via the canvas rect, videos/intro-fx/HUD moved
inside `#stage`. **CRITICAL:** all UI used `vw` (= desktop window width) → everything was oversized in
the frame; made `#stage` a `container-type:inline-size` and converted `vw`→`cqw` (frame-relative).
**PWA:** `public/manifest.webmanifest` (standalone, portrait), `public/sw.js` (network-first, PROD-only
register in `main.js`), apple-touch + `apple-mobile-web-app-*` meta in `index.html`, icons in
`public/icons/` (from `logo-square.png` via sharp). Add-to-homescreen works.

**FIELDING / RULES PASS (dev was right on every one):**
- **"Fielding frozen" = STALE DEV SERVER.** The dev was on a `localhost:5173` server **started 2 days
  prior** (June 12) running pre-fix code. Killed all node, cleared `node_modules/.vite`, restarted clean.
  This was the real cause both times it "froze." Also reverted a bad off-axis `CAM.pitch` (shoved the
  fielder into the foreground) back to a clean centered pitch view.
- **AI kick contact rate** — over-corrected twice. `ai.js aiKickError` now takes the served `pitch`
  (gentle ≤1.5× multiplier for speed/break); swing TIMING capped to ±0.45s of arrival (decoupled from the
  judged error) so a miss never leaves the ball "frozen" sitting there. `tuning.ai.kickTimingErrMs`
  Rookie[70,560]/Street[40,460]/King[22,340] → CPU puts it in play ~91-100% (Street), fans only on a
  nasty pitch. (Simulated, not just guessed.)
- **Basemen stay on bases.** `basesToCover()` → **always [0,1,2,3]** (1st/2nd/3rd/home-catcher all manned);
  only the chaser leaves for the ball.
- **Throw-to-base now requires a CATCH.** A force out only counts if a fielder is at the bag to receive it
  (catch anim + ball-in-glove); nobody covering → "NOBODY COVERING!", runner safe, ball live.
- **Double/triple plays** — AI relays to the next force base (`tryDoublePlay`), DOUBLE/TRIPLE PLAY! stamp + VO.
- **Ball size** — `BALL_R 0.35→0.22` (was a beachball, ~⅓ a player's height).
- **Pitch grade** — the big center "NASTY!/WOBBLER" stamp → small `pitch-grade` badge up top (was covering
  the play). Lingering pitch/kick stamps cleared when fielding starts (`hud.clearStamps()`).
- **Pickle** = runner trapped between two bases (`startRundown` reverses him, fielder tags/pegs).

**SCREENSHOT PIPELINE (no Playwright MCP).** `?go=<screen>` dev param in `main.js` jumps straight to a
screen; capture with headless Chrome:
`"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --window-size=470,880
--virtual-time-budget=3500 --screenshot=out.png "http://localhost:5173/?nosplash&go=teamSelect"`.

**DEPLOY.** `public/assets/sprites/` (132MB unused old sprite art) gitignored to slim the 339MB assets.
Pushed to **github.com/realnickp/StreetKickballKings** for **Vercel** (auto-detects Vite: build `npm run
build`, output `dist`). `.env.local` (ElevenLabs key) stays gitignored.

---

## 9. Dev working notes
- Dev is highly visual, gives excellent gameplay feedback, iterates on look/feel.
- **The AskUserQuestion widget did not render for the dev** — ask questions in plain text.
- Dev wants it to "look and flow like an actual real kickball game" and to "blow
  everyone away." Flat characters were the #1 frustration → 3D fix in progress.
- Verify visuals with Playwright screenshots (the dev also watches the live dev server).
- Higgsfield 3D/video jobs: poll `job_status` with `sync:true`; videos ~1–3 min, 3D ~2–4 min.
- **The dev gives fast, blunt, rapid-fire feedback and watches generations live in his own Higgsfield
  account** (he deletes bad ones himself). NEVER claim an AI-generated asset is good without looking —
  for videos, ffmpeg a frame into the project dir and Read it; for gameplay, drive it (don't trust
  state flags or a subagent's self-assessment). Over-claiming "it works" off synthetic checks burned a
  lot of trust this session. See [[verify-gameplay-by-real-play]] and the video word-landmines in §7f.

---

## 10. SESSION 7 — GRAPHICS OVERHAUL PHASE 1: real mocap animation (2026-07-01)

Dev asked "how do we make this look like a PlayStation game" → found he already OWNS the
assets in the old Unity project (see [[skk-unity-asset-trove]]): 17+ Mixamo clips
(`GangsPack01/Animations`), SK_Gang characters, AND a 6GB NYC building environment pack.
Wrote the overhaul spec (`docs/superpowers/specs/2026-07-01-graphics-overhaul-design.md`,
4 phases: mocap → broadcast cams+replay → 3D world → polish) + Phase 1 plan
(`docs/superpowers/plans/2026-07-01-phase1-mocap-animation.md`), executed inline with the
dev watching/playtesting live. **PR #6 open (feat/graphics-overhaul), pending "push".**

**WHAT SHIPPED (Phase 1):** `MocapAnimator` (AnimationMixer + crossfades + manifest
contact events, same surface as GlbCodeAnimator which stays behind `?codeanim=1`);
`src/data/anims.manifest.json` (clip → game-action table w/ trims/rates/contact marks);
`tools/retarget.html` bake harness; per-archetype `public/assets/anims/mocap-<arch>.glb`.
Kicker strafes to line up (half-facing travel, dev call), fielders hold ball in
Goalkeeper stance, pitch ball launches ON the release frame, throws 1.4x, kick responds
in ~0.25s (clips trimmed to the action; release frames measured by peak hand/foot velocity).

**HARD-WON RETARGETING KNOWLEDGE (don't relearn — encoded in tools/retarget.js):**
- Correct method = WORLD-orientation transplant with per-bone REST-DIRECTION alignment
  (A-pose Meshy vs T-pose Mixamo). Three simpler methods all failed visibly: SkeletonUtils
  .retargetClip (folded waist), joint-space local deltas (yaw offset), parent-space local
  deltas (arms trailing behind / flared forearms — dev: "arms are fucked").
- ONE bake per archetype — each Meshy rig has its own rest pose; a shared bake distorts
  the other 5 (folded legs / floating characters).
- NEVER call skeleton.pose() on these GLBs (rewrites bone locals in bind units, x100 off);
  size characters from the HIPS BONE, not Box3 (skinned bounds disagree with node units by 100x).
- FBXLoader strips ':' from mixamorig names; Meshy spine chain is INVERTED (Spine02=lower,
  Spine=chest); 'Idle.fbx'+'SwaggerWalk.fbx' in the pack are UE-MANNEQUIN rigs (separate
  bone map in the harness); pack clips have HUGE lead-ins (Throwing.fbx = 5.6s for a 1s
  throw) → manifest trims are load-bearing.
- Chrome silently blocks repeated programmatic downloads → harness POSTs bakes to
  `scripts/anim-upload-server.mjs` (port 5199) which writes into public/assets/anims/.
- Dev supplied `Breathing Idle.fbx` (Mixamo) for idle/plate — the pack's idles were unusable.
- Chrome throttles rAF when the window is OCCLUDED — the game "freezing" during testing
  was window occlusion, not code. Foreground the window before judging behavior.

**DEV FEEDBACK CAPTURED:** catch cinematic is "horrendous — nothing correct or good
about it" (left in place, dies in the Phase 2 replay rebuild — priority raised); wants
the pitcher ROLLING the ball (waiting on his Mixamo "Bowling" download; pitch/throw clip
assignments swapped per his call; ball already launches on the release frame).

**NEXT:** dev phone-playtest + "push" for PR #6 → Phase 2 (broadcast cameras + real
instant replay, kill DOM speed-lines/stamps) → Phase 3 (NYC 3D world from the owned pack)
→ Phase 4 (DOF, grade, jersey numbers, foot-plant polish).

---

## 11. SESSION 7b — GRAPHICS OVERHAUL PHASE 2: broadcast cams + replays + balance (2026-07-01)

**BOTH PHASES SHIPPED TO PRODUCTION same session: PR #6 (mocap) and PR #7 (Phase 2),
each dev-authorized with "push".** All tuned live with the dev playtesting and reacting.

**PHASE 2 (`docs/superpowers/plans/2026-07-01-phase2-broadcast-cameras.md`):**
- `src/game/cameraDirector.js` — named SHOTS (pure fns of game ctx → pos/look/fovScale/
  stiffness), critically-damped springs, hard `cut()`. matchScene picks the shot
  (`chooseLiveShot`), camDir moves the camera. Kick/pitch input views keep EXACT legacy
  framing (input-critical). Contact = 0.4s low hero-cam CUT → telephoto tracker (0.55x
  lens) → crane on deep balls → runner cam that frames runner + TARGET BAG (dev call:
  "you gotta see 1st base"). `engine.baseFov` set by renderer resize; shots scale it.
- `src/cinematics/replay.js` — ReplayRecorder (6s ring buffer of every char's bone quats
  + hips pos + group transform + ball, 30hz fixed-cadence) + ReplayPlayer (letterboxed
  slow-mo playback from a low orbital telephoto, snapshots+restores live state, emits
  cine:start/done). Drives HOMER + PEG moments.
- **Catch celebration is NOT a raw replay** (dev: raw buffer window caught the chase and
  looked broken): staged live moment — fielder faces camera holding the REAL ball
  (holdball), Victory beat, then throws the actual ball back to the mound on the throw
  clip's release frame (`ball.throwTo`, hasBall cleared at onContact).
- DELETED: ComicShader/setComic, DOM speed-lines, spray-stamp play calls. Calls
  (SAFE!/OUT!/DOUBLE PLAY!...) are auto-hiding lower-thirds (`hud.call`); stamps remain
  only for instructional text (SWITCH!, PICKLE!). `.letterbox` bars via `hud.setLetterbox`.

**FIELDING/BALANCE PASS (dev: "impossible to win... game is pointless" — fixed):**
- Player defense AUTO-CHASES like the AI (tap/drag overrides); backup converges 2.5m
  behind the play — two fielders visibly pursue.
- AI defense beatable: `catchSkill` .5/.68/.85 (Rookie/Street/King), `fieldReactMs`
  560/430/280, `aiThrowDelayS` .7/.55/.4 — runners beat throws a fair share.
- CPU kick placement tighter (`aiAimDeg` 30→26) so its kicks land nearer coverage.

**GOTCHAS THIS PHASE:** PowerShell 5.1 mangles embedded double quotes in git -m
here-strings (message got split — avoid quotes in commit messages). Chrome throttles
rAF when the game window is OCCLUDED (looked like a frozen game — foreground before
judging). The dev's Chrome relaunch created a stale claude-in-chrome connection
(two "browsers" listed; the live one had to be re-selected).

**STILL OPEN:** pitcher's true underhand ROLL (waiting on dev's Mixamo "Bowling"
download — pitch currently uses the trimmed Throwing clip per his swap call).

---

## 12. SESSION 7c — PHASE 3 ATTEMPT: 3D world shipped, rejected, reverted (2026-07-01 night)

**Additional dev punch-list fixes shipped between phases (all live):** throw release
synced to the clip frame (PR #8 + steering/auto-chase/CPU-kick-variance fixes), fence
containment + no run-in-place + catch-clip trim + TAG-UP rule (PR #9).
**AUTO-PUSH granted** ("I'm on a phone, gonna need you to auto push edits") — merge
verified fixes without per-batch "push" (recorded in [[skk-deploy-playtest-workflow]]).

**PHASE 3 v1 (textured boxes) — SHIPPED (PR #10) THEN REVERTED (PR #11):** the pack's
FBX meshes decode with BROKEN UVs in FBXLoader (multi-UV UE-authored files; every face
samples one texel → black buildings). Fell back to textured BOXES using the pack's
facade atlases (window-grid ones only — T_WindowWall_A/B; the C/mural + plain-wall
atlases tile like wallpaper). Dev verdict on his phone: "looks like shit... both
sides" — pitcher view had NOTHING behind home (outfield-only arc), and boxes lose to
the old Higgsfield backdrop. **Reverted via `world3d:false` flag** — old backdrop back
on prod; ALL the world code/pipeline stays behind the flag.

**LESSONS (do not relearn):**
- The dev's own PWA URL confusion: production = **street-kickball-kings.vercel.app**;
  per-deploy hash URLs are FROZEN forever. ALSO: full-game matches play at the
  OPPONENT's home field (`opponentTeam.homeField`) — only Bullies matchups use the
  blacktop; `?match` harness always uses blacktop.
- The 3D world must beat the old backdrop ON THE DEV'S SCREEN before it ships, and
  must cover 360° (pitcher looks BEHIND HOME).
- FBX→web pipeline: FBXLoader ✗ (UV decode), assimpjs ✗ (converts all 68 incl. ones
  FBXLoader can't parse, but material/texture bindings broken + raw output blows
  vertex-attribute limits → WebGL CONTEXT LOSS). **Blender headless = the path**
  (dev approved install; `scripts/blender-convert.py` + winget install).
- Material name → pack texture mapping works: M_Walls_A → T_Walls_A_BaseMap.png
  (+ `_BaseColor` aliases created by copy-world.mjs; TEX_ALIASES map in worldbake.js
  for stragglers). Glass materials → translucent tint, no texture.
- `scripts/anim-upload-server.mjs` now accepts `world-*.glb` too (port 5199).

**NEXT:** Blender-convert the 68 meshes → real brownstones in worldbake (full 360°
layout already written) → side-by-side vs old backdrop on the dev's phone → only then
re-flip `world3d`. Then crowd strip re-add + dusk sky tuning. 104 tests green.

## 13) Session 8 (2026-07-02) — THE LIVING 3D CITY SHIPS (PR #12)

**Phase 3 v2 — Higgsfield image→3D, dev-demanded ("I want the 3d world. no
compromise. use higgsfield… full sky, full height… stunning… no lines where
you attach images"):** abandoned the Unity pack conversion entirely. Built the
whole city with the SAME pipeline that made the players:

- nano_banana image per archetype ("stylized 3D game asset render of a single
  <building>, three-quarter view, isolated on plain flat light-grey background,
  no readable text, not photorealistic, not cartoon") → `generate_3d`
  image_to_3d (should_texture) → GLB. Archetypes: brownstone, corner bodega,
  warehouse+water towers, 12-story pre-war tower, el-track viaduct section,
  subway train car.
- `gltf-transform optimize --compress meshopt --texture-compress webp
  --texture-size 1024`: ~10MB each → 0.6-0.9MB. 4.6MB total (old box bake was
  5.6MB — deleted). GLTFLoader needs `setMeshoptDecoder(MeshoptDecoder)`.
- `src/game/world/blacktop.js` REWRITTEN as runtime assembly: 26 instances from
  6 GLBs (clones share geometry), street disc, el line at z=-74 (stretched
  track clones), TRAIN CROSSES every 30s alternating direction, rooftop steam
  sprites, dusk sky panorama dome (r=232, inside the 240 gradient dome) with
  drifting clouds. Seam fix: blend a HALF-SHIFTED copy near the wrap point with
  triangular weight — provably continuous, one sun. Returns {group, update(t)};
  field.js chains update onto handles.updateCrowd.
- Behind-home block DENSE (7 buildings + 2nd-row tower/warehouse) — the v1
  "nothing behind home" complaint is dead.
- tools/worldbake.html now previews the REAL runtime module (no bake step).

**Verified:** preview from all 4 game POVs + real play on ?match (kick, pitch
arsenal, full loop) — 60fps, no console errors, 104 tests green. Dev said
"push"; PR #12 merged; production assets confirmed live via the prod PWA.

**Sky/asset jobs (Higgsfield):** images 1bb4259b/55ef5626/e67cd9f2/9696da3c
(buildings), d3c4371a (train), 68c3ad5d (track), 234d1e66 (dusk pano, in
public/assets/world/sky-dusk.png).

**NEXT:** dev verdict on his phone; then polish (street props/texture between
fence and buildings, window glow at dusk, maybe birds), other 9 city fields get
the same treatment, crowd strip re-add.

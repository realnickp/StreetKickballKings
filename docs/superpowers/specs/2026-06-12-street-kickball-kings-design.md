# Street Kickball Kings — Design Spec
*2026-06-12 — supersedes/extends the original `street-kickball-kings-spec.md` with all decisions made during brainstorming.*

## What this is

A complete, polished 3D arcade kickball game as a single-page web app (Vite + Three.js r160+ + Rapier physics), 60fps target on mid-range phones, later wrapped with Capacitor. **v1 is single-player vs AI only** — no online multiplayer, no local pass-and-play. Tested during development in a desktop browser on a touchscreen PC; every interaction must work by touch alone (mouse simulates a finger).

Art direction, audio direction, and "the feel" non-negotiables from the original spec stand: golden-era hip-hop street culture, stylized urban realism (NBA 2K Playgrounds / Hi-Fi Rush energy), heavy post-FX (UnrealBloomPass minimum), bass-heavy impact audio, menus that bounce to the beat.

## Locked decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Multiplayer | None in v1. AI opponents only (Rookie / Street / King). |
| Teams | 10: the 9 supplied logos + **Brooklyn Bullies** (logo generated with Higgsfield to match the mockup's graffiti ball-and-crown design). |
| Cinematic strategy | Hybrid, heavy on AI video: in-engine dynamic cinematics for live gameplay moments; Higgsfield-generated video for set pieces (splash, 10 team intro videos, championship scene). |
| Higgsfield budget | Go all out. Generate without per-batch approval. |
| "Red Rubber Felony" mp3 | Main game theme — title screen / main menu. |
| Seedance splash video | Plays every launch, tap to skip. |
| UI style | Blend: the mockup's dark-slate + orange/teal layout and palette, with 90s graffiti-texture accents. HTML/CSS overlay UI, not in-canvas. |
| Orientation | Portrait-first. Camera behind the kicker as in the mockup. |
| Mockup meta features | ALL in: daily challenges, win-streak tracker, team chemistry, gear/customization screen, special moves, pitch variety with speed readout. |
| Characters | Stylized low-poly in-engine (procedural, shared skeleton); AI video carries the photoreal glamour. |
| Rosters | All 80 players (8 × 10 teams) invented by Claude: street nicknames, distinct looks, Power/Speed/Arm/Glove stats. |
| Announcer | AI-generated hip-hop radio-DJ voice lines AND graffiti stamp overlays, blended. |
| Team anthems | One per team, genre-matched to city/identity (Philly Funk = funk-rap, Memphis = crunk, NY = boom bap, etc.). Generated with Higgsfield audio. |
| Team intro videos | All 10 teams, Higgsfield video, in the style of the supplied Monarchs seedance intro. |
| Special moves | Per-team signature super kick, meter charged by good plays. |
| Currency | Single currency (**Crowns**), earned only through play. No IAP, no second currency. |
| Spelling | **Phoenix Gilas** (text everywhere uses "Gilas" even though the logo art is stylized). |
| Build order | Feel-first vertical slice, but presentation-complete (intro, title, team select, coin toss, cutscenes, announcer all present from day one). Remaining teams/fields/players layer in afterward. |

## Architecture

Vite SPA. The WebGL canvas renders only the match world (field, players, ball, in-engine cinematics). All menus and HUD are HTML/CSS overlays — pixel-faithful to the mockup, cheap to animate, identical under Capacitor.

```
/src
  /engine      renderer, EffectComposer post-FX chain (bloom, chromatic aberration,
               vignette, speed lines), unified touch/pointer input, audio bus (music /
               SFX / VO ducking), asset loader with manifest
  /game        match state machine, pitch/kick/run/field systems, fielder+runner AI,
               special move system, Rapier physics world
  /cinematics  CinematicDirector (camera rigs, time remap, post-FX spikes, graffiti
               stamps), VideoCutscenePlayer (AI-generated mp4 set pieces)
  /ui          screen components: Splash, Title, MainMenu, TeamSelect, CoinToss, HUD,
               PostGame, SeasonHub, GearShop, Settings
  /meta        SaveManager (localStorage behind an interface, Capacitor-swappable),
               season engine, XP/Crowns, daily challenges, streaks, chemistry
  /data        teams.json, fields.json, players.json, tuning.json, assets.manifest.json
/assets        /logos /video /audio /textures — supplied files + Higgsfield output
```

All content is data-driven: a new team or field is a JSON entry plus asset files, zero code changes. All gameplay tuning (kick curves, AI reaction times, fence distances, tap-to-sprint mapping) lives in `tuning.json`.

## Controls (touch-only; mouse = finger)

**Kicking.** Pre-pitch: drag to set aim (left / center / right / bunt). The pitch rolls in with a visible pitch type and speed readout (Fastball / Curver / Bouncer / Changeup — e.g. "FASTBALL 82 MPH"). Tap to kick: the kicker visibly winds up, swings the leg, and the foot must be seen connecting with the ball. A shrinking timing ring governs quality: perfect ring contact = **slow-motion close-up cinematic of foot-to-ball contact, ball erupts in fire and lightning**, bass drop, screen shake; early/late = grounders and pop-ups.

**Base running.** When a runner can advance, **rapid tapping drives sprint speed** (faster mash = faster runner, with a cap and stamina-style falloff in `tuning.json`). **Swipe left / right while running to juke** sideways and dodge incoming peg throws. Tap-and-hold at a base = stay.

**Fielding.** Control auto-switches to the fielder nearest the ball. **Drag a finger and the fielder chases the finger position** (drag-to-move; no virtual joystick). Fly balls show a shrinking catch circle. Once the ball is held, **four base indicators appear — 1ST, 2ND, 3RD, HOME — with a PEG button in the center**; tap a base to throw to it, tap PEG to throw directly at the lead runner.

**Everything else** — menus, team select, coin toss call, cutscene skip, pause — is tap-driven.

## Match rules & systems

Classic kickball: AI pitcher rolls to the player when kicking; roles flip on defense. 3 outs per half-inning, 5 innings (configurable). Pegging a runner between bases is an out. Caught fly balls are outs.

**Special moves:** each team has a signature super kick (Monarchs *Crown Crusher*, Philadelphia Funk *Funkquake*, Snappers *Snap Back*, Marauders *Raid Rocket*, Metros *Rush Hour*, Kestrals *Talon Dive*, Gilas *Venom Strike*, Hustlers *Grind Mode*, Threshers *Jaws Drop*, Bullies *Bully Ball* — names finalized in `teams.json`). The meter charges from good plays (perfect kicks, catches, pegs); a full meter unlocks a special kick attempt with a team-themed particle cinematic and massively boosted power.

**AI:** difficulty scales reaction time, throw accuracy, pitch selection, and juke prediction across Rookie / Street / King, and ramps across a season.

## Cinematics

**In-engine (CinematicDirector)** — dynamic, replay-style, 3–5s, always tap-skippable, built as a reusable module:
- **Perfect kick:** time ramp to 0.2x at contact, crash-zoom on the foot, fire + lightning shader/particles on the ball, bloom surge.
- **Home run ("CROWNED!"):** ball-arc dolly cam, fireworks at The Crown, then the kicker breaks into a **Fortnite-style hip-hop dance celebration** (pulled from a pool of at least 4 dance animations so it varies).
- **Caught out ("ROBBED!"):** catch hero-angle, then cut to the kicker dejected — head down, hands on head, slow walk-off.
- **Pegged ("PEGGED!"):** ragdoll-lite stumble, comic graffiti stamp, replay angle.
- **Coin toss ceremony:** pre-match, in-engine — both captains at home plate, announcer call, slow-mo spinning coin, crowd roar, winner kicks first.
- Graffiti stamp overlays with spray-paint animation + sound sting for each event type.

**AI video (VideoCutscenePlayer)** — Higgsfield-generated mp4s: launch splash (the supplied seedance video), one hype intro video per team (team select / season start), season championship celebration, and special-move flourish shots where it elevates the moment.

**Announcer:** AI-generated radio-DJ voice lines ("OHHHH HE GOT PEGGED!") triggered by the same event bus as the stamps; lines pre-generated and shipped as audio files, several variants per event to avoid repetition.

## Teams, fields, rosters

10 teams, each with: home city, colors, logo, genre-matched anthem, signature move, intro video, and 8 invented players (street nicknames, distinct procedural looks — skin tones, hair, builds, fits, accessories — and Power/Speed/Arm/Glove stats shown as spray-painted bar tags).

Every field is a team's home turf (home team gets a small crowd-energy boost). Fields unlock via Season Mode milestones. Identical base layout for fairness; each has one subtle flavor (wind, echo, lighting) and a sub-200k-triangle budget with instanced crowds.

| # | Field | Home team | City flavor |
|---|---|---|---|
| 1 | The Blacktop *(starter)* | Brooklyn Bullies | schoolyard, chain-link, hand-painted bases, daytime |
| 2 | Subway Yard | New York Snappers | graffiti-bombed train cars, passing trains, sodium light |
| 3 | The Block Party | Philadelphia Funk | rowhouses, DJ booth, hydrant spray, dusk |
| 4 | Neon Night Court | Memphis Hustlers | Beale-Street neon, wet asphalt reflections, night |
| 5 | Boardwalk Kings | Los Angeles Threshers | Venice boardwalk, ferris wheel, gulls, golden hour |
| 6 | The Underpass | DC Metros | highway pillars, light shafts, metro rumble, echo |
| 7 | The Rubber Yard | Akron Marauders | tire-factory lot, smokestacks (Rubber City) |
| 8 | Winter Classic | Chicago Kestrals | snow-dusted blacktop, breath vapor, holiday lights |
| 9 | The Scorchyard | Phoenix Gilas | desert lot, saguaros, heat haze, sunset |
| 10 | The Crown *(final)* | Maryland Monarchs | **Baltimore** championship street stadium, fireworks, gold |

*(The original spec's Rooftop Rumble and Hilltop Projects were replaced by The Rubber Yard and The Scorchyard so every field reps its team's real city.)*

Characters: low-poly stylized humanoids (~3–6k tris) on a shared skeleton with swappable parts. Animation set: personality idles, run, kick (normal + crushed), throw, catch, dive, peg-stumble, ≥4 hip-hop dance celebrations, dejected walk-off.

## Game modes

- **Quick Match** — any unlocked team + field vs AI.
- **Season Mode** (progression spine) — 9 games + playoffs vs the other 9 teams; wins earn Respect (XP) and Crowns; milestones unlock fields; championship at The Crown unlocks a golden jersey.
- **Home Run Derby** — 10 pitches, local distance leaderboard.
- **Practice Yard** — sandbox + mechanic tutorials.

## Progression & meta

- **Respect (XP):** profile titles Rookie → Hustler → Baller → Legend → King.
- **Crowns:** single play-earned currency; buys jersey colorways, sneakers, accessories, celebration dances in the Gear screen.
- **Daily challenges** (e.g. "Hit 3 home runs — 2/3 — 500 XP"), **win-streak tracker**, **team chemistry** (grows with games played on a roster; small stat boost, shown as the mockup's chemistry ring).
- **SaveManager:** localStorage behind an interface, plus export/import save codes; Capacitor storage swap later.

## UI / UX flow

Splash video (skippable) → Title (logo + Red Rubber Felony + tap to start) → Main menu (mockup home-screen style: profile, streak, rank, daily challenge card, big PLAY button, mode cards) → Team select (rotating 3D showcase, logo, anthem snippet, intro video, spray-paint stats) → Field select (Polaroid snapshots, locked = spray-painted outline) → Coin toss → Match (HUD: LED-bodega score bug, spray-dot innings/outs, timing ring, special meter) → Post-game mixtape stat screen → Season hub.

Settings: audio sliders, graphics quality High/Low (full post-FX vs bloom-only), control sensitivity. Pause: resume / restart / settings.

## Higgsfield asset plan ("go all out", generated without per-batch approval)

- **Images:** Brooklyn Bullies logo, field ground textures, graffiti decals, skyboxes, crowd billboards, menu backgrounds, Polaroid field snapshots, team-themed UI accents.
- **Video:** 10 team intro videos (Monarchs-seedance style), championship celebration, special-move flourishes.
- **Audio:** 10 genre-matched team anthems (Red Rubber Felony is the *game* theme, separate from the Monarchs' anthem), in-match beat rotation, announcer VO set (multiple variants per event), crowd beds, record-scratch transitions, bass-drop stings.

Supplied assets used as-is: 9 team logos, both game-logo graphics, seedance splash video, Red Rubber Felony (title/menu theme).

## Build phases

1. **Vertical slice (presentation-complete):** Monarchs vs Snappers on The Blacktop. Full flow: splash → title → team select → coin toss → complete match (kick/run/field/score, all cinematic types, announcer, special moves) → post-game. First Higgsfield batch: Bullies logo, 2 intro videos, core VO, Blacktop textures + skybox.
2. **Feel pass:** user plays on the touchscreen PC; tune kick timing, tap-to-sprint mapping, shake, slow-mo, AI difficulty via `tuning.json`.
3. **League expansion:** all 10 teams, 80 players, 10 fields, Season Mode.
4. **Meta + asset blowout:** daily challenges, streaks, chemistry, Gear shop; remaining intro videos, anthems, full VO, skyboxes; Derby + Practice Yard.
5. **Polish:** phone performance, quality toggle, Capacitor prep.

## Testing

- Match-engine logic (state machine, outs/scoring, base-running rules) unit-tested headlessly (Vitest) — physics mocked where needed.
- Feel/visuals validated by hand on the touchscreen PC each phase.
- Performance checks against the 60fps / sub-200k-triangle budgets per field.

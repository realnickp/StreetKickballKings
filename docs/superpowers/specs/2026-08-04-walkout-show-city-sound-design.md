# Walkout Show, City Sound, Kick Timing (2026-08-04)

Dev request via remote control 2026-08-04. Five items, one round. Same law as
the fun drop: every feature must be SEEN/UNDERSTOOD/FELT on the phone.

## 1. The lineup ALWAYS shows

Two root causes found:
- **Extras race**: the real flow fires `loadExtrasFor` behind the intro videos
  without awaiting (main.js:285). Lose the race → `canThriller` false → legacy
  parade. The dev reads that as "no lineup".
- **Accidental skip**: any tap during `cinematicLock` emits `cine:skip`
  (matchScene.js:3187) and the walkout's cleanup kills the WHOLE show. A stray
  tap coming off the coin toss nukes it.

Fixes:
- `startMatchFlow` passes the `loadExtrasFor` promise into the scene as
  `extrasReady`. `lineupIntro` holds on the STARTING LINEUPS stamp + away
  splash (already ~3.9 s of show) and gates the thriller-vs-legacy decision on
  `Promise.race([extrasReady, cap])` with a 5 s cap past the splash — the
  choreographed show becomes near-guaranteed; legacy is a slow-network fallback.
- Walkout skip is a deliberate **SKIP ⏭ chip** (bottom corner, HUD). While
  `walkoutActive`, generic taps do NOT emit `cine:skip`. HR / caught-out /
  victory lap keep tap-anywhere-to-skip — fast play still wins there.

## 2. Broadcast camera package

Replace the single low dolly with a deterministic shot table, cutting on the
card beat (2.3 s), same grid both squads:

| beat | shot |
|---|---|
| 1 | low front dolly, slow push (current look) |
| 2 | side rail track, left → right across the wedge |
| 3 | captain close-up, slow push-in at chest height |
| 4 | high crane settling down toward the formation |
| 5+ | wide 3/4 drift until the segment ends |

Cuts are hard (no lerp between shots — broadcast style). The formation drift
toward camera stays. Shot table lives next to the walkout code as data.

## 3. Crew signature routines (choreographed, per team)

Each team owns a two-part routine (partA → partB at the existing +4.6 s
switch), frame-synced across the squad exactly as today (one `play()` burst).
Assignments by crew personality:

| team | partA → partB |
|---|---|
| monarchs (Baltimore) | thriller1 → thriller2 (their identity — the crown) |
| snappers (New York) | danceLock → danceTut |
| bullies (Brooklyn) | danceStep → danceLock |
| liberty (Philadelphia) | danceWave → danceTut |
| rubber (Akron) | danceStep → danceWave |
| capitals (Washington DC) | danceTut → danceStep |
| wind (Chicago) | danceLock → danceWave |
| scorch (Phoenix) | danceSilly → danceStep |
| soul (Memphis) | danceChicken → danceSilly |
| angels (Los Angeles) | danceWave → danceLock |

(Team ids above are illustrative where unknown — implementation reads
teams.json ids and maps ALL ten; any unmapped team defaults to thriller1→2.)
Away plays ITS routine, home plays ITS routine — two different shows per
match, both choreographed. Clip-missing fallback: thriller pair → legacy.
Home/away sharing a clip is fine — they never dance simultaneously.

## 4. City soundtracks (hip hop, per field)

Ten ~60 s loopable instrumentals, generated (Higgsfield, ultra plan), placed
at `public/assets/audio/music/city/<city-slug>.mp3`, registered in
`FILES.music` as `city-<slug>` with the existing `beat` pair as fallback.
`main.js` swaps `audio.music('beat')` → `audio.music(cityTrack(homeField))`
at both call sites; the track scores the walkout AND the match.

| city | dialect |
|---|---|
| Baltimore | B-more club breaks × hip hop |
| New York | 90s boom-bap |
| Brooklyn | drill |
| Philadelphia | soul-sample boom-bap |
| Washington DC | go-go swing |
| Chicago | drill (dark piano) |
| Memphis | phonk / crunk |
| Los Angeles | G-funk |
| Phoenix | lowrider desert trap |
| Akron | moody midwest bounce |

All instrumental, no vocals, loop-friendly, mixed mids-forward for phone
speakers, ducked under VO by the existing music channel gain.

## 5. Kick winds up BEFORE the ball arrives (feel fix)

Root cause: the AI swing is scheduled at `dur + clamp(errMs)` — AT/after
arrival — and the launch then waits `contactDelayS(clip)` for the clip's
contact frame, so the ball visibly dies at the plate mid-windup
(matchScene.js:1008-1011 + the `_kickApproach` glide).

Fix: back-time the clip. AI path schedules `attemptKick` at
`arrival + err − contactDelayS('kick')` (floored at 0.05 s) so the contact
frame lands ON the judged moment and the foot meets a live ball. Player path:
kick clip plays at a slightly faster rate (~1.3×) to tighten tap → contact;
the approach glide stays as the mask for human reaction latency.

## Testing & verification

- vitest: team-routine map integrity (all teams resolve to real clip names);
  AI swing back-timing math (pure helper).
- Real-play pass in the harness: lineup shows with cold extras cache
  (throttled), all shots cut on beat, two different routines per match, SKIP
  chip works and stray taps don't, city track audible per field, AI kick
  contact meets the ball.
- Merge by PR; deploy on the dev's explicit "push".

## Out of scope

- Licensed music (all tracks are generated originals).
- New dance clips (routines use the shipped 10-clip pool).
- Crowd/announcer changes.

## Playtest results (2026-08-04, harness, virtual-clock frame stepping)

- Lineup gate resolves instantly with warm extras (squadOn at the original
  3.9 s mark — timeline byte-identical when nothing needs waiting).
- Stray tap mid-walkout: show survives. SKIP chip tap: show ends cleanly.
- Camera package cuts confirmed on the beat: front dolly → side rail →
  captain close-up (screenshots captured) through both squad segments.
- Two routines per match confirmed: Monarchs thriller1→2, Snappers
  danceLock→danceTut, both 8/8 frame-synced.
- AI kick back-timing measured live: worst-case late roll (err clamped
  +0.45 s) still starts the clip 0.05 s BEFORE arrival with contact on the
  judged moment; average kicks start ~0.35 s before. The ball no longer dies
  at the plate mid-wind-up.
- City tracks generated (10/10, sonilo_music, ~2.3 MB each), downloaded to
  assets, registry green. Audible check is on the phone — WebAudio needs a
  real gesture; the loader path and fallback are unit-tested.

# Fun Overhaul Pillar B — KNOW IT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every element and heat event is TAUGHT (intro card), TELEGRAPHED (procs already flash), and PAID OFF (banners with numbers + announcer voice). Effects retuned arcade-loud.

**Architecture:** Teach strings ride the existing element registry → `element:roll` payload → new full-screen intro card in the HUD. Payoff banners hook the exact scene moments that already detect each payoff. VO rides the existing resumable ElevenLabs pack (spend approved 2026-07-21 "vo approved, just do it"). Branch `feat/overhaul-b-know-it` stacked on F (#71).

## Global Constraints

- Phone-player test; all new text through Pillar A's self-fitting popups or the new card (which must pass popup-e2e).
- Retune rule: if a change can't be noticed in a single play, it's too subtle.
- VO: extend `scripts/gen-announcer.mjs` EVENTS; it is resumable and rebuilds manifest.json; audio bus plays any manifest key via `bus.emit('vo', key)`.

## Discovered anchors

- `cityElements.js` registry has `label` per id; roll payload flows via `element:roll` → `hud.setElement` (matchScene ~178) and first roll happens at match start; `bus.emit('vo', 'element-<id>')` already fires (~268).
- Procs flash via `element:proc` → `hud.flashElement` + center callout (~180).
- Payoff moments already detected in matchScene: GRD double (`grdFired` block ~3188), HOT JUMP call (`startSteal` ~994), beat bonus (`elMods.beatBonus01` in attemptKick), carry scale (`this.elements.carryScale()` at launch ~792), ON FIRE (`noteHeat` ignition).
- `gen-announcer.mjs`: EVENTS map → `<event>_<i>.mp3` per voice; manifest events keys = bus vo keys.

### Task 1: Teach strings + intro card
- Registry: add `blurb` (what it does) + `tip` (what YOU do) per element; include in the roll event payload.
- `hud.elementIntro({ id, label, blurb, tip })`: full-screen dark card — big icon (ELEMENT_ICONS), huge label, blurb line, gold tip line, "TAP TO PLAY" hint; auto-dismiss 4.5s or tap; fires ONCE per match on the first roll; later rolls get the existing badge update + a compact `hud.callout` ("THE HAWK ▲▲▲ NOW BLOWING OUT").
- CSS: `.element-intro` overlay (z above HUD, below nothing), marker font, safe-area padded; verify via popup-e2e-style rect check + screenshot.

### Task 2: Payoff banners with numbers
- HOT JUMP call → `hud.call('HOT JUMP! LEAD ×2', 'crowned')` (already exists as plain HOT JUMP).
- Beat bonus player kick (beatBonus01 > 0): `hud.call('ON THE BEAT! +POWER', 'homer')`.
- GRD: banner text becomes `GROUND RULE DOUBLE — OVER ON A HOP!`.
- Heavy air kill: on a caught/dead deep ball (landDist > fence×0.75) while `carryScale() < 0.95` → `hud.call('HEAVY AIR ATE THAT BOMB', 'robbed')`.
- Heat-wave carry homer: HR while `carryScale() > 1.05` → after the homer banner, `hud.callout('THE HEAT CARRIED IT!')`.
- All fire the matching `vo` where a line exists.

### Task 3: Arcade-loud retune (visible in ONE play)
- `cityElements.js`: heavy-air carry ×0.91→×0.78; heat-wave carry ×1.08→×1.2 (fatigue floor stays); steam fielder slow ×0.75→×0.6; hawk accel 3.4→4.6·i; sea-breeze constant wind +35%; night-hustle lead bonus 1.5→2.2m·i; motorcade zip 17.2→15.5; el-train wobble ±45→±60ms·i.
- `crewHeat.js`: fire buffs kick ×1.12→×1.25, fielders ×1.12→×1.2, throws ×1.15→×1.25.
- Update any unit tests pinning old values — the NEW values are the spec; tests assert the new constants.

### Task 4: Announcer VO (spend approved — run it)
- EVENTS additions (2-3 lines each, street-hype register): `element-el-train, element-steam-vents, element-dj-drop, element-night-hustle, element-sea-breeze, element-motorcade, element-extra-bounce, element-the-hawk, element-heat-wave, element-heavy-air, fire, ball, walk`.
- Run `node scripts/gen-announcer.mjs` (resumable; existing files skip). Verify manifest gained the keys and mp3s exist for both voices.

### Task 5: Sweep + PR
- vitest exit 0 (incl. updated constants tests), popup-e2e ALL PASS, browser screenshots: intro card on match start, a payoff banner, badge re-roll callout. PR stacked on F.

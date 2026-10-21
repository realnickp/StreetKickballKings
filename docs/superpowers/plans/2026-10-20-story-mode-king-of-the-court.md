# Story Mode: King of the Court — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The whole story mode: create your crew, climb five regions (ladder → bracket) and Nationals
to King of the Court, told as phone-text scenes over Higgsfield stills, with recruiting and coin
training that really changes play.

**Architecture:** Headless meta modules (`src/meta/story*.js`, pure functions over a plain `story`
save object, unit-tested) drive thin DOM screens (`src/ui/screens/story*.js`) that hand a team pair
to the existing `startMatchFlow` and read the existing `matchOver` event. All story content is data
(`src/data/story/*.json`). Player stats start mattering only in story matches (`useStats` flag on
`MatchScene`), so Quick Play balance is untouched.

**Tech Stack:** vanilla JS ES modules, Vite 8, three.js, Vitest 4, Playwright (scripts/), Higgsfield
MCP for images, sharp for image post-processing.

**Spec:** `docs/superpowers/specs/2026-10-20-story-mode-king-of-the-court-design.md`
**Workspace:** worktree `C:\Users\nickp\OneDrive\Desktop\skk-story`, branch
`feat/story-mode-king-of-the-court` (off main `3be21d0`). Baseline: 77 files / 700 tests green.
Dev scope change (2026-10-20): "build the entire game" — all phases below, not Round 1 only.
Higgsfield credits pre-approved ("use whatever… no need to ask").

## Global Constraints

- The player names the CREW only (one short name, ≤ 14 chars). Never ask the player to name players.
- No video cinematics; story = phone scenes over stills. No aliens. Text must fit a 390-px-wide phone.
- Free path always beatable; no paid random packs; ads/IAP = stubbed hooks only (`storyHooks.js`).
- Stats affect play ONLY when `MatchScene({ useStats: true })` (story matches). Quick Play unchanged.
- Coins = the existing `crowns` save key (🪙 on the menu). Do not add a second currency.
- Every save read/write goes through `SaveManager`; story state lives under the single key `story`
  with `v: 1`.
- Character bodies come from the GLB archetype pool via `casts` (no new 3D models).
- Audio checks: headless muted chromium + `?mute` only — never Chrome MCP tabs for game checks.
- Merges to main and deploys are gated on the dev saying "push".
- Commit author: `Nicholas Patrick <realnickpatrick@gmail.com>` (repo config set); trailer lines per
  session attribution.

## Review Focus

1. **Save written mid-match then app killed** — reopening must land on the hub at the same stop,
   never a half-applied result (result applied in ONE `save.set('story', …)` after `matchOver`).
2. **Quitting a story match from PAUSE → MAIN MENU** — counts as nothing (no loss, no coins), and
   `ctx.storyStop` is cleared so the next Quick Play is not treated as story.
3. **A crew without `introVideo` / sprites** (yours and all 15 new crews) — the match flow skips the
   intro video and the clash still shows the logo; nothing awaits a 404.
4. **Recruit decline / every block player benched** — the roster is always exactly 8; declining keeps
   it; benched players can be swapped back; a recruit can never be offered twice.
5. **Old saves** (players with RUN THE MAP trophies, no `story` key) — menu and Locker keep working;
   gear unlocked by `crews`/`king` milestones still unlock (King of the Court sets `kingOfStreets`).

Each line has its pinning test in the owning task (Tasks 2, 9, 9, 4, 10).

---

## Phase A — The engine (headless, unit-tested)

### Task 1: Story map data + ladder order

**Files:**
- Create: `src/data/story/regions.json`
- Modify: `src/data/teams.json` (add `region` to the 10 existing crews)
- Test: `tests/storyRegions.test.js`

**Interfaces:**
- Produces: `regions.json` = `{ regions: [{ id, name, tag, ladder: string[] }], nationals: { finalField: 'the-crown' } }`.
  Region ids in order: `east, midwest, south, southwest, west`. `ladder` = 5 team ids, weakest → strongest.
  Names: `THE EAST`, `THE MIDWEST`, `THE SOUTH`, `THE SOUTHWEST`, `THE WEST COAST`.

- [ ] **Step 1: Write the failing test** — `tests/storyRegions.test.js`:
  - five regions, ids in the order above, each ladder length 5, no team id in two regions;
  - every ladder id exists in `teams.json` and that team's `region` equals the region id;
  - each ladder is ascending by roster stat average (`avg of power+speed+arm+glove over roster`), ties allowed.
  (Midwest/South/Southwest/West ladders reference the new crew ids from Task 12; until Task 12 lands,
  mark the cross-check for those four `it.todo` → flip to `it` in Task 12.)
- [ ] **Step 2: Run** `npx vitest run tests/storyRegions.test.js` → FAIL (file missing).
- [ ] **Step 3: Write `regions.json`** — East ladder = the five East crews sorted by stat average
  (compute it, don't guess); the other four ladders list their crews by the ids fixed in Task 12
  (`midwest: marauders, kestrals, detroit, stlouis, cleveland` etc. — order finalized in Task 12).
  Add `"region"` to the 10 crews: monarchs/snappers/bullies/funk/metros = east, marauders/kestrals =
  midwest, hustlers = south, gilas = southwest, threshers = west.
- [ ] **Step 4: Run** → PASS (todos pending). Full suite still green.
- [ ] **Step 5: Commit** `feat(story): the map — five regions, ladders weakest to strongest`

### Task 2: Story state machine

**Files:**
- Create: `src/meta/story.js`
- Test: `tests/story.test.js`

**Interfaces:**
- Consumes: `regions.json` (Task 1).
- Produces:
  - `crew = { name, primary, secondary, mark }` (from Task 7).
  - `newStory({ crew, roster }) -> Story` where `Story = { v:1, crew, roster: Player[8], bench: Player[], region: 0, rung: 0, phase: 'ladder', finals: {}, beaten: string[], recruited: string[], seen: string[], king: false }`
  - `currentStop(story, map) -> Stop` where `Stop = { kind: 'ladder'|'semi'|'final'|'nationals'|'king', regionId, teamId, index, total, progress01, fieldId|null }`
    — ladder rungs `0..4`; then `semi` vs `ladder[3]`, `final` vs `ladder[4]`; after region 4's final,
    `nationals` runs index 0..4 against `finals[regionId]` for each region in order (`fieldId` =
    `'the-crown'` on the last one, else null = rival's home field); then `king`.
    `progress01` = stop ordinal / total stops (5×7 + 5 = 40), used for rival scaling.
  - `applyResult(story, map, { won: boolean }) -> { story: Story, events: string[] }` — pure (returns a
    new object). Loss: no movement, events `['loss']`. Win events, in order, from:
    `'win'`, `'rungUp'`, `'bracket'` (entered semi), `'final'`, `'regionChamp'`, `'nationals'`, `'king'`.
    Records `beaten` (unique), and `finals[regionId] = teamId` when the final is won.
  - `markSeen(story, sceneId) -> Story`.
  - `STORY_KEY = 'story'`, `loadStory(save) -> Story|null`, `saveStory(save, story)` (single `save.set`).

- [ ] **Step 1: Write the failing tests** — `tests/story.test.js`:
  - `newStory` → `currentStop` = `{kind:'ladder', regionId:'east', teamId: east.ladder[0], index:0}`;
  - 5 wins → `kind:'semi'` vs `ladder[3]`; a semi LOSS keeps semi; semi win → final vs `ladder[4]`;
    final LOSS → back to `semi` (spec §4: re-enter from the semi);
  - final win → events include `'regionChamp'`, next stop is midwest ladder 0, `finals.east` set;
  - after the west final: stop is `nationals` index 0 vs `finals.east`; index 4 has `fieldId:'the-crown'`;
  - 5 nationals wins → events end with `'king'`, `story.king === true`, stop `kind:'king'`;
  - `applyResult` does not mutate its input (deep-freeze the input in the test);
  - Review Focus #1: `loadStory` on a save whose `story` holds an unknown `v` returns null; `saveStory`
    writes exactly once (spy on `save.set`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/meta/story.js`. Stop ordinal: region r ladder i → `r*7+i`; semi `r*7+5`; final `r*7+6`; nationals k → `35+k`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(story): the climb — ladder, bracket, nationals, king (pure state machine)`

### Task 3: Economy + training

**Files:**
- Create: `src/meta/storyEconomy.js`
- Modify: `src/data/tuning.json` (add `story` block)
- Test: `tests/storyEconomy.test.js`

**Interfaces:**
- Produces:
  - `tuning.story = { pay: { ladderWin: 60, loss: 15, semiWin: 90, finalWin: 150, nationalsWin: 200, regionBonus: 250 }, train: { base: 40, perLevel: 25, cap: 10 }, statMult: { power: 0.03, speed: 0.025, arm: 0.03, glove: 0.04 }, rival: { boostStart: -2, boostEnd: 3, tiers: [[0.3,'Rookie'],[0.7,'Street'],[1.01,'King']] } }`
  - `payout(stop, won, events, tuning) -> number` (regionBonus added when events has `'regionChamp'`).
  - `trainCost(level, tuning) -> number` = `base + perLevel * level`; `Infinity` at cap.
  - `train(story, save, playerId, stat, tuning) -> { ok, story, cost, reason? }` — spends `crowns`,
    `+1` that stat on that roster player; `reason: 'broke'|'maxed'|'noPlayer'`.
  - `storyHooks.js` (same task): `offerDoubleCoins() -> Promise<false>`, `buyCoins(pack) -> Promise<false>` — stubs.

- [ ] **Step 1: Failing tests** — payout table values above; `trainCost(4)` = 140; `train` with 139
  crowns → `broke` and no write; with 140 → stat 4→5, crowns 0; at 10 → `maxed`; unknown id → `noPlayer`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(story): coins and training — slow, deterministic, capped at 10`

### Task 4: Your crew + recruiting

**Files:**
- Create: `src/data/story/crewKit.json`, `src/meta/yourCrew.js`, `src/meta/recruit.js`
- Modify: `src/game/glbCharacters.js` (`castSlotFor`)
- Test: `tests/yourCrew.test.js`, `tests/recruit.test.js`

**Interfaces:**
- Produces:
  - `crewKit.json` = `{ swatches: [{ id, primary, secondary }] (10), marks: ['mark-01'…'mark-12'], blockNames: string[] (≥ 24 street nicknames), positions: [8 strings matching teams.json pos values] }`.
  - `cleanCrewName(raw) -> string|null` — uppercase, keep `[A-Z0-9 '&.-]`, collapse spaces, trim, 2–14
    chars, reject a small blocklist; null when invalid.
  - `makeBlockRoster(seed) -> Player[8]` — deterministic; each `{ id:'b1'…'b8', nick, pos, number, stats:{power,speed,arm,glove}, cast:{archetype, skin, height, build, accessory} }`; stats integers 2–6, roster average 3.6–4.4, each player has exactly one stat ≥ 6 ("one standout"); 8 distinct archetypes, none = 17 (benched).
  - `crewTeam(story) -> Team` — a `teams.json`-shaped object: `id:'yours'`, `city:'THE BLOCK'`, `name: story.crew.name`, `colors {primary, secondary, accent: secondary}`, `logo` (from Task 13's `tintedMarkUrl`; until then `assets/logos/stock/<mark>.png`), `kits` (dark `#16161a` + light = primary, inks via `inkFor`, `logo` = the mark id), `introVideo: null`, `sprites: []`, `special: { id:'block-boot', label:'BLOCK BOOT' }`, `homeField:'blacktop'`, `musicGenre:'block'`, `status:'story'`, `roster: story.roster`.
  - `castSlotFor(team, i)` returns `team.roster[i].cast` when present, else the casts.json lookup (unchanged).
  - `recruitOffer(story, team) -> Player|null` — from the beaten crew's roster, excluding `story.recruited` ids (`${team.id}:${p.id}`), pick the player whose best stat is highest, tie-break on the stat your crew's average is weakest in; copies `cast` from `castSlotFor(team, i)`; sets `from: team.id`, `id: `${team.id}:${p.id}``.
  - `acceptRecruit(story, offer, benchId) -> Story` — offer takes the benched player's slot; benched player → `story.bench`; `recruited` += offer.id. `declineRecruit(story, offer) -> Story` — recruited += offer.id (never re-offered).
  - `swapBench(story, rosterId, benchId) -> Story`.

- [ ] **Step 1: Failing tests** — `cleanCrewName('  east side  kings ') === 'EAST SIDE KINGS'`; 15 chars → null; `'a'` → null; blocklisted → null. `makeBlockRoster(7)` twice → deep-equal; constraints above for seeds 1..50. `crewTeam` passes the same shape asserts `tests/data.test.js` applies to teams (reuse its helper if one exists). `castSlotFor({roster:[{cast:{archetype:3}}]},0).archetype === 3`.
  Recruit (Review Focus #4): offer never repeats after accept or decline; roster length stays 8 after accept, decline and swap; swapping a bench player back restores them.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, full suite green.
- [ ] **Step 5: Commit** `feat(story): your crew from the block, and the ones who join you`

### Task 5: Stats that matter + rival scaling

**Files:**
- Create: `src/game/playerStats.js`, `src/meta/rivals.js`
- Modify: `src/game/matchScene.js` (`constructor`, `attemptKick`, `newRunnerSim`, `throwSpeed`, `catchRadius`)
- Test: `tests/playerStats.test.js`, `tests/rivals.test.js`

**Interfaces:**
- Produces:
  - `statMult(stat: 'power'|'speed'|'arm'|'glove', value: number, tuning) -> number` = `1 + (value - 5) * tuning.story.statMult[stat]`, value clamped 1–10.
  - `MatchScene` option `useStats = false`. When true: kick `powerMult *= statMult('power', kicker.data.stats.power)`; runner sims get `speedMult *= statMult('speed', runnerChar.data.stats.speed)` (both sides); `throwSpeed()` × `statMult('arm', avg arm of fielding side)`; `catchRadius()` × `statMult('glove', active fielder's glove)`. When false every path is byte-for-byte the old one.
  - `rivalTeam(team, stop, tuning) -> { team: Team, difficulty: 'Rookie'|'Street'|'King' }` — clone; every roster stat += `round(lerp(boostStart, boostEnd, stop.progress01))`, clamped 1–10; difficulty from `tiers` by `progress01`.

- [ ] **Step 1: Failing tests** — `statMult('power',5)` = 1, `('power',10)` = 1.15, `('glove',1)` = 0.84, clamps 0→1 and 12→10. `rivalTeam` at progress 0 → stats −2 and `Rookie`; at 1 → +3 and `King`; input not mutated. A MatchScene unit test is not practical (WebGL): instead export the four modifier hooks as small pure helpers from `playerStats.js` (`kickPowerFor(char, useStats, tuning)`, `runSpeedFor`, `throwArmFor(chars, …)`, `gloveFor`) and test them; `matchScene.js` only calls them.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement + wire.** **Step 4: Run** → PASS, full suite green (Quick Play untouched — the existing 700 tests are the guard).
- [ ] **Step 5: Commit** `feat(story): training is real — stats move the kick, the legs, the arm, the glove`

---

## Phase B — The screens

### Task 6: The phone scene player

**Files:**
- Create: `src/ui/screens/storyScene.js`, `src/ui/story.css` (imported from `ui.css` or `main.js`)
- Create: `src/meta/storyText.js` (placeholder fill)
- Test: `tests/storyText.test.js`; Playwright: `scripts/story-scene-check.mjs`

**Interfaces:**
- Consumes: scene JSON (schema below), `ctx.audio`, `ctx.bus`.
- Produces:
  - Scene schema: `{ id, still, music?, title?: { top, sub }, threads: [{ kind:'group'|'dm', name, avatar?, messages: [{ from, text, me?: boolean }] }], slam? }`.
  - `fillText(text, vars) -> string` — replaces `{crew}`, `{captain}`, `{rival}`, `{recruit}`, `{city}`; unknown tokens left as-is.
  - `playStoryScene(root, scene, { audio, bus, vars }) -> Promise<void>` — resolves when finished or skipped. Port the approved mockup `C:\Users\nickp\OneDrive\Desktop\streetkickballkings\.superpowers\brainstorm\405-1792542344\content\story-phone-scene.html` (drift/zoom still, title, phone swing-up, typing dots + `crown-tick` ping per message, thread flip, slam). Messages auto-advance (typing 700 ms + 55 ms/char, max 2.2 s); tap = next message now; `SKIP ▸` button = jump to the end state then resolve on tap. Music: `audio.music(scene.music ?? 'beat')`, restored by the caller.
- [ ] **Step 1:** Failing `fillText` tests (all tokens, unknown token kept, no `{` left for a full var set).
- [ ] **Step 2–4:** Implement → PASS.
- [ ] **Step 5:** `scripts/story-scene-check.mjs` (pattern: `scripts/round-e2e.mjs`, headless chromium, `?mute&nosplash&go=storyDev`) asserts at 390×844: messages appear in order, no bubble overflows the phone (`scrollWidth <= clientWidth`), tap advances, SKIP resolves. Add the `storyDev` route (dev only: plays a fixture scene from `src/data/story/fixtures/test-scene.json`).
- [ ] **Step 6: Commit** `feat(story): the phone over the street — the scene player`

### Task 7: Create Crew screen

**Files:** Create `src/ui/screens/createCrew.js`; Modify `src/main.js` (register `createCrew`); Playwright step in `scripts/story-e2e.mjs`.
**Interfaces:** Consumes `cleanCrewName`, `makeBlockRoster`, `newStory`, `saveStory`, `crewKit.json`. Produces route `createCrew` → on CONFIRM saves a new story and goes to `storyIntro` (Task 8).
- [ ] Layout (one screen, phone-first): name field (placeholder `CREW NAME`, maxlength 14, inline error "2–14 letters"), swatch row (10), mark grid (12, tinted live to the chosen primary), a live preview badge (logo + name on the primary). CONFIRM disabled until valid. Seed = `Date.now()`.
- [ ] Playwright: type `east side kings`, pick swatch 3 + mark 5, CONFIRM → `save.story.crew` = `{ name:'EAST SIDE KINGS', primary, secondary, mark:'mark-05' }`, roster length 8.
- [ ] Commit `feat(story): name your crew — one name, your colors, your mark`

### Task 8: Story hub + crew room

**Files:** Create `src/ui/screens/storyHub.js`, `src/ui/screens/crewRoom.js`; Modify `src/main.js`.
**Interfaces:**
- Route `storyIntro`: plays scene `prologue` (Task 14 content) then `east-open`, marks seen, → `storyHub`.
- Route `storyHub`: region title + tag, the ladder as five rungs (beaten = 👑, current = lit, locked = dim) + a bracket node + a NATIONALS node; the next opponent card (logo, name, city, "RUNG 3 OF 5" / "SEMI" / "FINAL" / "NATIONALS 2 OF 5"); buttons `PLAY` (big, lit), `CREW` → `crewRoom`, `MENU`; 🪙 balance top-right. On entering a region whose `${region}-open` is unseen, play it first.
- Route `crewRoom`: 8 player cards (nick, pos, four stat bars, `+` per stat with cost, disabled when broke/maxed, `from` badge for recruits) + bench strip (tap bench then roster player = swap). Calls `train` / `swapBench`; re-renders. An `EDIT CREW` button reopens `createCrew` in edit mode (name/colors/mark only; roster and progress kept) — spec §2 "editable later".
- After `king`: the hub shows every beaten crew as REPLAY (coins at ladder rates, no story movement) — spec §4 post-story.
- [ ] Playwright (in `story-e2e.mjs`): hub shows rung 1 of the East vs `east.ladder[0]`; crewRoom train with seeded 500 crowns raises a stat and lowers 🪙 by `trainCost`.
- [ ] Commit `feat(story): the hub and the crew room`

### Task 9: The story match loop

**Files:** Modify `src/main.js` (`startMatchFlow`, `matchOver`, `backToMenu`), `src/cinematics/introSequence.js` only if a null logo breaks it; Create `src/ui/screens/storyResult.js`.
**Interfaces:**
- `ctx.startStoryMatch()` — `stop = currentStop`; plays the stop's `before` scene (ids per Task 14); `{team, difficulty} = rivalTeam(teamById(stop.teamId), stop, tuning)`; sets `ctx.storyStop = stop`; calls `startMatchFlow(crewTeam(story), team, null, { difficulty, useStats: true, fieldId: stop.fieldId })` (extend the signature with that 4th `opts` arg; Quick Play passes nothing).
- `startMatchFlow`: skip `playVideo` when `introVideo` is falsy (Review Focus #3); `fieldId` overrides the home field.
- `matchOver` with `ctx.storyStop` → `storyResult` route instead of `postGame`: `applyResult` + `payout` + `crowns` + `saveStory` (one write each, after the match, Review Focus #1); also feeds `unlocks.careerAdd` like PostGame so Locker gear still unlocks; on `'king'` also `save.set('kingOfStreets', true)` (Review Focus #5). Then plays the `win`/`loss` scene, then (win, and a non-null `recruitOffer`) the `recruit` scene + an accept/decline card with bench picker, then region/bracket/king scenes per events, then → `storyHub`. Clears `ctx.storyStop`.
- `backToMenu` clears `ctx.storyStop` (Review Focus #2).
- [ ] Unit test `tests/storyFlow.test.js` for the pure part: export `resultPlan(events, stop, offer) -> string[]` (ordered scene ids to play) from `src/meta/story.js` and test: loss → `[<team>-loss]`; ladder win with offer → `[win, recruit]`; final win → `[…, '<region>-champ', '<nextRegion>-open']`; king → ends `['ending']`.
- [ ] Playwright (`story-e2e.mjs`, `?storydev` exposes `window.__story.forceResult(won)` that fires `matchOver` with the current stop) — win once: crowns +60, rung 2, recruit card appears; pause→MAIN MENU mid-match: story unchanged.
- [ ] Commit `feat(story): play the rung — before, the game, after, the recruit`

### Task 10: Menu swap + copy

**Files:** Modify `src/ui/screens/screens.js` (`MenuScreen`, PostGame title copy), `src/meta/unlocks.js` hints `King of the Streets` → `King of the Court`; Test: extend `tests/unlocks.test.js`.
- [ ] Menu: the `RUN THE MAP` card becomes `STORY` (`<small>` = `NEW CREW` with no save, else `THE EAST · RUNG 3/5` / `NATIONALS 2/5` / `👑 KING OF THE COURT`). Tap: tutorial-first rule stays, then `createCrew` if no story else `storyHub`. `MapScreen` stays registered but unlinked.
- [ ] Test (Review Focus #5): a save with `unlocks.crews` = 9 and `kingOfStreets` and no `story` → `checkUnlocks` still grants Gold Crowns; `loadStory` → null; menu label = `NEW CREW` (pure helper `storyMenuLabel(story, map)` exported from `story.js`).
- [ ] Commit `feat(story): STORY takes the menu — King of the Court`

---

## Phase C — The content

### Task 11: Higgsfield art direction + budget check

- [ ] Check `mcp__higgsfield__balance`; pick the image model via `models_explore(action:'recommend')` for "stylized-realistic 3D urban street scene, portrait 9:16" (match `public/assets/textures/backdrop-*-3d.jpg` — load two as style references with `media_upload`). Record model + reference ids in `docs/reports/story-art.md`. Rules: no readable real brands, no faces in close-up that contradict our 3D crews (crowds/backs/silhouettes ok), golden-hour or night city light, each still leaves the center-bottom 60% calm for the phone.

### Task 12: Fifteen new crews

**Files:** Modify `src/data/teams.json`, `src/data/casts.json`, `tests/casts.test.js`, `src/data/story/regions.json`, flip Task 1 todos.
- Crews (draft names — dev may rename; must not be a current pro/college team name): Midwest — Detroit WRECKERS, St. Louis ARCHES, Cleveland CRUSH; South — Atlanta OUTLAWS, New Orleans GATORS, Houston RATTLERS, Miami HEATWAVE; Southwest — Dallas STAMPEDE, Las Vegas JACKPOTS, Denver MILE HIGHS, Albuquerque ROADRUNNERS; West — Oakland HYPHY, Seattle RAINMAKERS, San Diego TSUNAMI, Portland LUMBERJACKS.
- Each: full `teams.json` shape (copy a ready crew's keys), `status:'story'` (Quick Play filters `ready`, so they stay out until a later dev call), `introVideo:null`, `sprites:[]`, `homeField` = an existing field chosen for flavor (map in the commit message), `region`, `special` (id + label), 8-player roster (nicks, pos, numbers, stats tuned so each region's ladder ascends and the region's average rises region to region), `kits` light/dark passing `tests/kits.test.js`.
- `casts.json`: 8 archetypes per new crew; `tests/casts.test.js` cross-crew slot uniqueness becomes **per region** (read `regions.json`), the other cast asserts unchanged.
- [ ] Tests green (data, kits, casts, storyRegions with todos flipped). Commit `feat(story): fifteen new crews across four regions`

### Task 13: Logos + stock marks

**Files:** Create `public/assets/logos/<id>.png` (+ `-light` variants where kits.js expects them), `public/assets/logos/stock/mark-01..12.png`; Create `src/meta/markTint.js`.
- [ ] Generate 15 crew logos with Higgsfield (logo-reference workflow per `skk-asset-pipeline-decisions`: match the existing crest style — load 3 existing logos as references), then `remove_background`; resize with sharp to the existing logo dimensions. 12 stock marks: simple single-color white glyphs on transparent (crown, flame, skyline, cracked ball, spray can, fist, star, lightning, wings, dice, boombox, chain) — white so they tint.
- [ ] `tintedMarkUrl(markId, hex) -> Promise<string>` (canvas `source-in` fill, cached by key); `crewTeam` uses it for `logo` and the jersey decal path (`logoUrlFor` gets a data URL passthrough — test in `tests/jerseyDecals.test.js`).
- [ ] Visual check: one screenshot sheet of all 25 logos on dark + light kits → `docs/reports/story-logos.png`; reject/regenerate any off-style ones.
- [ ] Commit `feat(story): every crew wears a mark — 15 crests + 12 stock marks`

### Task 14: The script — all scenes

**Files:** Create `src/data/story/scenes/{prologue,east,midwest,south,southwest,west,nationals}.json`, `tests/storyScenes.test.js`.
- Scene ids (the contract Task 9 plays): `prologue`; per region `R`: `R-open`, `R-bracket`, `R-champ`; per ladder crew `T` in `R`: `R-T-before`, `R-T-win`, `R-T-loss`, `R-T-recruit`; bracket: `R-semi-before|win|loss`, `R-final-before|win|loss`; nationals: `nationals-open`, `nationals-T-before|win|loss` for each finalist slot (written per region's strongest crew), `ending`.
- Voice: street, funny, never cruel; the group chat has 4 fixed block voices (name them in `prologue`, keep consistent); rivals text in their crew's city flavor; recruits sound like themselves; loss scenes ≤ 3 messages. ≤ 90 chars per message, ≤ 8 messages per thread. Placeholders only from `fillText`'s set.
- Written by parallel subagents, one per region, each given: the spec, this task, the East scenes once written (as the voice reference), and that region's crews from `teams.json`.
- [ ] `tests/storyScenes.test.js`: every id above exists exactly once; every `still` file exists in `public/`; every `music` id resolves (`cityTrackId` or `beat`); length limits; only known placeholders; every `from` is a block voice, `{captain}`, `{recruit}`, or `me`.
- [ ] Commit per region `feat(story): the <region> script`.

### Task 15: The stills

**Files:** Create `public/assets/story/*.jpg` (1080×1920, ≤ 350 KB, JPEG per the iOS rule), list in `docs/reports/story-art.md`.
- ~26 stills: `prologue-block`, per region `R-open`, `R-turf`, `R-bracket`, `R-champ` (20), `nationals-open`, `nationals-crown`, `ending-king`, `loss-night`, `recruit-handshake`. Generate in batches (`generate_image_batch`), review each against Task 11's rules, regenerate rejects, compress with sharp.
- [ ] `tests/storyScenes.test.js` still-exists check goes green. Commit `feat(story): the stills — five regions and the crown`

---

## Phase D — Prove it

### Task 16: Full-run harness + balance pass

- [ ] `scripts/story-e2e.mjs` full run: create crew → force 40 results (with 3 scripted losses incl. a final loss) via `__story.forceResult` → assert `king`, `kingOfStreets`, Gold Crowns unlocked, every scene id in `resultPlan` played without a console error, no missing image (network 404 list empty).
- [ ] Real play (headless chromium + `?mute`, driven like `round-e2e.mjs`): play actual matches at progress 0, 0.5, 1.0 with an untrained and a trained crew; record win/loss + score in `docs/reports/story-balance.md`; adjust `tuning.story` if an untrained crew can't win early or a trained crew can't lose late.
- [ ] `npm run build` clean; full suite green; commit `test(story): the whole climb, end to end`.

### Task 17: Ship gate

- [ ] Open the PR (body: spec link, what's in, screenshots of create/hub/scene/recruit, balance table, known gaps). Do not merge; ask the dev for "push", then merge → production PWA → dev plays on his phone.
- [ ] Session log + memory + Shared Brain handoff updated.

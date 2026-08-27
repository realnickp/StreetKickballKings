# Premium Pass + Crown Rules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One offense-only crown that resets on use (fixing the homer flood), late-release acrobatic kicks, fielders that face the ball, a camera that stays in front of the backstop, a lower-third NOW KICKING plate, icon runner markers that never clip, and a premium PS4-clean + graffiti visual pass over every HUD element, menu and the Locker.

**Architecture:** `Crown` (pure) replaces `PowerKicks`; a pure `halfScoreDiff` helper; `clampNearHome` in the camera director; `runnerMarker` clamp with safe insets; the visual pass is CSS-first with minimal markup changes that keep every test-facing hook.

**Tech Stack:** Vite 8, three r184, vitest 4, Playwright WebKit harness, Google Fonts (Archivo, Permanent Marker) already loaded via `ui.css`.

**Spec:** `docs/superpowers/specs/2026-08-27-premium-pass-crown-rules-design.md`

## Global Constraints

- Crown: `tuning.special.gain` = `{ PERFECT: 35, homerun: 40, pickleEscape: 60, hit: 20, run: 25, steal: 15, shutout: 25 }` (the `catch`/`peg` keys are removed); `meterMax 100`; `powerMult 1.35`. `Crown.feed` ignores unknown events. `consume()` resets to 0. No charges anywhere.
- Offense-only feeds: every `crownFeed` call site is guarded by `kickingIsPlayer()` except `shutout` (fires when the player was FIELDING and the opponent scored 0 in the half that just ended).
- Late contact marks (exact): `kickFlair 0.94`, `kickKipUp 0.93`, `kickSpinFlip 0.90`, `kickMeia 0.86`, `kickMeiaBack 0.86`.
- Camera: `clampNearHome(pos)` → if `Math.abs(pos.x) > 3.2 && pos.z > -1.7 && pos.z < 6.7` then `pos.x = Math.sign(pos.x) * 3.2`; `contact` = `kicker + (1.9, 0.95, 2.4)`, look `kicker + (0, 1.3, −6)`. `kick` `(0,3.4,8)/(0,1.2,−12)` and `pitchSelect` `(0,5,−19)/(0,1.1,−1.5)` NEVER change.
- Runner markers: inset 56 px + safe insets `{ top: 96, bottom: 150, left: 12, right: 12 }` (px, the score bug and control zones); `edgeClamp` keeps its default 24 and return shape (tests); new `markerClamp` wraps it. Markers carry `data-base="1ST|2ND|3RD|HOME"`, no text.
- Test-facing hooks that must survive the visual pass: `.special-btn` (+ `.ready`, `.armed`, `.hidden`), `.pk-label` (now the crown label — text `CROWN` while filling, the kick name when ready), `.runner-arrow` elements positioned via `style.transform = translate(Xpx, Ypx) …`, `.walkout-card` (may change internals), `.stamp span`, `.team-splash`, `.skip-chip`, `.throw-pad button`, `.pitch-select button`, `.locker-tab`, `.locker-chips .locker-chip` (+ `.on`, `.just`, `.locked`), `canvas.locker-preview`, `.locker-stage-cap`, `.locker-free`, `.locker-play`, `.locker-back`, `.m-start`, `.big-play`, `.dm-dot`, `.gear-toast`, `.cine-banner`, `.runner-alerts`.
- Fonts: `--marker` (Permanent Marker) only for nicknames, crew names, big stamps; `--display` = `'Archivo', system-ui, sans-serif` weight 900 uppercase; no `border:` on HUD plates/buttons (rules via `border-bottom`/`box-shadow` inset lines are fine).
- Commit after every task with the trailers `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01VHDK3xmrcqrgDpzGCVSg81`. Deploy only on the dev's explicit "push". Never run two Playwright harnesses concurrently.

---

### Task 1: Crown rules — `Crown` replaces `PowerKicks`, offense-only feeds, shutout bonus, HUD

**Files:**
- Create: `src/game/crown.js`, `tests/crown.test.js`
- Delete: `src/game/powerKicks.js`, `tests/powerKicks.test.js`
- Modify: `src/data/tuning.json` (`special.gain`), `src/game/matchScene.js` (ctor/startMatch construction, `hud.onSpecial`, `crownFeed`, the kick consume block, `nextAtBat` disarm, feeds at the `peg`/`catch`/`pickleEscape` sites, half snapshot + `halfEnd` shutout), `src/ui/screens/hud.js` (`setPowerKick` → `setCrown`), `src/ui/ui.css` (label states), `src/meta/unlocks.js` (kick `play` copy), `scripts/round-e2e.mjs` (scenario 4 → crown), `tests/specialMoves.test.js` (gain keys if it asserts them)

**Interfaces:**
- Produces: `class Crown { constructor({ meter, gear }); get ready; get name; get fill /*0..100*/; armed; feed(event) → boolean /*became ready this feed*/; arm() → boolean; disarm(); consume() → { gear, powerMult, label } | null; hudState() → { name, fill, ready, armed } }`; `hud.setCrown(state)`; `scene.crown`; `halfRuns(before, after, side)` pure helper in `crown.js`.

- [ ] **Step 1: Failing tests** — `tests/crown.test.js`:
```js
import { it, expect } from 'vitest';
import { Crown, halfRuns } from '../src/game/crown.js';
import { SpecialMeter } from '../src/game/specialMoves.js';
import tuning from '../src/data/tuning.json';
import teams from '../src/data/teams.json';
const monarchs = teams.teams.find((t) => t.id === 'monarchs');
const flair = { id: 'kick-flair', name: 'THE FLAIR', clip: 'kickFlair', mods: { powerMult: 1.45 } };
const mk = (gear = null) => new Crown({ meter: new SpecialMeter(monarchs, tuning), gear });

it('starts empty with no charges, whatever is equipped', () => {
  expect(mk(flair).fill).toBe(0); expect(mk(flair).ready).toBe(false); expect(mk(flair).name).toBe('THE FLAIR'); expect(mk().name).toBe('CROWN KICK');
});
it('fills only from the offense table; defense events are ignored', () => {
  const c = mk();
  expect(c.feed('catch')).toBe(false); expect(c.fill).toBe(0);
  expect(c.feed('peg')).toBe(false); expect(c.fill).toBe(0);
  expect(c.feed('hit')).toBe(false); expect(c.fill).toBe(20);
  expect(c.feed('shutout')).toBe(false); expect(c.fill).toBe(45);
  expect(c.feed('PERFECT')).toBe(false); expect(c.fill).toBe(80);
  expect(c.feed('run')).toBe(true); expect(c.fill).toBe(100); expect(c.ready).toBe(true);
  expect(c.feed('hit')).toBe(false); expect(c.fill).toBe(100); // capped, no re-announce
});
it('arm needs a full crown; consume resets to zero and carries the equipped kick', () => {
  const c = mk(flair);
  expect(c.arm()).toBe(false);
  c.feed('pickleEscape'); c.feed('homerun');
  expect(c.arm()).toBe(true); c.disarm(); expect(c.fill).toBe(100);
  c.arm(); const sp = c.consume();
  expect(sp).toEqual({ gear: flair, powerMult: 1.45, label: 'THE FLAIR' });
  expect(c.fill).toBe(0); expect(c.ready).toBe(false); expect(c.consume()).toBe(null);
  expect(mk().hudState()).toEqual({ name: 'CROWN KICK', fill: 0, ready: false, armed: false });
});
it('halfRuns reads the runs the given side scored between two score snapshots', () => {
  expect(halfRuns({ home: 2, away: 1 }, { home: 2, away: 4 }, 'away')).toBe(3);
  expect(halfRuns({ home: 2, away: 1 }, { home: 2, away: 1 }, 'home')).toBe(0);
});
```
Run → FAIL. Delete `tests/powerKicks.test.js` in the same step (it encodes the old rules).

- [ ] **Step 2: `src/game/crown.js`**
```js
// THE CROWN (dev, 2026-08-27: "reset to zero every time it's used, and you can
// only build it up on offense"). One meter, offense feeds only, a full crown is
// one guaranteed-crown swing — the equipped Locker kick is that swing's look
// and power. Consuming it empties the meter. No charges, no minting.
const OFFENSE = new Set(['hit', 'run', 'steal', 'PERFECT', 'homerun', 'pickleEscape', 'shutout']);
export class Crown {
  constructor({ meter, gear = null }) { this.meter = meter; this.gear = gear ?? null; this.armed = false; }
  get name() { return this.gear?.name ?? 'CROWN KICK'; }
  get fill() { return (this.meter.value / this.meter.tuning.special.meterMax) * 100; }
  get ready() { return this.meter.ready; }
  /** @returns {boolean} true the moment the crown becomes full */
  feed(event) {
    if (!OFFENSE.has(event)) return false;
    const was = this.meter.ready;
    this.meter.add(event);
    return !was && this.meter.ready;
  }
  arm() { if (!this.ready || this.armed) return false; this.armed = true; return true; }
  disarm() { this.armed = false; }
  consume() {
    if (!this.armed || !this.ready) { this.armed = false; return null; }
    this.armed = false; this.meter.value = 0;
    return { gear: this.gear, powerMult: this.gear?.mods?.powerMult ?? this.meter.tuning.special.powerMult, label: this.gear?.name ?? this.meter.team.special.label };
  }
  hudState() { return { name: this.name, fill: this.fill, ready: this.ready, armed: this.armed }; }
}
/** Runs `side` scored between two score snapshots ({home, away}). */
export const halfRuns = (before, after, side) => Math.max(0, (after?.[side] ?? 0) - (before?.[side] ?? 0));
```
`tuning.json` `special.gain`: remove `catch` and `peg`, add `"shutout": 25`. `tests/specialMoves.test.js` may reference `peg`/`catch` gains — update those expectations to offense events (read it).

- [ ] **Step 3: Scene wiring** (`src/game/matchScene.js`, locate by grep)
- Import `Crown, halfRuns` from `./crown.js`; remove the `PowerKicks` import; delete `src/game/powerKicks.js`.
- Ctor + `startMatch`: `this.crown = new Crown({ meter: this.special, gear: gear?.kick ?? null })` (both sites; startMatch keeps `this.special.value = 0`). Rename every `this.power` → `this.crown` (grep `this.power`).
- `hud.onSpecial`: `if (!this.kickingIsPlayer() || !this.crown.arm()) return; sfx 'crown-arm'; hint('CROWN ARMED — LET IT RIP'); refreshHud()`.
- `crownFeed(event)`: `const full = this.crown.feed(event); this.hud.crownPulse?.(); if (full) { stamp('CROWN READY!', 'crowned'); hint(`TAP THE 👑 — ${this.crown.name}`); sfx 'bassdrop'; } else if (['hit','run','steal','PERFECT','homerun','pickleEscape','shutout'].includes(event)) sfx 'crown-tick'; refreshHud();`
- Kick consume block: `if (this.kickingIsPlayer() && this.crown.armed) { const sp = this.crown.consume(); … }` (body unchanged).
- `nextAtBat`: `this.crown.disarm();`.
- Feeds: remove the `crownFeed('peg')` (grep `crownFeed('peg')`) and `crownFeed('catch')` calls; wrap the `pickleEscape` feed in `if (this.kickingIsPlayer())`.
- Shutout: in the ctor's `halfEnd` listener add at the top `const before = this._halfScore; this._halfScore = { ...this.match.state.score }; if (before && this._halfFielding && halfRuns(before, this.match.state.score, this.match.kickingSide() === 'home' ? 'home' : 'away') === 0) { this.crownFeed('shutout'); this.hud.callout('SHUTOUT! +25 CROWN', { x: window.innerWidth / 2, y: window.innerHeight * 0.3, ttl: 1600, key: 'shutout' }); }` — CAREFUL: `halfEnd` fires BEFORE `state.half` advances, so `this.match.kickingSide()` still names the side that was kicking; `this._halfFielding = !this.kickingIsPlayer()` must be captured at the half START (set it in `nextAtBat` when `halfJustEnded` or on the first at-bat: `this._halfFielding = !this.kickingIsPlayer(); this._halfScore = { ...this.match.state.score }` guarded to run once per half via `this._halfKey !== `${inning}-${half}``). Implement it cleanly: a `beginHalfTracking()` called from `nextAtBat` when the half key changes, and the `halfEnd` listener does the diff. Only feed when `this._halfFielding` is true (the player was in the field) and the OPPONENT's runs in the half were 0.
- `refreshHud`: `this.hud.setCrown(this.crown.hudState())`.

- [ ] **Step 4: HUD** — `hud.js`: replace `setPowerKick` with
```js
  setCrown({ name, fill, ready, armed }) {
    this.specialBtn.style.setProperty('--fill', Math.round(fill));
    this.specialBtn.classList.toggle('ready', ready);
    this.specialBtn.classList.toggle('armed', armed);
    this.specialBtn.querySelector('.pk-label').textContent = ready ? name : 'CROWN';
    this.specialBtn.title = name;
  }
```
`grep -rn "setPowerKick\|PowerKicks\|power.charges" src tests scripts` → only harness lines you will update next. Locker copy in `unlocks.js`: every kick `play` string `'2 power kicks a game · …'` → `'your crown swing · …'`.

- [ ] **Step 5: Harness** — `scripts/round-e2e.mjs` scenario 4: replace the charges logic with: `s.special.value = 0; s.refreshHud()` → dark, label `CROWN`; feed via `s.crownFeed('pickleEscape'); s.crownFeed('homerun')` → `.ready`, label `CROWN KICK`; tap → `s.crown.armed`, `.armed`, `crown-arm` sfx; `s.crown.consume()` → `s.special.value === 0` and `.ready` gone after `refreshHud()`; fielding → `.hidden`. Also the later line that sets `s.power.charges = 1` → `s.special.value = 100; s.refreshHud()`. Run `node scripts/round-e2e.mjs` with `SKK_ONLY` for scenario 4 (and 13 which uses the special path — update its arming to `s.special.value = 100; s.refreshHud()`).

- [ ] **Step 6: Verify + commit** — `npm test` green; browser: no charge on a fresh match, a shutout half feeds +25 with the callout (force via console: `s._halfFielding = true; s._halfScore = {...s.match.state.score}; s.match.bus.emit('halfEnd', {...})`), consume resets to 0. Commit `feat(rules): one offense-only crown that resets on use; shutout bonus; no gear charges`.

---

### Task 2: Acrobatic kicks release when the motion lands

**Files:** `src/data/anims.manifest.json`, `tests/animsManifest.test.js`

- [ ] **Step 1:** add to the manifest test: `for (const [n, v] of [['kickFlair', 0.94], ['kickKipUp', 0.93], ['kickSpinFlip', 0.90], ['kickMeia', 0.86], ['kickMeiaBack', 0.86]]) expect(manifest.find((m) => m.name === n).contactAt, n).toBe(v);` → FAIL.
- [ ] **Step 2:** set those five `contactAt` values (JSON parses; `node -e require`).
- [ ] **Step 3:** browser check in `?match&nosplash&nointro`: equip Flair via `s.crown.gear = {…flair…}; s.special.value = 100; s.refreshHud()`, arm, kick — the ball rides the foot through the flair and leaves as the kicker lands (launch fraction probe ≥ 0.95; screenshot mid-hold). `npm test`; commit `feat(kick): acrobatic specials release the ball when the move lands`.

---

### Task 3: Fielders face the ball; the camera stays in front of the backstop

**Files:** `src/game/matchScene.js` (`updateDefense`), `src/game/cameraDirector.js` (`clampNearHome`, `contact`, apply in `update`/`request`), `tests/cameraDirector.test.js`

- [ ] **Step 1: Failing tests** (append to `tests/cameraDirector.test.js`):
```js
  it('clampNearHome pulls a camera out of the side-fence V and leaves the rest alone', () => {
    expect(clampNearHome(new THREE.Vector3(-4.0, 1.1, 3.2)).x).toBeCloseTo(-3.2);
    expect(clampNearHome(new THREE.Vector3(4.6, 0.9, 3.6)).x).toBeCloseTo(3.2);
    expect(clampNearHome(new THREE.Vector3(-4.0, 1.1, 8.0)).x).toBeCloseTo(-4.0);   // past the V
    expect(clampNearHome(new THREE.Vector3(2.0, 0.9, 3.6)).x).toBeCloseTo(2.0);     // inside the gap
  });
  it('contact shot sits inside the V', () => {
    const s = SHOTS.contact(ctx({ kickerPos: new THREE.Vector3(0.6, 0, 0.4) }));
    expect(s.pos.toArray().map((v) => +v.toFixed(2))).toEqual([2.5, 0.95, 2.8]);
  });
```
(import `clampNearHome` from the director.) → FAIL.
- [ ] **Step 2: Director** — `export function clampNearHome(p) { if (Math.abs(p.x) > 3.2 && p.z > -1.7 && p.z < 6.7) p.x = Math.sign(p.x) * 3.2; return p; }`; `contact: pos = V(k.x + 1.9, 0.95, k.z + 2.4)`; in `update()` after `const t = def(ctx)` → `clampNearHome(t.pos)`, and in `request()`'s cut branch clamp `t.pos` before copying.
- [ ] **Step 3: Facing** — in `updateDefense`'s per-fielder loop (grep `updateDefense(`), for every fielder that is NOT moving this frame (no travel step applied), not the chaser/thrower/`holder`, and not mid-throw: `c.faceYaw = this.yawTo(c.group.position, this.ball.pos)`; keep the existing travel-direction facing for movers. Add the pitcher-in-flight exception: while `this.phase === 'PITCH'` the catcher faces `FIELD_LAYOUT.pitcher`. Verify no per-frame allocation (`yawTo` is pure math).
- [ ] **Step 4: Verify + commit** — `npm test`; browser: in the `?match` harness stage a runner and throw first→second (the harness's PEG scenario staging shows how) and confirm the bag man's `faceYaw` tracks `ball.pos` while waiting; a contact cut never leaves `camera.position` with |x| > 3.2 in the V. Commit `fix(field): every waiting fielder faces the ball; camera never films through the backstop`.

---

### Task 4: NOW KICKING lower-third + icon runner markers

**Files:** `src/ui/screens/hud.js` (`walkoutShow` mini branch → plate; `setRunnerArrows` → icon markers), `src/ui/runnerArrows.js` (`markerClamp`), `src/ui/ui.css`, `src/game/matchScene.js` (`nextAtBat` hide timer → hide at plate; `updateRunnerArrows` payload/inset), `tests/runnerArrows.test.js` (append), `scripts/round-e2e.mjs` scenario 6

- [ ] **Step 1: Failing test** (append):
```js
import { markerClamp, SAFE } from '../src/ui/runnerArrows.js';
it('markerClamp keeps markers 56px inside the frame and out of the HUD safe zones', () => {
  const r = markerClamp({ x: 900, y: 20, w: 390, h: 844 });
  expect(r.x).toBeLessThanOrEqual(390 - 56); expect(r.y).toBeGreaterThanOrEqual(SAFE.top);
  const b = markerClamp({ x: 195, y: 900, w: 390, h: 844 });
  expect(b.y).toBeLessThanOrEqual(844 - SAFE.bottom);
  expect(markerClamp({ x: 195, y: 400, w: 390, h: 844 }).visible).toBe(true);
});
```
- [ ] **Step 2: Model** — in `runnerArrows.js`: `export const SAFE = { top: 96, bottom: 150, left: 12, right: 12 };` and `export function markerClamp({ x, y, w, h, behind = false }) { const r = edgeClamp({ x, y, w, h, inset: 56, behind }); r.x = Math.min(Math.max(r.x, 56 + SAFE.left), w - 56 - SAFE.right); r.y = Math.min(Math.max(r.y, SAFE.top), h - SAFE.bottom); return r; }` (edgeClamp unchanged).
- [ ] **Step 3: Markers** — `hud.setRunnerArrows(list)`: element `div.runner-arrow` with `innerHTML = '<i class="ra-chev">‹</i><svg class="ra-icon" viewBox="0 0 24 24"><path d="M13 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-2 5 3 1 2 3 3 1-1 2-3-1-2 1 1 3 3 4-2 1-4-5-1 3-4 1-1-2 4-1 1-3-2-2-2 3-2-1 3-5 4-2z"/></svg>'` (a running figure), `data-base` = target, no number/label text; keep `style.transform = translate(Xpx, Ypx) translate(-50%,-50%)` and rotate the chevron by `angle`. CSS: `.runner-arrow { width: 40px; height: 40px; border-radius: 50%; background: radial-gradient(circle, rgba(8,9,13,.85), rgba(8,9,13,.4)); box-shadow: 0 0 14px var(--c); display:grid; place-items:center; animation: markerBob .7s ease-in-out infinite alternate; } .ra-icon { width: 24px; height: 24px; fill: var(--c); } .ra-chev { position:absolute; color: var(--c); font-size: 18px; transform-origin: center; } .runner-arrow.urgent { --c: var(--gold); animation-duration: .35s; } @keyframes markerBob { to { margin-top: -3px; } }` — the chevron sits on the marker's edge facing the runner (`translate(18px) rotate(angle)` from centre). Scene: `updateRunnerArrows` uses `markerClamp` (import), drops `label`/`number` from the payload except `base` (`'1ST'|'2ND'|'3RD'|'HOME'`).
- [ ] **Step 4: Plate** — `walkoutShow` when `mini`: class `walkout-card mini plate`; innerHTML = `<h2 class="wo-nick"></h2><span class="wo-sub">#N · POS</span>` + optional `<div class="wo-gear">…</div>`; no stat rows; `_fitText` on `.wo-nick` stays. CSS `.walkout-card.mini`: `left: 0; bottom: calc(96px + env(safe-area-inset-bottom)); top: auto; width: min(58%, 250px); padding: 10px 16px 10px 14px; background: linear-gradient(90deg, rgba(8,9,13,.78), rgba(8,9,13,0)); border: 0; border-radius: 0; box-shadow: none; text-align: left; animation: plateIn .35s cubic-bezier(.2,1,.3,1) both;` `.wo-nick { font-family: var(--marker); font-size: 26px; line-height: 1; padding-bottom: 4px; border-bottom: 2px solid var(--c1, var(--gold)); display: inline-block; }` `.wo-sub { font-family: var(--sans); font-weight: 900; font-size: 10px; letter-spacing: 1.6px; color: var(--ink); }` `@keyframes plateIn { from { transform: translateX(-40px); opacity: 0 } }`. Scene: the NOW KICKING hide timer → `this.after(walkS() + 0.1, () => this.hud.walkoutHide())`; move the `gear-toast` up/down as needed so it doesn't collide (it currently sits at top 272 px — fine).
- [ ] **Step 5: Harness** scenario 6: assert `first.dataset.base === '2ND'` instead of the span text; drop the `#N` assertion; keep the transform/clamp assertions (now expect within `56 + SAFE` bounds). `SKK_ONLY` run for 6 and 3.
- [ ] **Step 6: Verify + commit** — `npm test`; browser screenshots: plate during the walk (gone at the plate), a marker at the edge with the chevron toward the runner, none cut off. Commit `feat(hud): NOW KICKING lower-third plate; icon runner markers that never clip`.

---

### Task 5: The premium pass (HUD, menus, Locker)

**Files:** `src/ui/ui.css` (the bulk), `src/ui/screens/hud.js` (small markup: score bug plate, throw-pad discs, skip chip text, crown label), `src/ui/screens/screens.js` + `src/ui/screens/lockerScreen.js` (class hooks only where a rule needs one), `index.html` (no change unless a font weight is missing)

Use the `frontend-design` skill (and `high-end-visual-design` if available) for the pass; the spec §5 is the brief. Work element by element; after each group take a 390×844 screenshot (claude-in-chrome; emulate the phone in a same-origin iframe as the previous round did) and compare against the rule "no bordered boxes, display type, translucent gradient plates, thin accent rules, graffiti only for nicknames/crews/big stamps".

- [ ] **Step 1: Tokens** — `:root` adds `--display: 'Archivo', system-ui, sans-serif; --plate: linear-gradient(180deg, rgba(8,9,13,0), rgba(8,9,13,.72)); --plate-l: linear-gradient(90deg, rgba(8,9,13,.78), rgba(8,9,13,0)); --plate-r: linear-gradient(270deg, rgba(8,9,13,.78), rgba(8,9,13,0)); --rule: 2px; --glow-gold: 0 0 18px rgba(245,179,18,.55);`. Utility classes `.t-display` (`font-family: var(--display); font-weight: 900; text-transform: uppercase; letter-spacing: .06em`), `.t-label` (`font-weight: 700; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted)`).
- [ ] **Step 2: HUD elements** (each: remove `border`, `border-radius ≥ 8px` on plates → 0/4 px, replace backgrounds with `--plate*`, add a rule/glow): score bug (diagonal `clip-path: polygon(0 0, 100% 0, 96% 100%, 0 100%)` plate, team-colour rules under abbr, display type for runs), pitch readout, action hint (`.t-label` style, no box), throw pad (discs: `border-radius: 50%; background: radial-gradient(circle, rgba(8,9,13,.55), rgba(8,9,13,.25)); border: 0;` lit base = gold glow; PEG gold pulse when it's THE play), GO/DUEL/REVERSE/CALL (gradient bars `linear-gradient(90deg, var(--gold), #ffd45e)` with dark display text, no border), crown button (ring conic gradient stays; remove the border; label `.pk-label` in display type), steal chips (icon + short text, `--plate-r`/`--plate-l` anchored, no border), skip chip (`SKIP ›` text, no box), stamps (keep the band; remove any border), cine banner (rule instead of box), callouts (text + shadow, no box), runner alerts (`.t-label` on a faint plate), gear toast (thin gold text with a rule), trace timer/pattern pad (thin lines, gold), letterbox (unchanged), pause button (icon only), team splash (already broadcast; drop borders), element chip/heat bar (rules, no boxes).
- [ ] **Step 3: Menus** — `.screen` background `radial-gradient(ellipse at 30% 10%, #1b1f2d, #0f1117 70%)` with `.screen::before` painting `assets/ui/splat-gold.webp` at 8–12 % opacity top-right (graffiti accent); `.screen-title` display type with a gold rule; `.mode-card`/`.daily-card`/`.streak-card`/`.profile-strip` → borderless typographic tiles with a colour rule (left 4 px) and `--plate`; `.big-play` → wide gradient bar; `.coin-buttons button` → text buttons with a rule; matchup/team-select cards → plates; `.tape-row` → ruled rows (`border-bottom: 1px solid rgba(255,255,255,.08)`), gold rows keep the colour; `.coin-card` → plate.
- [ ] **Step 4: Locker / GEAR UP** — `.locker-preview` full width of the stage (`width: min(92vw, 360px); height: clamp(180px, 42vh, 320px)`) with the radial floor glow; tabs: `.locker-tab { background: none; border: 0; border-bottom: 2px solid transparent; font-family: var(--display); font-weight: 900; letter-spacing: .12em; color: var(--muted) } .locker-tab.on { color: var(--gold); border-bottom-color: var(--gold) }` counts as `.t-label`; chips → `.locker-chip { border: 0; border-radius: 4px; background: var(--plate); min-width: 148px; padding: 10px 12px; }` name in display type, sub muted; `.locker-chip.on { box-shadow: inset 0 -3px 0 var(--gold), var(--glow-gold) }`; `.locker-chip.locked` dimmed + `::before` lock glyph (`content: '🔒'` → replace with a 12 px SVG lock via mask if trivial, else keep the glyph small); `.swatch` → 6 px colour bar; `.locker-play` gradient bar; `.locker-back` text; `.locker-free` gold text with a rule (no pill).
- [ ] **Step 5: Verify** — `npm test`; `node scripts/round-e2e.mjs` full (all hooks intact); screenshots at 390×844 of: HUD kicking (score bug, crown, hint), HUD fielding (throw pad, PEG lit), a stamp + banner, steal chips, runner marker + plate, menu, team select, GEAR UP, Locker with KITS tab, post-game. Save screenshots under the SDD workspace `premium/`.
- [ ] **Step 6: Commit** — `feat(ui): premium pass — PS4-clean broadcast HUD, graffiti accents, borderless plates across menus and the Locker`.

---

### Task 6: Harness, real-play pass, PR

- [ ] **Step 1:** harness additions: crown fill→arm→consume→0 + shutout feed (drive `halfEnd`), `data-base` markers within the safe bounds, Flair launch fraction ≥ 0.95, camera x ≤ 3.2 inside the V after a contact cut and during the walk-up, plate hidden by the time `walkup.phase === 'taunt'`. Both harnesses sequentially green; `npm test`; `node scripts/verify-anims.mjs`.
- [ ] **Step 2:** real-play pass in Chrome (virtual clock where rAF is frozen): the crown fills only on offense and resets on use; a shutout half pays +25; Flair releases at the landing; a bag man faces the throw; the contact shot is in front of the fence; the plate and markers; every redesigned screen at 390×844. Append `## Real-play pass results (2026-08-27)` + amendments to the spec; restore localStorage.
- [ ] **Step 3:** push + PR (title `Premium pass + crown rules`); no merge; deploy on "push".

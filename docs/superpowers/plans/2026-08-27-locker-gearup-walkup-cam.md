# Locker Rebuild, GEAR UP, Walk-up Camera & Kick Contact — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Special kicks meet the ball; the walk-up gets a two-shot camera package; the Locker becomes a tabbed, instant-preview customizer that also runs as a GEAR UP step before every game; THE FLAIR + FIRE REDS are free from day one.

**Architecture:** Pure helpers under vitest (`safetyLaunchDelayS`, `foot` manifest meta, two `SHOTS`, `lockerModel`, `gearUpArgs`); `MatchScene` and the screens only wire them. One `LockerScreen` component (new file) serves the menu Locker and the pre-game GEAR UP; one persistent `LockerPreview` per mount that re-renders in place and can play a move.

**Tech Stack:** Vite 8, three r184, vitest 4, Playwright WebKit harness (`scripts/round-e2e.mjs`), bake harness `tools/retarget.html` (analyzer only — no re-bake).

**Spec:** `docs/superpowers/specs/2026-08-27-locker-gearup-walkup-cam-design.md`

## Global Constraints

- Phone-first (portrait iPhone PWA): every feature SEEN / UNDERSTOOD / FELT.
- Kick fallback: `safetyLaunchDelayS(holdS, timeScale) = holdS / max(0.05, timeScale) + 0.35`; the clip's `onContact` stays primary.
- Manifest: every `cat: 'kick'` clip has `foot: 'L' | 'R'` (base `kick` = `R`); `kickFootPos()` uses it (default `R`).
- Walk-up shots (exact): `walkupDolly` `pos = (k.x − 0.6, 1.1, k.z + 2.8)`, `look = (k.x + 1.0, 1.2, k.z)`, `fovScale 0.8`, `stiffness 40`; `walkupTaunt` `pos = (k.x + 0.9, 1.35, k.z + 3.2 − 0.8·t)`, `look = (k.x, 1.25, k.z)`, `fovScale 0.7`, `stiffness 20`, `t ∈ [0,1]` = taunt progress. Hard cuts at walk start, taunt start, and walk-up end (back to `kick` / `pitchSelect`). The `kick` shot's framing is INPUT-CRITICAL and never changes.
- Stock starter gear: `kick-flair` and `cleats-fire` get `stock: true, unlock: null, hint: 'FREE · yours from day one'`. Menu counter counts non-stock only. Save key `gearSeen` (boolean) for the one-time callout.
- Locker: tabs `KICKS · TAUNTS · CLEATS · KITS` (cats `kick, taunt, cleats, uniform`); one section visible; chips owned-first then locked; the turntable stays mounted across equips (same `<canvas>` element); owned kick/taunt taps play the clip on the turntable.
- GEAR UP: route `gearUp` with params `{ away, home, kits }`; PLAY → `ctx.startMatchFlow(away, home, kits)`; BACK → `teamSelect`.
- Commit after every task with the trailers `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01VHDK3xmrcqrgDpzGCVSg81`. Deploy only on the dev's explicit "push".
- Windows/PowerShell host; Bash = Git Bash; dev server `npm run dev` on :5173; never run two Playwright harnesses concurrently.

---

### Task 1: Kicks meet the ball — fallback clock + striking foot

**Files:**
- Modify: `src/game/kickTiming.js`, `src/game/mocapAnimator.js` (add `meta(name)`), `src/game/matchScene.js` (`attemptKick` safety timer; `kickFootPos`), `src/data/anims.manifest.json` (`foot` on 15 kick entries), `tools/retarget.js` (analyzer logs `FOOT`), `tests/kickTiming.test.js`, `tests/animsManifest.test.js`
- Create: `tests/kickFoot.test.js`

**Interfaces:**
- Produces: `safetyLaunchDelayS(holdS, timeScale)`; `MocapAnimator.meta(name) → manifest entry | undefined`; `footBoneRegex(foot)`; manifest `foot`.

- [ ] **Step 1: Failing tests**

Append to `tests/kickTiming.test.js` (extend the import line with `safetyLaunchDelayS`):
```js
it('the launch fallback waits out the clip in REAL time, whatever timeScale the kick beat runs at', () => {
  expect(safetyLaunchDelayS(0.185, 1)).toBeCloseTo(0.535);
  expect(safetyLaunchDelayS(0.665, 0.3)).toBeCloseTo(0.665 / 0.3 + 0.35);   // 2.567 — after the clip's own contact
  expect(safetyLaunchDelayS(0.5, 0)).toBeCloseTo(0.5 / 0.05 + 0.35);        // never divide by zero
  for (const hold of [0.185, 0.54, 0.665]) expect(safetyLaunchDelayS(hold, 0.3)).toBeGreaterThan(hold / 0.3);
});
```
`tests/kickFoot.test.js`:
```js
import { it, expect } from 'vitest';
import { footBoneRegex } from '../src/game/kickTiming.js';
import manifest from '../src/data/anims.manifest.json';
import { GEAR } from '../src/meta/unlocks.js';

it('picks the striking foot bone by manifest meta, right by default', () => {
  expect(footBoneRegex('L').test('mixamorigLeftFoot')).toBe(true);
  expect(footBoneRegex('L').test('mixamorigRightToeBase')).toBe(false);
  expect(footBoneRegex('R').test('RightToe_End')).toBe(true);
  expect(footBoneRegex(undefined).test('RightFoot')).toBe(true);
});

it('every kick clip in the manifest declares its striking foot', () => {
  const kicks = [manifest.find((m) => m.name === 'kick'), ...GEAR.filter((g) => g.cat === 'kick').map((g) => manifest.find((m) => m.name === g.clip))];
  for (const m of kicks) expect(['L', 'R'], `${m?.name} needs foot`).toContain(m?.foot);
});
```
Run both → FAIL.

- [ ] **Step 2: Implement the helpers**

`src/game/kickTiming.js` (append):
```js
/** The kick beat runs at engine.timeScale (0.3 on the cinematic hit) but scene
 *  timers tick on REAL time — a fallback measured in scene seconds fired at
 *  ~half the wind-up on every special kick (dev, 2026-08-27). Convert. */
export function safetyLaunchDelayS(holdS, timeScale) {
  return holdS / Math.max(0.05, timeScale ?? 1) + 0.35;
}
/** Bone-name matcher for the striking foot ('L'|'R', default R). */
export function footBoneRegex(foot) {
  return foot === 'L' ? /LeftFoot|LeftToe/i : /RightFoot|RightToe/i;
}
```
`src/game/mocapAnimator.js`: after `hasClip(name) {...}` add `meta(name) { return META.get(name); }`.

- [ ] **Step 3: Wire the scene**

`matchScene.js` — import `safetyLaunchDelayS, footBoneRegex` from `./kickTiming.js` (extend the existing import). In `attemptKick`, replace `this.after(holdS + 0.35, launchNow);` with:
```js
    // safety: a clip without a contact mark must never stall the play — measured
    // in REAL seconds (the kick beat runs slow-mo; timers don't)
    this.after(safetyLaunchDelayS(holdS, this.engine.timeScale), launchNow);
```
`kickFootPos()` becomes:
```js
  kickFootPos() {
    if (!this.kicker) return null;
    const clip = this._gearSwing ?? 'kick';
    const re = footBoneRegex(this.kicker.animator.meta?.(clip)?.foot);
    let foot = null;
    this.kicker.group.traverse((o) => { if (!foot && o.isBone && re.test(o.name)) foot = o; });
    if (!foot) this.kicker.group.traverse((o) => { if (!foot && o.isBone && /Foot/i.test(o.name)) foot = o; });
    return foot ? foot.getWorldPosition(new THREE.Vector3()) : null;
  }
```
(`_gearSwing` is set to the special clip name just before `play()` in `attemptKick`; confirm it is assigned BEFORE the approach starts reading the foot — it is: `_gearSwing` is set at the `play()` call, and the approach glide runs in `update()` after.)

- [ ] **Step 4: Striking foot per clip from the analyzer**

`tools/retarget.js` `analyzeContact` — after computing `peaks`, also return the foot: change the return to include a `foot` verdict: the toe with the higher `v` → `'R'` for `RightToeBase`, `'L'` for `LeftToeBase`; log line becomes `CONTACT <name> ... | FOOT <L|R>`. Then run the analyzer page in a REAL Chrome tab (claude-in-chrome; dev server on :5173): `http://localhost:5173/tools/retarget.html?archs=afro` (one archetype is enough — the analyzer runs on the first rig), read every `CONTACT … FOOT` line for `kick`, the 8 pack-x kicks and the 7 pack-k kicks, and set `foot` in `src/data/anims.manifest.json` for all 16 kick entries (`kickBicycle` too). Sanity: expect Armada, Scissor, Flip, Meia/MeiaBack to come out `L` or be close calls — where the two peaks are within 15 % of each other, preview the clip in the tool and decide by eye; record every value + reasoning in the report.

- [ ] **Step 5: Verify**

`npm test` green; browser `?match&nosplash&nointro`: `__skk.power.charges=1; __skk.refreshHud()`, arm, kick with a special equipped via console (`__skk.playerGear = { kick: __skk.chars ? { id:'kick-armada', name:'ARMADA', clip:'kickArmada', mods:{powerMult:1.38} } : null }` before arming, then `__skk.power.gear = __skk.playerGear.kick`) — watch `__skk._kickApproach.t / dur` reach ≥ 0.95 before `onKickContact` (instrument by wrapping `__skk.onKickContact`), and the ball leave from the left foot for Armada. Drive with the virtual clock if rAF is throttled.

- [ ] **Step 6: Commit** — `fix(kick): special kicks launch at the clip's contact frame — real-time fallback + per-clip striking foot`.

---

### Task 2: Walk-up camera package

**Files:**
- Modify: `src/game/cameraDirector.js` (two shots), `src/game/matchScene.js` (`camCtx`, `updateWalkup`, `startWalkup`, `endWalkup`, camera block), `tests/cameraDirector.test.js`

**Interfaces:**
- Produces: `SHOTS.walkupDolly(c)`, `SHOTS.walkupTaunt(c)` reading `c.kickerPos`, `c.walkupT`; `camCtx().walkupPhase`, `camCtx().walkupT`.

- [ ] **Step 1: Failing tests** (append to `tests/cameraDirector.test.js`)
```js
  it('walk-up dolly rides beside the kicker, low, leading the walk', () => {
    const k = new THREE.Vector3(-2.0, 0, 0.4);
    const s = SHOTS.walkupDolly(ctx({ kickerPos: k }));
    expect(s.pos.toArray()).toEqual([-2.6, 1.1, 3.2]);
    expect(s.look.toArray()).toEqual([-1.0, 1.2, 0.4]);
    expect(s.fovScale).toBe(0.8);
  });
  it('walk-up taunt pushes in from 3.2 m to 2.4 m over the taunt', () => {
    const k = new THREE.Vector3(-0.9, 0, 0.4);
    expect(SHOTS.walkupTaunt(ctx({ kickerPos: k, walkupT: 0 })).pos.toArray()).toEqual([0, 1.35, 3.6]);
    expect(SHOTS.walkupTaunt(ctx({ kickerPos: k, walkupT: 1 })).pos.toArray()).toEqual([0, 1.35, 2.8]);
    expect(SHOTS.walkupTaunt(ctx({ kickerPos: k, walkupT: 1 })).look.toArray()).toEqual([-0.9, 1.25, 0.4]);
  });
```
(Note: `−0.9 + 0.9 = 0`, `0.4 + 3.2 = 3.6`, `0.4 + 2.4 = 2.8`.) Run → FAIL.

- [ ] **Step 2: Shots** (`cameraDirector.js`, after `pitchSelect`)
```js
  // WALK-UP (dev, 2026-08-27: "more cinematic ... highlights the player as they
  // walk to the plate"): a low side dolly beside the kicker leading the walk,
  // then a front push-in for the taunt. Hard cuts between them and back to kick.
  walkupDolly: (c) => {
    const k = c.kickerPos ?? V(-3.4, 0, 0.4);
    return { pos: V(k.x - 0.6, 1.1, k.z + 2.8), look: V(k.x + 1.0, 1.2, k.z), fovScale: 0.8, stiffness: 40 };
  },
  walkupTaunt: (c) => {
    const k = c.kickerPos ?? V(-0.9, 0, 0.4);
    const t = Math.max(0, Math.min(1, c.walkupT ?? 0));
    return { pos: V(k.x + 0.9, 1.35, k.z + 3.2 - 0.8 * t), look: V(k.x, 1.25, k.z), fovScale: 0.7, stiffness: 20 };
  },
```

- [ ] **Step 3: Scene wiring**
- `camCtx()` adds: `walkupPhase: this.walkup?.phase ?? null, walkupT: this.walkup?.phase === 'taunt' ? Math.max(0, Math.min(1, 1 - (this.walkup.until - this.elapsed) / WALKUP.tauntS)) : 0,`.
- Camera block in `update()`: insert BEFORE `} else if (this.camTarget === CAM.pitch) {`:
```js
      } else if (this.walkup) {
        this.camDir.request(this.walkup.phase === 'taunt' ? 'walkupTaunt' : 'walkupDolly', this.camCtx(), { cut: this.walkup.cut });
        this.walkup.cut = false;
```
(`walkup.cut` = true when a phase begins.)
- `startWalkup`: the state object gains `cut: true`.
- `updateWalkup` taunt transition: set `w.cut = true;` and replace `this.faceCam(k)` with facing the taunt shot: `const shot = SHOTS.walkupTaunt(this.camCtx()); k.faceYaw = this.yawTo(k.group.position, shot.pos);` (import `SHOTS` from `./cameraDirector.js`; compute AFTER `w.phase = 'taunt'`).
- `endWalkup`: after `placeKickerAtPlate()`: `this.camDir.request(this.camTarget === CAM.pitch ? 'pitchSelect' : 'kick', this.camCtx(), { cut: true });`.
- Runner arrows already gate on `this.walkup`.

- [ ] **Step 4: Verify + commit** — `npm test`; browser: the camera sits beside the kicker during the walk (`__engine.camera.position.z` ≈ 3.2 while `__skk.walkup.phase === 'walk'`), pushes in on the taunt, and is exactly `(0,3.4,8)` on the first pitch. Commit `feat(show): walk-up camera package — side dolly, taunt push-in, hard cut to the kick cam`.

---

### Task 3: Free starter gear

**Files:** `src/meta/unlocks.js`, `tests/unlocks.test.js`

- [ ] **Step 1: Failing test** (append)
```js
it('THE FLAIR and FIRE REDS are free from day one and fielded by default', () => {
  const s = mem();
  expect(isUnlocked(s, 'kick-flair')).toBe(true);
  expect(isUnlocked(s, 'cleats-fire')).toBe(true);
  expect(equippedGear(s).kick.id).toBe('kick-flair');
  expect(equippedGear(s).cleats.id).toBe('cleats-fire');
  expect(checkUnlocks(s).map((g) => g.id)).not.toContain('kick-flair');
  expect(GEAR.filter((g) => g.stock).map((g) => g.id).sort()).toEqual(['cleats-fire', 'kick-flair', 'taunt-point']);
});
```
- [ ] **Step 2: Catalog** — `kick-flair`: `stock: true, unlock: null, hint: 'FREE · yours from day one'` (keep `mods`, `play`); `cleats-fire`: same (keep `hex`, `speedMult`, `play`).
- [ ] **Step 3: Fix the existing test** at lines ~44-56 (it uses `kick-flair` as a LOCKED example): switch it to `kick-hurricane` (unlock `hr ≥ 3`: `careerAdd(s, { hr: 3 })`), and its `expect(equippedGear(s).cleats).toBe(null)` → `.cleats.id).toBe('cleats-fire')`; `expect(equippedGear(s).kick).toBe(null)` after unequip → `.kick.id).toBe('kick-flair')` (the stock fallback). Any other test asserting a null kick/cleats slot on a fresh save gets the same treatment. The menu counter is already `GEAR.filter((g) => !g.stock).length` (→ 25).
- [ ] **Step 4:** `npm test` green; commit `feat(locker): THE FLAIR and FIRE REDS are free starter gear`.

---

### Task 4: The Locker, rebuilt (tabs, persistent turntable, instant preview, moves)

**Files:**
- Create: `src/ui/lockerModel.js`, `src/ui/screens/lockerScreen.js`, `tests/lockerModel.test.js`
- Modify: `src/ui/lockerPreview.js` (`playMove`, extras), `src/game/glbCharacters.js` (`buildCaptainPreview` loads packs x/k), `src/ui/screens/screens.js` (remove `LockerScreen`), `src/main.js` (import from the new file), `src/ui/ui.css`

**Interfaces:**
- Produces: `lockerTabs({ GEAR, isUnlocked, eq, save }) → [{ cat, label, chips: [{ id, name, hex, owned, on, stock, hint, play, clip }], owned, total }]` (owned first, then locked; bare "STOCK KICK"/"CLASSIC" entry for `kick`/`cleats`/`uniform` only when the cat has no stock item); `buildLocker(ctx, { mode: 'locker' | 'gearUp', team, onPlay, onBack })` returning `{ el, preview, destroy }`; `LockerScreen(ctx)`; `LockerPreview.playMove(clip)`.

- [ ] **Step 1: Failing model test** — `tests/lockerModel.test.js`:
```js
import { it, expect } from 'vitest';
import { lockerTabs, TABS } from '../src/ui/lockerModel.js';
import { SaveManager } from '../src/meta/save.js';
import * as unlocks from '../src/meta/unlocks.js';

const mem = () => new SaveManager({ backend: 'memory' });
it('four tabs, owned chips first, stock marked, counts honest', () => {
  const s = mem();
  const tabs = lockerTabs({ GEAR: unlocks.GEAR, isUnlocked: (id) => unlocks.isUnlocked(s, id), eq: unlocks.equippedGear(s) });
  expect(tabs.map((t) => t.cat)).toEqual(TABS.map((t) => t.cat));
  const kicks = tabs.find((t) => t.cat === 'kick');
  expect(kicks.chips[0].id).toBe('kick-flair');           // stock + equipped floats to the top
  expect(kicks.chips[0].on && kicks.chips[0].stock).toBe(true);
  expect(kicks.chips.findIndex((c) => !c.owned)).toBeGreaterThan(0);
  expect(kicks.chips.slice(kicks.chips.findIndex((c) => !c.owned)).every((c) => !c.owned)).toBe(true);
  expect(kicks.owned).toBe(1); expect(kicks.total).toBe(14);
  const kits = tabs.find((t) => t.cat === 'uniform');
  expect(kits.chips[0]).toMatchObject({ id: null, name: 'CLASSIC', on: true });   // bare entry when no stock kit
  expect(tabs.find((t) => t.cat === 'taunt').chips.some((c) => c.id === null)).toBe(false);
});
```
- [ ] **Step 2: Model** — `src/ui/lockerModel.js`:
```js
export const TABS = [
  { cat: 'kick', label: 'KICKS', bare: 'STOCK KICK' },
  { cat: 'taunt', label: 'TAUNTS', bare: null },
  { cat: 'cleats', label: 'CLEATS', bare: 'CLASSIC' },
  { cat: 'uniform', label: 'KITS', bare: 'CLASSIC' },
];
export function lockerTabs({ GEAR, isUnlocked, eq }) {
  return TABS.map(({ cat, label, bare }) => {
    const items = GEAR.filter((g) => g.cat === cat);
    const chips = items.map((g) => ({
      id: g.id, name: g.name, hex: g.hex ?? null, clip: g.clip ?? null, stock: !!g.stock,
      owned: isUnlocked(g.id), on: eq[cat]?.id === g.id, hint: g.hint, play: g.play ?? '',
    }));
    chips.sort((a, b) => (b.on - a.on) || (b.owned - a.owned));
    const hasStock = items.some((g) => g.stock);
    if (bare && !hasStock) chips.unshift({ id: null, name: bare, hex: '#7a7a85', clip: null, stock: false, owned: true, on: !eq[cat], hint: '', play: '' });
    return { cat, label, chips, owned: items.filter((g) => isUnlocked(g.id) && !g.stock).length, total: items.length };
  });
}
```
- [ ] **Step 3: Preview plays moves + loads extras** — `glbCharacters.js` `buildCaptainPreview`: after building `char`, set `char.archKey = key` (the `arch-<key>` match) and kick off `loadExtrasFor([char])` in the background (import from `./animExtras.js` — check for an import cycle: `animExtras.js` imports only `mocapAnimator.js`, fine); keep the base clips synchronous. `lockerPreview.js`: add
```js
  /** Play an owned kick/taunt on the turntable (one-shot → back to idle). */
  playMove(clip) {
    const a = this.char?.animator;
    if (!a?.hasClip?.(clip)) return false;
    a.play(clip, { onDone: () => { if (this.char?.animator === a) a.play('idle'); } });
    return true;
  }
```
and make the turntable pause its spin while a move plays (`this.spinning` flag: false in `playMove`, true in its `onDone`) so the move faces the camera.
- [ ] **Step 4: The component** — `src/ui/screens/lockerScreen.js`:
```js
import { LockerPreview } from '../lockerPreview.js';
import { lockerTabs } from '../lockerModel.js';
import { gearLine } from '../../meta/gearLine.js';

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

/** One component, two modes: the menu's Locker (MAIN MENU) and the pre-game
 *  GEAR UP (PLAY). Turntable pinned on top, one tab's chips at a time; every
 *  tap re-renders the captain in place — no remount, no context churn. */
export function buildLocker(ctx, { mode, team, onPlay = null, onBack = null }) {
  const save = ctx.save;
  const { GEAR, isUnlocked, equipGear, equippedGear, careerGet } = ctx.unlocks;
  const career = careerGet(save);
  let tab = 'kick';
  const root = el(`
    <div class="screen locker-screen ${mode === 'gearUp' ? 'gear-up' : ''}">
      <h1 class="screen-title gold">${mode === 'gearUp' ? 'GEAR UP' : 'THE LOCKER'}</h1>
      <p class="map-sub">${mode === 'gearUp' ? "what you're taking to the block" : 'Earn it on the block. Tap it to rock it.'}</p>
      <div class="locker-stage"><canvas class="locker-preview" width="440" height="520"></canvas><p class="locker-stage-cap"></p><div class="locker-free hidden">FREE — YOUR STARTER GEAR</div></div>
      <div class="locker-tabs"></div>
      <div class="locker-chips"></div>
      <p class="locker-career">W ${career.wins} · HR ${career.hr} · STEALS ${career.steals} · GLOVE ${career.defOuts} · CREWS ${career.crews}/9</p>
      <div class="locker-actions"></div>
    </div>`);
  const actions = root.querySelector('.locker-actions');
  if (mode === 'gearUp') {
    actions.appendChild(el('<button class="big-play locker-play">PLAY<small>ROLL OUT</small></button>'));
    actions.appendChild(el('<button class="locker-back">← TEAMS</button>'));
    actions.querySelector('.locker-play').addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'bassdrop'); onPlay?.(); });
    actions.querySelector('.locker-back').addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'scratch'); onBack?.(); });
  } else {
    actions.appendChild(el('<div class="coin-buttons"><button data-act="menu">MAIN MENU</button></div>'));
    actions.querySelector('[data-act="menu"]').addEventListener('pointerdown', () => ctx.router.go('menu'));
  }
  let preview = null;
  const cap = root.querySelector('.locker-stage-cap');
  const refreshPreview = () => {
    const eq = equippedGear(save);
    cap.textContent = `${(team.roster?.[0]?.nick ?? 'YOUR CAPTAIN').toUpperCase()} — ${gearLine(eq)}`;
    preview?.show({ team, uniformHex: eq.uniform?.hex ?? null, gear: eq }).catch((e) => console.warn('[skk] locker preview failed:', e));
  };
  const render = () => {
    const eq = equippedGear(save);
    const tabs = lockerTabs({ GEAR, isUnlocked: (id) => isUnlocked(save, id), eq });
    const bar = root.querySelector('.locker-tabs');
    bar.replaceChildren(...tabs.map((t) => {
      const b = el(`<button class="locker-tab ${t.cat === tab ? 'on' : ''}">${t.label}<small>${t.owned}/${t.total}</small></button>`);
      b.addEventListener('pointerdown', () => { ctx.bus.emit('sfx', 'ui-tap'); tab = t.cat; render(); });
      return b;
    }));
    const row = root.querySelector('.locker-chips');
    const t = tabs.find((x) => x.cat === tab);
    row.replaceChildren(...t.chips.map((c) => {
      const swatch = c.hex && (t.cat === 'cleats' || t.cat === 'uniform') ? `<i class="swatch" style="background:${c.hex}"></i>` : '';
      const chip = el(`<div class="equip-chip locker-chip ${c.owned ? '' : 'locked'} ${c.on ? 'on' : ''} ${c.stock ? 'stock' : ''}" style="--c:${c.hex ?? '#e8792e'}">
        ${swatch}${c.owned ? c.name : '🔒 ' + c.name}<small>${c.owned ? (c.stock ? 'FREE · ' : '') + c.play : c.hint.toUpperCase()}</small></div>`);
      if (c.owned) chip.addEventListener('pointerdown', () => {
        ctx.bus.emit('sfx', 'ui-confirm');
        equipGear(save, t.cat, c.id);
        render();
        row.querySelector('.on')?.classList.add('just');
        if (c.clip) { if (!preview?.playMove(c.clip)) refreshPreview(); } else refreshPreview();
      });
      return chip;
    }));
  };
  render();
  try {
    preview = new LockerPreview(root.querySelector('.locker-preview'));
    refreshPreview();
  } catch (e) { console.warn('[skk] locker preview unavailable:', e); }
  return {
    el: root,
    selectTab(cat) { tab = cat; render(); },
    flashFree() { const f = root.querySelector('.locker-free'); f.classList.remove('hidden'); setTimeout(() => f.classList.add('hidden'), 3000); root.querySelector('.locker-chip.stock')?.classList.add('just'); },
    destroy() { preview?.destroy(); preview = null; },
  };
}

export function LockerScreen(ctx) {
  return {
    mount(root) {
      const team = ctx.playerTeam ?? ctx.data.teams[0];
      this.locker = buildLocker(ctx, { mode: 'locker', team });
      root.appendChild(this.locker.el);
    },
    unmount() { this.locker?.destroy(); this.locker = null; },
  };
}
```
Note: a kick/taunt tap plays the move on the CURRENT captain (no rebuild — the equipped kit/cleats didn't change); kits/cleats taps call `refreshPreview()` (rebuild in place, token-guarded, same canvas). Remove `LockerScreen` from `screens.js` (and its `LockerPreview` import if now unused); `main.js` imports `LockerScreen` from `./ui/screens/lockerScreen.js`.
- [ ] **Step 5: CSS** (replace the old locker block)
```css
/* THE LOCKER / GEAR UP — turntable pinned, one tab at a time */
.locker-screen { overflow: hidden; gap: 6px; }
.locker-stage { position: relative; display:flex; flex-direction:column; align-items:center; gap:4px; flex: 0 0 auto; }
.locker-preview { width: min(58vw, 240px); height: min(40vh, 280px); border-radius: 14px; background: radial-gradient(ellipse at 50% 80%, rgba(245,179,18,.18), transparent 60%); }
.locker-stage-cap { font-family: var(--sans); font-weight: 900; font-size: 11px; letter-spacing: .6px; color: var(--gold); max-width: 92vw; text-align: center; }
.locker-free { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); font-family: var(--sans); font-weight: 900; font-size: 12px; letter-spacing: .8px; color: #0b0d12; background: var(--gold); border-radius: 999px; padding: 6px 14px; animation: chipPulse 1s ease-in-out infinite; white-space: nowrap; }
.locker-free.hidden { display: none; }
.locker-tabs { display: flex; gap: 6px; width: 100%; max-width: 420px; }
.locker-tab { flex: 1; font-family: var(--marker); font-size: 13px; letter-spacing: .6px; color: var(--muted); background: rgba(0,0,0,.35); border: 2px solid #2e3344; border-radius: 12px; padding: 8px 4px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.locker-tab small { font-family: var(--sans); font-size: 9px; letter-spacing: .5px; }
.locker-tab.on { color: #0b0d12; background: var(--gold); border-color: var(--gold); }
.locker-chips { display: flex; gap: 8px; width: 100%; max-width: 420px; overflow-x: auto; padding: 6px 2px 10px; scroll-snap-type: x proximity; }
.locker-chip { flex: 0 0 auto; min-width: 128px; flex-direction: column; align-items: flex-start; gap: 2px; border-radius: 12px; scroll-snap-align: start; }
.locker-chip small { font-size: 9px; letter-spacing: .4px; color: var(--muted); font-family: var(--body, sans-serif); white-space: normal; }
.locker-chip.locked { opacity: .55; filter: saturate(.35); cursor: default; }
.locker-chip.on small { color: #0b0d12; }
.locker-chip.just { animation: crownPop .45s cubic-bezier(.2, 1.6, .4, 1); }
.locker-chip .swatch { display: block; width: 100%; height: 14px; border-radius: 6px; margin-bottom: 4px; border: 1px solid rgba(255,255,255,.25); }
.locker-career { color: var(--muted); font-size: 10px; letter-spacing: .6px; margin: 2px 0; text-align: center; }
.locker-actions { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: auto; padding-bottom: env(safe-area-inset-bottom); }
.locker-play { width: min(80vw, 320px); }
.locker-back { background: none; border: none; color: var(--muted); font-family: var(--sans); font-weight: 700; letter-spacing: 1px; text-decoration: underline; }
```
Keep `.equip-chip`/`.map-equip*` rules (the Map screen uses them). `crownPop`/`chipPulse` keyframes exist.
- [ ] **Step 6: Verify + commit** — `npm test`; browser `?nosplash&go=locker`: four tabs, KICKS shows THE FLAIR on + FREE, tapping KITS then a kit re-renders the same canvas (check `document.querySelector('canvas.locker-preview') === before`), tapping a taunt plays it on the turntable. Commit `feat(locker): tabbed customizer — turntable pinned, instant in-place preview, moves play on tap`.

---

### Task 5: GEAR UP before every game

**Files:**
- Modify: `src/ui/screens/lockerScreen.js` (add `GearUpScreen` + `gearUpArgs`), `src/ui/screens/screens.js` (TeamSelect START), `src/main.js` (register `gearUp`)
- Test: `tests/gearUp.test.js`

- [ ] **Step 1: Failing test**
```js
import { it, expect } from 'vitest';
import { gearUpArgs } from '../src/ui/screens/lockerScreen.js';
it('GEAR UP hands the exact team-select choice to startMatchFlow', () => {
  const away = { id: 'monarchs' }, home = { id: 'snappers' }, kits = { away: '#f5b312', home: '#1d6fd8' };
  expect(gearUpArgs({ away, home, kits })).toEqual([away, home, kits]);
  expect(() => gearUpArgs({})).toThrow();
});
```
(`lockerScreen.js` imports `LockerPreview` → three.js; vitest handles it (other tests import three). If the import of the screen module pulls DOM at module scope it won't — it doesn't.)
- [ ] **Step 2: Screen** (append to `lockerScreen.js`)
```js
export function gearUpArgs({ away, home, kits }) {
  if (!away || !home) throw new Error('gearUp needs { away, home }');
  return [away, home, kits ?? {}];
}
/** Pre-game GEAR UP: the Locker with PLAY. Team select routes here; PLAY hands
 *  the untouched team/kit choice to startMatchFlow, which reads equippedGear. */
export function GearUpScreen(ctx) {
  return {
    mount(root, params = {}) {
      const [away, home, kits] = gearUpArgs(params);
      this.locker = buildLocker(ctx, {
        mode: 'gearUp', team: away,
        onPlay: () => ctx.startMatchFlow(away, home, kits),
        onBack: () => ctx.router.go('teamSelect'),
      });
      root.appendChild(this.locker.el);
      if (!ctx.save.get('gearSeen', false)) {   // first time: show them the free gear ON the player
        ctx.save.set('gearSeen', true);
        this.locker.selectTab('cleats');
        this.locker.flashFree();
      }
    },
    unmount() { this.locker?.destroy(); this.locker = null; },
  };
}
```
`screens.js` TeamSelect START handler: replace `ctx.startMatchFlow(ready[sel.away], ready[sel.home], kits);` with `ctx.router.go('gearUp', { away: ready[sel.away], home: ready[sel.home], kits });`. `main.js`: import `GearUpScreen`, `router.register('gearUp', GearUpScreen);`. Confirm `router.go(name, params)` passes `params` to `mount(root, params)` (it does — `src/ui/router.js`).
- [ ] **Step 3: Verify + commit** — `npm test`; browser: `?nosplash` → PLAY 1v1 (tutorial gate: set `tutorialPlayed` true in the save first) → team select → START → GEAR UP with the away captain, PLAY → the intro videos start (`.screen` cleared, `ctx.playerTeam` set); BACK returns to team select; a cleared save shows the FREE banner + CLEATS tab. Commit `feat(flow): GEAR UP step after team select — customize, then PLAY`.

---

### Task 6: Harness, real-play pass, PR

- [ ] **Step 1: Harness** — extend `scripts/round-e2e.mjs` with: (a) **GEAR UP**: `?nosplash&go=teamSelect` (set `localStorage` save `tutorialPlayed: true` first), press `.m-start` → `.locker-screen.gear-up` with `.locker-play`; press PLAY → the black backdrop/intro appears (`!document.querySelector('.locker-screen')` and `__skk` eventually); (b) **LOCKER TABS**: `?nosplash&go=locker&e2e` → 4 `.locker-tab`s; tap KITS; tap an owned chip (grant `kit-blackout` via localStorage) → the `canvas.locker-preview` element is the SAME node before/after and the caption changes; tap TAUNTS → THE POINT → `__lockerAnim` (expose nothing new: assert via the caption + that the chip has `.just`); (c) **KICK CONTACT**: in the match harness, equip `kick-armada` via `__skk.power.gear = {...}` + `charges=1`, arm, then drive a kick and assert the approach reached ≥ 0.95 before launch (wrap `__skk.onKickContact` to record `__skk._kickApproach.t/dur` at call time — the wrap must read the fraction BEFORE `launchNow` nulls it: patch `launchNow` order or record in `onKickContact` from a copy taken each frame); (d) **WALK-UP CAM**: during `walkup.phase === 'walk'` the camera's z ≈ kicker z + 2.8 (±0.6); at the first PITCH `camera.position` ≈ `(0,3.4,8)` (±0.05). Run booth + round harnesses sequentially; ALL PASS.
- [ ] **Step 2: Real-play pass** (claude-in-chrome; virtual clock if rAF is throttled): Flair meets the ball; Armada meets the ball with the LEFT foot; walk-up dolly + taunt push-in + cut; GEAR UP flow; Locker tabs + instant preview + move playback; first-run FREE callout on a cleared save. Append `## Real-play pass results (2026-08-27)` to the spec with honest gaps. Restore the dev's localStorage.
- [ ] **Step 3: Suites** — `npm test`, `node scripts/verify-anims.mjs`, both harnesses.
- [ ] **Step 4: PR** — push the branch, `gh pr create` (title `Locker rebuild, GEAR UP, walk-up camera & kick contact`, body with summary + test plan + the phone-check list + the trailers). Do NOT merge; deploy waits for the dev's "push".

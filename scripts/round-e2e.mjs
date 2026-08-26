// E2E probe for the look/gear/sound/walk-up/runners round (2026-08-25).
// Drives the REAL game in Playwright WebKit (the repo's iOS-truthful harness).
// Run: node scripts/round-e2e.mjs   (dev server must be up on :5173)
//
// Scenarios:
//   1. PRE-GAME    — STARTING LINEUPS stamp, away crest then home crest, taps
//                    are inert, the GAME TIME break, first at-bat follows.
//   2. SKIP CHIP   — the chip ends the pre-game NOW, long before it would end
//                    on its own.
//   3. WALK-UP     — the kicker starts at the far mark on 'walk', travels at
//                    1.6 m/s, taunts to camera with the crowd, lands on the
//                    plate, then the pitch. A tap skips it. CPU kickers walk
//                    up too — and get booed.
//   4. POWER KICK  — dark with no charges, lit + named with one, tap arms it
//                    with the crown-arm sting, hidden while you're fielding.
//   5. SFX         — every alias resolves, every warm name is a real file,
//                    every sfx URL is actually on disk, HUD presses are heard.
//   6. ARROWS      — an off-frame runner gets ONE clamped edge chip naming his
//                    bag; in frame he gets none; the walk-up gate clears them.
//   7. DIAMOND     — score-bug dots ride the basepath at the right fraction
//                    and flash home on a score.
//   8. DANCE BAG   — a full bag cycle is all-distinct, and no draw ever
//                    repeats back-to-back across the refill seam.
//   9. MSAA        — the composer target starts at 4 samples, setSamples(2)
//                    lands on both targets and the loop survives, ?msaa= wins.
//  10. LOCKER      — the preview canvas renders a lit captain over a clear
//                    background, and the caption names him and his kit.
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
let failures = 0;
let skips = 0;
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures += 1;
  return !!cond;
};
const skip = (label) => { console.log(`SKIP  ${label}`); skips += 1; };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;

async function poll(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await page.evaluate(fn);
    if (v) return v;
    await page.waitForTimeout(50);
  }
  console.log(`TIMEOUT  ${label}`);
  return null;
}

/** Boot a match/flow page, wire the observers, and release the element-intro
 *  hold. IMPORTANT: startMatch() has already run by the time __skk appears, so
 *  the first at-bat's walk-up exists BUT the engine is paused behind the
 *  element card — every observer below is installed before a single frame runs,
 *  which is what makes the walk-up travel samples start at the far mark. */
async function boot(page, q) {
  await page.goto(`${BASE}/?${q}`, { waitUntil: 'domcontentloaded' });
  if (!(await poll(page, () => !!window.__skk, 30000, 'scene boot'))) throw new Error('scene never booted');
  return page.evaluate(() => {
    const s = window.__skk;
    window.__sfxLog = []; window.__bus.on('sfx', (n) => window.__sfxLog.push(n));
    window.__musicLog = []; window.__bus.on('music', (m) => window.__musicLog.push(m));
    window.__stamps = [];    // every stamp band that appeared, in order
    window.__splashes = [];  // every team-splash crew word, in order
    window.__walk = [];      // [elapsed, kicker x, walk-up phase, clip] per frame
    window.__skk.engine.onFrame(() => {
      for (const el of document.querySelectorAll('.stamp span')) {
        if (window.__stamps[window.__stamps.length - 1] !== el.textContent) window.__stamps.push(el.textContent);
      }
      const crew = document.querySelector('.team-splash .ts-crew')?.textContent;
      if (crew && window.__splashes[window.__splashes.length - 1] !== crew) window.__splashes.push(crew);
      if (s.walkup) window.__walk.push([s.elapsed, s.kicker.group.position.x, s.walkup.phase, s.kicker.animator.name]);
    });
    const snap = {
      phase: s.phase,
      paused: s.engine.paused,
      x: s.kicker?.group.position.x,
      anim: s.kicker?.animator.name,
      walkup: s.walkup ? { phase: s.walkup.phase, taunt: s.walkup.taunt, isPlayer: s.walkup.isPlayer } : null,
    };
    // the element teach card holds the whole game paused until it's tapped
    document.querySelector('.element-intro')?.dispatchEvent(new Event('pointerdown'));
    return snap;
  });
}

// ---------------------------------------------------------------- 1. PRE-GAME
async function pregameScenario(page) {
  console.log('\n--- 1: PRE-GAME ---');
  await boot(page, 'match&nosplash');
  ok(!!(await poll(page, () => window.__skk.walkoutActive === true, 10000, 'pre-game')), 'pre-game show started (walkoutActive)');
  ok(await page.evaluate(() => !!document.querySelector('.skip-chip')), 'the SKIP chip is offered');
  ok(!!(await poll(page, () => window.__stamps.includes('STARTING LINEUPS'), 6000, 'lineups stamp')), 'STARTING LINEUPS stamp opens the show');
  // a stray tap must NOT eat the lineups — only the chip gets out
  await page.evaluate(() => window.__skk.onTap({ x: 200, y: 500 }));
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__skk.walkoutActive === true), 'a stray tap is inert during the pre-game');
  const splashes = await poll(page, () => (window.__splashes.length >= 2 ? window.__splashes : null), 8000, 'both splashes');
  ok(splashes?.[0] === 'MONARCHS', `away crest splashes first (${splashes?.[0]})`);
  ok(splashes?.[1] === 'SNAPPERS', `home crest splashes second (${splashes?.[1]})`);
  ok(!!(await poll(page, () => !window.__skk.walkoutActive, 10000, 'pre-game end')), 'pre-game ends on its own');
  const stamps = await page.evaluate(() => window.__stamps);
  ok(/GAME TIME/i.test(stamps[stamps.length - 1] ?? ''), `GAME TIME! is the break stamp (${stamps.join(' | ')})`);
  const sfx = await page.evaluate(() => window.__sfxLog.slice());
  ok(sfx.includes('scratch'), `a record scratch closes the pre-game (${sfx.slice(0, 6).join(',')})`);
  // the beat is deliberately held 1.6s behind the stop (the BREAK) — poll it out
  const music = await poll(page, () => {
    const log = window.__musicLog;
    const stopI = log.findIndex((m) => m?.stop);
    const beatI = log.findIndex((m) => m?.name === 'beat');
    return stopI >= 0 && beatI > stopI ? log.map((m) => (m?.stop ? 'stop' : m?.name)) : null;
  }, 6000, 'music stop -> beat');
  ok(!!music, `music stops at the break, the in-match beat starts after it (${music?.join(' -> ') ?? 'never'})`);
  // NB: every poll predicate must return a PLAIN value — handing Playwright a
  // live scene object (walkup.char is a whole three.js character) wedges the
  // serializer for minutes.
  ok(!!(await poll(page, () => !!window.__skk.walkup || ['PITCH', 'PITCH_SELECT'].includes(window.__skk.phase), 20000, 'first at-bat')),
    'the first at-bat follows the break');
}

// --------------------------------------------------------------- 2. SKIP CHIP
async function skipChipScenario(page) {
  console.log('\n--- 2: SKIP CHIP ---');
  // The pre-game runs ~4.3s on its own (pregame.js: 0.2 + 0.3 + 1.9 + 1.9).
  // Press the chip while the FIRST crest is still up, then demand the show be
  // over inside 1.5s — a pass here cannot be the show ending by itself.
  await boot(page, 'match&nosplash');
  if (!ok(!!(await poll(page, () => window.__splashes.length >= 1 && window.__skk.walkoutActive, 10000, 'first crest')), 'chip test starts mid-show')) return;
  const pressed = await page.evaluate(() => {
    const chip = document.querySelector('.skip-chip');
    if (!chip) return null;
    chip.dispatchEvent(new Event('pointerdown'));
    return true;
  });
  ok(!!pressed, 'the SKIP chip is on screen mid-show');
  ok(!!(await poll(page, () => !window.__skk.walkoutActive, 1500, 'skip ends the show')), 'the chip ends the pre-game inside 1.5s (it runs 4.3s on its own)');
  ok(!!(await poll(page, () => window.__stamps.some((t) => /GAME TIME/i.test(t)), 2000, 'GAME TIME')), 'the skip still gets the GAME TIME break');
  ok(await page.evaluate(() => !document.querySelector('.skip-chip') && !document.querySelector('.team-splash')),
    'the chip and the crest clear with the show');
}

// ----------------------------------------------------------------- 3. WALK-UP
async function walkupScenario(page) {
  console.log('\n--- 3: WALK-UP ---');
  const snap = await boot(page, 'match&nosplash&nointro');
  ok(snap.walkup?.phase === 'walk', `the first at-bat opens on a walk-up (${snap.walkup?.phase})`);
  ok(snap.x === -3.4, `the kicker starts at the far mark (x ${snap.x})`);
  ok(snap.anim === 'walk', `he starts on the walk clip (${snap.anim})`);
  ok(!!snap.walkup?.taunt, `a taunt is picked up front (${snap.walkup?.taunt})`);

  const taunting = await poll(page, () => (window.__skk.walkup?.phase === 'taunt'
    ? { anim: window.__skk.kicker.animator.name, x: window.__skk.kicker.group.position.x, sfx: [...window.__sfxLog] }
    : null), 12000, 'taunt phase');
  ok(!!taunting, 'the walk-up reaches the taunt');
  ok(/^taunt/.test(taunting?.anim ?? ''), `he taunts on a taunt clip (${taunting?.anim})`);
  ok(taunting?.x === -0.9, `the taunt happens AT the plate (x ${taunting?.x})`);
  ok(taunting?.sfx.includes('crowd-cheer'), `your kicker's taunt gets the crowd (${taunting?.sfx.join(',')})`);

  // travel truth, read off the recorded frames of the walk phase
  const walk = (await page.evaluate(() => window.__walk)).filter((s) => s[2] === 'walk');
  const first = walk[0], last = walk[walk.length - 1];
  const mps = walk.length > 4 ? (last[1] - first[1]) / (last[0] - first[0]) : NaN;
  ok(walk.length > 4 && first[1] < -3.2, `the walk is a real traverse from the far mark (${walk.length} frames from x ${first?.[1]?.toFixed(2)})`);
  ok(near(mps, 1.6, 0.15), `he walks at 1.6 m/s (measured ${mps.toFixed(2)})`);
  ok(walk.every((s) => s[3] === 'walk'), 'the walk clip runs for the whole traverse');

  const plated = await poll(page, () => (window.__skk.walkup === null
    ? { x: window.__skk.kicker.group.position.x, anim: window.__skk.kicker.animator.name }
    : null), 8000, 'walk-up ends');
  ok(plated?.anim === 'plate', `he settles into the plate stance (${plated?.anim})`);
  ok(!!(await poll(page, () => ['PITCH', 'PITCH_SELECT'].includes(window.__skk.phase), 6000, 'serve')), 'the pitch follows the walk-up');

  // ---- a tap skips the next one, and the walk starts with a stomp
  await page.evaluate(() => { const s = window.__skk; s.clearTimers(); window.__sfxLog.length = 0; s.nextAtBat(); });
  ok(!!(await poll(page, () => window.__skk.walkup?.phase === 'walk', 5000, 'second walk-up')), 'every at-bat gets a walk-up, not just the first');
  ok(await page.evaluate(() => window.__sfxLog.includes('stomp')), 'a stomp lands under the first step');
  const snapped = await page.evaluate(() => {
    const s = window.__skk;
    s.onTap({ x: 200, y: 500 });
    return { walkup: !!s.walkup, x: s.kicker.group.position.x, anim: s.kicker.animator.name };
  });
  ok(snapped.walkup === false && snapped.x === -0.9 && snapped.anim === 'plate',
    `a tap snaps him straight to the plate (x ${snapped.x}, ${snapped.anim})`);
  ok(!!(await poll(page, () => ['PITCH', 'PITCH_SELECT'].includes(window.__skk.phase), 3000, 'serve after skip')), 'the serve follows the skip');

  // ---- the CPU side walks up too (and gets booed, not cheered)
  await page.evaluate(() => {
    const s = window.__skk;
    s.clearTimers(); window.__sfxLog.length = 0;
    s.match.state.half = 'bottom'; // hand the bat to the CPU without playing three outs
    s.nextAtBat();
  });
  const cpuWalk = await poll(page, () => (window.__skk.walkup?.phase === 'walk'
    ? { isPlayer: window.__skk.walkup.isPlayer, x: window.__skk.kicker.group.position.x, side: window.__skk.match.kickingSide() }
    : null), 5000, 'cpu walk');
  ok(cpuWalk?.isPlayer === false && cpuWalk?.side === 'home', `the CPU kicker walks up too (side ${cpuWalk?.side}, isPlayer ${cpuWalk?.isPlayer})`);
  const cpuTaunt = await poll(page, () => (window.__skk.walkup?.phase === 'taunt'
    ? { anim: window.__skk.kicker.animator.name, sfx: [...window.__sfxLog] } : null), 6000, 'cpu taunt');
  ok(/^taunt/.test(cpuTaunt?.anim ?? ''), `the CPU hits a taunt as well (${cpuTaunt?.anim})`);
  ok(cpuTaunt?.sfx.includes('boo') && !cpuTaunt.sfx.includes('crowd-cheer'), `the block BOOS the CPU taunt (${cpuTaunt?.sfx.join(',')})`);
  // hand the bat back so the rest of the run kicks
  await page.evaluate(() => { const s = window.__skk; s.clearTimers(); s.match.state.half = 'top'; s.nextAtBat(); });
  ok(await page.evaluate(() => window.__skk.kickingIsPlayer()), 'the bat is back with the player');
}

// -------------------------------------------------------------- 4. POWER KICK
async function powerKickScenario(page) {
  console.log('\n--- 4: POWER KICK ---');
  const res = await page.evaluate(() => {
    const s = window.__skk;
    const btn = document.querySelector('.special-btn');
    const label = () => btn.querySelector('.pk-label').textContent;
    // no charges banked: dark, and a tap must do nothing
    s.power.charges = 0; s.power.armed = false; s.refreshHud();
    window.__sfxLog.length = 0;
    btn.dispatchEvent(new Event('pointerdown'));
    const dark = { ready: btn.classList.contains('ready'), armed: s.power.armed, label: label(), sfx: [...window.__sfxLog] };
    // one banked charge: lit, named, and armable
    s.power.charges = 1; s.refreshHud();
    const lit = { ready: btn.classList.contains('ready'), hidden: btn.classList.contains('hidden'), label: label() };
    window.__sfxLog.length = 0;
    btn.dispatchEvent(new Event('pointerdown'));
    const armed = { armed: s.power.armed, cls: btn.classList.contains('armed'), sfx: [...window.__sfxLog], label: label() };
    // fielding: the crown has no business on screen
    s.power.disarm();
    s.playerSide = s.match.fieldingSide(); s.refreshHud();
    const fielding = { hidden: btn.classList.contains('hidden'), isPlayer: s.kickingIsPlayer() };
    s.playerSide = 'away'; s.power.charges = 0; s.refreshHud();
    return { dark, lit, armed, fielding, restored: s.kickingIsPlayer() };
  });
  ok(res.dark.ready === false, 'no charge banked -> the crown stays dark');
  ok(res.dark.armed === false && !res.dark.sfx.includes('crown-arm'), `tapping a dark crown arms nothing (${res.dark.sfx.join(',') || 'silent'})`);
  ok(res.dark.label === 'CROWN KICK', `the dark label is the bare name (${res.dark.label})`);
  ok(res.lit.ready === true && res.lit.hidden === false, 'a banked charge lights the button');
  ok(res.lit.label === 'CROWN KICK ×1', `the label carries name and count (${res.lit.label})`);
  ok(res.armed.armed === true && res.armed.cls === true, 'the tap ARMS the kick');
  ok(res.armed.sfx.includes('crown-arm'), `the arm plays the crown-arm sting (${res.armed.sfx.join(',')})`);
  ok(res.fielding.hidden === true && res.fielding.isPlayer === false, 'the crown hides while you are in the field');
  ok(res.restored === true, 'the kicking role is restored for the rest of the run');
}

// --------------------------------------------------------------------- 5. SFX
async function sfxScenario(page) {
  console.log('\n--- 5: SFX ---');
  const res = await page.evaluate(async () => {
    const mod = await import('/src/engine/audio.js');
    const missingAlias = Object.entries(mod.SFX_ALIAS).filter(([, a]) => !a.synth && !mod.SFX_FILES[a.file]).map(([k]) => k);
    const missingWarm = mod.WARM_LIST.filter((n) => !mod.SFX_FILES[n]);
    const urls = [...new Set(Object.values(mod.SFX_FILES))];
    const missingFiles = [];
    for (const u of urls) {
      try { const r = await fetch(u, { method: 'HEAD' }); if (!r.ok) missingFiles.push(`${u} -> ${r.status}`); }
      catch { missingFiles.push(`${u} -> fetch failed`); }
    }
    window.__sfxLog.length = 0;
    document.querySelector('.pitch-select button')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    const afterPitch = [...window.__sfxLog];
    document.querySelector('.throw-pad button')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    return { missingAlias, missingWarm, nUrls: urls.length, missingFiles, afterPitch, log: [...window.__sfxLog] };
  });
  ok(res.missingAlias.length === 0, `every sfx alias resolves to a file or a synth (${res.missingAlias.join(', ') || 'none missing'})`);
  ok(res.missingWarm.length === 0, `every warm-list name is a real sfx file (${res.missingWarm.join(', ') || 'none missing'})`);
  ok(res.nUrls > 25 && res.missingFiles.length === 0, `all ${res.nUrls} sfx files are actually on disk (${res.missingFiles.join(', ') || 'none missing'})`);
  ok(res.afterPitch.includes('ui-tap'), `a picker press emits ui-tap (${res.afterPitch.join(',') || 'silent'})`);
  ok(res.log.includes('ui-confirm'), `a throw-pad press emits ui-confirm (${res.log.join(',')})`);
}

// ------------------------------------------------------------------ 6. ARROWS
async function arrowsScenario(page) {
  console.log('\n--- 6: ARROWS ---');
  const res = await page.evaluate(() => {
    // everything below happens inside ONE evaluate, so no frame of the real
    // game interleaves and no staged state has to be torn down defensively
    const s = window.__skk;
    s.walkup = null; s.cinematicLock = false; s.duel = null; s.walkoutActive = false;
    s.engine.cameraLock = true; // the camera director must not fight the probe
    const runner = s.chars.away[1];
    const r = s.makeRunner(0, runner, 0); // on 1st, running for 2nd
    r.sim.progressM = 4;
    s.runners.push(r);
    const read = () => {
      const els = [...document.querySelectorAll('.runner-arrow')];
      const first = els[0];
      const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(first?.style.transform ?? '');
      return {
        n: els.length,
        label: first?.querySelector('span')?.textContent,
        number: first?.querySelector('b')?.textContent,
        x: m ? Number(m[1]) : NaN, y: m ? Number(m[2]) : NaN,
      };
    };
    // camera pointed the WRONG way down the street: the runner is behind us
    s.engine.camera.position.set(0, 3, 30); s.engine.camera.lookAt(0, 1, 60);
    s.updateRunnerArrows();
    const off = read();
    const rect = s.engine.renderer.domElement.getBoundingClientRect();
    // now look right at him
    const p = s.runnerWorldPos(r).p;
    s.engine.camera.position.set(p.x, p.y + 4, p.z + 14); s.engine.camera.lookAt(p.x, p.y + 1, p.z);
    s.updateRunnerArrows();
    const inFrame = read();
    // held on the bag reads the bag, not a target
    s.engine.camera.position.set(0, 3, 30); s.engine.camera.lookAt(0, 1, 60);
    r.state = 'held'; r.heldAt = 1;
    s.updateRunnerArrows();
    const held = read();
    // a live walk-up owns the screen: no chips
    r.state = 'running';
    s.walkup = { char: s.kicker, phase: 'walk', until: s.elapsed + 1, taunt: null, isPlayer: true };
    s.updateRunnerArrows();
    const gated = read();
    s.walkup = null;
    for (const q of s.runners) s.releaseTrail(q);
    s.runners.length = 0;
    s.updateRunnerArrows(); s.updateRunnerDots();
    s.engine.cameraLock = false;
    return { off, inFrame, held, gated, cleared: document.querySelectorAll('.runner-arrow').length, number: runner.number, w: rect.width, h: rect.height };
  });
  ok(res.off.n === 1, `one edge chip for the off-frame runner (${res.off.n})`);
  ok(res.off.label === '→2ND', `the chip names the bag he is running for (${res.off.label})`);
  ok(res.off.number === `#${res.number}`, `the chip carries his number (${res.off.number})`);
  ok(res.off.x >= 0 && res.off.x <= res.w && res.off.y >= 0 && res.off.y <= res.h,
    `the chip is CLAMPED on screen, not projected off it (${res.off.x?.toFixed(0)},${res.off.y?.toFixed(0)} in ${res.w}x${res.h})`);
  ok(res.inFrame.n === 0, `no chip when the camera can already see him (${res.inFrame.n})`);
  ok(res.held.n === 1 && res.held.label === 'ON 2ND', `a held runner reads his bag (${res.held.label})`);
  ok(res.gated.n === 0, `a live walk-up clears the chips (${res.gated.n})`);
  ok(res.cleared === 0, 'chips clear with the runners');
}

// ----------------------------------------------------------------- 7. DIAMOND
async function diamondScenario(page) {
  console.log('\n--- 7: DIAMOND ---');
  const res = await page.evaluate(() => {
    const s = window.__skk;
    const r = s.makeRunner(0, s.chars.away[2], 0); // 1st -> 2nd
    s.runners.push(r);
    const read = () => [...document.querySelectorAll('.dm-dot')].map((c) => ({
      cx: c.getAttribute('cx'), cy: c.getAttribute('cy'), scored: c.classList.contains('scored'),
    }));
    r.sim.progressM = s.tuning.running.basePathM * 0.25;
    s.updateRunnerDots();
    const quarter = read();
    r.sim.progressM = s.tuning.running.basePathM * 0.75;
    s.updateRunnerDots();
    const threeQ = read();
    r.state = 'scored'; r.scoredAt = s.elapsed;
    s.updateRunnerDots();
    const scored = read();
    for (const q of s.runners) s.releaseTrail(q);
    s.runners.length = 0;
    s.updateRunnerDots();
    return { quarter, threeQ, scored, cleared: document.querySelectorAll('.dm-dot').length };
  });
  // the score-bug diamond puts 1st at (41,15) and 2nd at (22,3)
  ok(res.quarter.length === 1, `a running runner puts one dot on the bug (${res.quarter.length})`);
  ok(res.quarter[0]?.cx === '36.3' && res.quarter[0]?.cy === '12.0',
    `the dot sits a quarter of the way 1st->2nd (${res.quarter[0]?.cx},${res.quarter[0]?.cy})`);
  ok(res.threeQ[0]?.cx === '26.8' && res.threeQ[0]?.cy === '6.0',
    `the dot slides on with him to three quarters (${res.threeQ[0]?.cx},${res.threeQ[0]?.cy})`);
  ok(res.scored[0]?.scored === true && res.scored[0]?.cx === '22.0' && res.scored[0]?.cy === '27.0',
    `a score flashes the dot home (${res.scored[0]?.cx},${res.scored[0]?.cy} scored=${res.scored[0]?.scored})`);
  ok(res.cleared === 0, 'dots clear with the runners');
}

// --------------------------------------------------------------- 8. DANCE BAG
async function danceScenario(page) {
  console.log('\n--- 8: DANCE BAG ---');
  const res = await page.evaluate(() => {
    const s = window.__skk;
    const c = s.chars.away[0];
    const first = s.danceBag.draw(c);          // seeds `known` from this body's clips
    const pool = s.danceBag.known.size;
    const cycle1 = [first, ...Array.from({ length: pool - 1 }, () => s.danceBag.draw(c))];
    const cycle2 = Array.from({ length: pool }, () => s.danceBag.draw(c));
    return { pool, cycle1, cycle2 };
  });
  const all = [...res.cycle1, ...res.cycle2];
  ok(res.pool >= 4, `the bag knows a real pool (${res.pool} dances)`);
  ok(new Set(res.cycle1).size === res.pool, `one bag cycle is ALL distinct (${new Set(res.cycle1).size}/${res.pool}: ${res.cycle1.join(',')})`);
  ok(new Set(res.cycle2).size === res.pool, `the refilled bag is all distinct too (${new Set(res.cycle2).size}/${res.pool})`);
  const adj = all.findIndex((d, i) => i > 0 && d === all[i - 1]);
  ok(adj === -1, `no back-to-back repeat across ${all.length} draws, refill seam included${adj === -1 ? '' : ` (${all[adj]} at ${adj})`}`);
}

// -------------------------------------------------------------------- 9. MSAA
async function msaaScenario(page) {
  console.log('\n--- 9: MSAA ---');
  // A FRESH page: the perf watchdog steps 4 -> 2 -> 0 after 5s warm-up + a 3s
  // window, so the default has to be read before the harness's own slow frames
  // earn a downgrade.
  await page.goto(`${BASE}/?nosplash&go=menu`, { waitUntil: 'domcontentloaded' });
  if (!ok(!!(await poll(page, () => !!window.__engine?.composer, 20000, 'engine')), 'engine up on the flow page')) return;
  const start = await page.evaluate(() => ({ s: window.__engine.samples, rt1: window.__engine.composer.renderTarget1.samples, rt2: window.__engine.composer.renderTarget2.samples }));
  ok(start.s === 4 && start.rt1 === 4 && start.rt2 === 4, `the composer targets start at 4x MSAA (${JSON.stringify(start)})`);
  const dropped = await page.evaluate(async () => {
    let frames = 0;
    const off = window.__engine.onFrame(() => { frames += 1; });
    window.__engine.setSamples(2);
    await new Promise((r) => setTimeout(r, 400));
    off?.();
    return { s: window.__engine.samples, rt1: window.__engine.composer.renderTarget1.samples, rt2: window.__engine.composer.renderTarget2.samples, frames };
  });
  ok(dropped.s === 2 && dropped.rt1 === 2 && dropped.rt2 === 2, `setSamples(2) lands on both targets (${JSON.stringify(dropped)})`);
  ok(dropped.frames > 2, `the render loop survives the re-allocation (${dropped.frames} frames after)`);
  await page.goto(`${BASE}/?nosplash&go=menu&msaa=0`, { waitUntil: 'domcontentloaded' });
  if (!(await poll(page, () => !!window.__engine?.composer, 20000, 'engine (msaa=0)'))) return ok(false, '?msaa=0 page booted');
  const forced = await page.evaluate(() => ({ s: window.__engine.samples, rt1: window.__engine.composer.renderTarget1.samples }));
  ok(forced.s === 0 && forced.rt1 === 0, `?msaa=0 overrides the default (${JSON.stringify(forced)})`);
}

// ------------------------------------------------------------------ 10. LOCKER
async function lockerScenario(page) {
  console.log('\n--- 10: LOCKER ---');
  // ?e2e turns on preserveDrawingBuffer for the pixel read-back below
  await page.goto(`${BASE}/?nosplash&go=locker&e2e`, { waitUntil: 'domcontentloaded' });
  const cap = await poll(page, () => document.querySelector('.locker-stage-cap')?.textContent || null, 20000, 'locker caption');
  ok(!!cap && cap.includes('—'), `the stage caption names the captain and his kit (${cap})`);
  ok(await page.evaluate(() => !!document.querySelector('canvas.locker-preview')), 'the preview canvas is mounted');
  const glOk = await page.evaluate(() => {
    const c = document.querySelector('canvas.locker-preview');
    if (!c) return false;
    try { return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  });
  if (!glOk) {
    skip('the Locker preview pixel check needs a WebGL context — none in this browser; re-run in Chrome');
    return;
  }
  // preserveDrawingBuffer is on for exactly this read. A lit captain over a
  // transparent stage = opaque LIT pixels AND clear pixels in the same strip;
  // a black or empty canvas fails both halves.
  const px = await poll(page, () => {
    const c = document.querySelector('canvas.locker-preview');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl || !c.width) return null;
    const w = c.width, rows = 8, y = Math.floor(c.height * 0.45);
    const buf = new Uint8Array(4 * w * rows);
    gl.readPixels(0, y, w, rows, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let lit = 0, clear = 0;
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] > 200 && (buf[i] > 12 || buf[i + 1] > 12 || buf[i + 2] > 12)) lit += 1;
      else if (buf[i + 3] < 40) clear += 1;
    }
    const total = w * rows;
    return lit > total * 0.05 && clear > total * 0.05 ? { lit, clear, total } : null;
  }, 20000, 'preview pixels');
  ok(!!px, `the preview renders a lit captain over a clear stage (${px ? `${px.lit} lit / ${px.clear} clear of ${px.total}` : 'never lit'})`);
}

// fail FAST and legibly when the dev server isn't up, instead of ten scenarios
// each grinding through a 30s boot timeout
try {
  const r = await fetch(BASE, { method: 'GET' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.error(`No dev server at ${BASE} (${e.message}).\nStart one with: npm run dev`);
  process.exit(1);
}

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); failures += 1; });

const scenarios = [
  ['PRE-GAME', pregameScenario],
  ['SKIP CHIP', skipChipScenario],
  // 3-8 share ONE ?nosplash&nointro match page: walkupScenario boots it
  ['WALK-UP', walkupScenario],
  ['POWER KICK', powerKickScenario],
  ['SFX', sfxScenario],
  ['ARROWS', arrowsScenario],
  ['DIAMOND', diamondScenario],
  ['DANCE BAG', danceScenario],
  ['MSAA', msaaScenario],
  ['LOCKER', lockerScenario],
];
for (const [name, fn] of scenarios) {
  try { await fn(page); }
  catch (e) { console.log(`FAIL  <${name}> threw: ${e.message}`); failures += 1; }
}
await browser.close();
console.log(`\n${failures ? `${failures} FAILURE(S)` : 'ALL PASS'}${skips ? ` (${skips} SKIPPED)` : ''}`);
process.exit(failures ? 1 : 0);

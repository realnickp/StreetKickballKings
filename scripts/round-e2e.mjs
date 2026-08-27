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
//  11. GEAR UP     — team select's START lands on GEAR UP, the first run opens
//                    on CLEATS with the FREE callout, BACK returns to the
//                    matchup, a second visit is quiet, PLAY runs the flow.
//  12. LOCKER TABS — four tabs, and an equip re-renders on the SAME canvas
//                    node (no remount): the caption and the chip follow, the
//                    tapped taunt PLAYS on the captain, four cleat equips leave
//                    the GPU flat, and ICE/BLACKOUTS read in their own colour.
//  13. KICK CONTACT— an armed ARMADA launches at the clip's contact frame
//                    (approach ≥ 95%) with the ball riding the LEFT foot.
//  14. WALK-UP CAM — walkupDolly rides 2.8 m off the kicker through the walk,
//                    walkupTaunt owns the taunt, and the cut lands the kick /
//                    pitch-select cam EXACTLY on its mark. CPU side too.
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
// hue in degrees (0-360) from an sRGB triple; the cleat assertions compare a
// rendered boot pixel against the gear's own hex, and only the HUE survives
// tone mapping + the baked shoe's shading intact enough to assert on.
const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
};
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

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

// ----------------------------------------------------------------- 11. GEAR UP
// A save is written BEFORE the boot that reads it: SaveManager slurps
// localStorage in its constructor, so `?go=teamSelect` must be a fresh
// navigation. `tutorialPlayed` keeps the menu from hijacking us into the
// drills; `gearSeen` is deliberately ABSENT — the first-run callout is the
// thing under test.
async function gearUpScenario(page) {
  console.log('\n--- 11: GEAR UP ---');
  await page.goto(`${BASE}/?nosplash&go=menu`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('skk-save-v1', JSON.stringify({ tutorialPlayed: true })));
  // the dev deep link carries no matchup — GEAR UP must route on, not throw
  // (a pageerror here is counted as a failure by the harness's own handler)
  await page.goto(`${BASE}/?nosplash&go=gearUp`, { waitUntil: 'domcontentloaded' });
  ok(!!(await poll(page, () => !!document.querySelector('.matchup-screen .m-start') && !document.querySelector('.locker-screen.gear-up'), 20000, 'gearUp deep link')),
    'a bare ?go=gearUp deep link falls through to team select instead of throwing');
  await page.goto(`${BASE}/?nosplash&go=teamSelect`, { waitUntil: 'domcontentloaded' });
  if (!ok(!!(await poll(page, () => !!document.querySelector('.matchup-screen .m-start'), 20000, 'team select')), 'team select is up')) return;
  // cycle off the defaults and flip a kit, so "← TEAMS put the matchup back"
  // means the CHOSEN matchup, not just any matchup
  const matchup = () => page.evaluate(() => ({
    away: document.querySelector('.m-side.away .m-name').textContent,
    home: document.querySelector('.m-side.home .m-name').textContent,
    kits: [...document.querySelectorAll('.kit-label')].map((k) => k.textContent).join('/'),
  }));
  await page.evaluate(() => {
    document.querySelector('.m-side.away .next').dispatchEvent(new Event('pointerdown'));
    document.querySelector('.m-side.home .next').dispatchEvent(new Event('pointerdown'));
    document.querySelector('.m-side.home .kit-toggle').dispatchEvent(new Event('pointerdown'));
  });
  const chosen = await matchup();
  await page.evaluate(() => document.querySelector('.m-start').dispatchEvent(new Event('pointerdown')));

  const first = await poll(page, () => {
    const s = document.querySelector('.locker-screen.gear-up');
    if (!s) return null;
    const on = [...s.querySelectorAll('.locker-tab')].find((b) => b.classList.contains('on'));
    return {
      play: !!s.querySelector('.locker-play'),
      back: !!s.querySelector('.locker-back'),
      menu: !!s.querySelector('[data-act="menu"]'),
      onTab: on?.childNodes[0]?.textContent?.trim() ?? null,
      free: !s.querySelector('.locker-free').classList.contains('hidden'),
      justStock: !!s.querySelector('.locker-chip.stock.just'),
    };
  }, 15000, 'gear up');
  ok(!!first, 'START MATCH lands on GEAR UP, not straight into the intro videos');
  ok(first?.play === true && first?.back === true, 'GEAR UP offers PLAY and a way back to TEAMS');
  ok(first?.menu === false, 'the pre-game screen has no MAIN MENU escape hatch');
  ok(first?.onTab === 'CLEATS', `the first run opens ON the CLEATS tab (${first?.onTab})`);
  ok(first?.free === true, 'the FREE — YOUR STARTER GEAR callout is up on the first run');
  ok(first?.justStock === true, 'the free chip itself pulses so the eye lands on it');

  await page.evaluate(() => document.querySelector('.locker-back').dispatchEvent(new Event('pointerdown')));
  ok(!!(await poll(page, () => !!document.querySelector('.matchup-screen .m-start') && !document.querySelector('.locker-screen'), 8000, 'back to teams')),
    '← TEAMS puts the matchup screen back');
  const restored = await matchup();
  ok(restored.away === chosen.away && restored.home === chosen.home && restored.kits === chosen.kits,
    `← TEAMS keeps the matchup you picked (${restored.away} @ ${restored.home}, ${restored.kits}) — chosen was (${chosen.away} @ ${chosen.home}, ${chosen.kits})`);
  await page.evaluate(() => document.querySelector('.m-start').dispatchEvent(new Event('pointerdown')));
  const second = await poll(page, () => {
    const s = document.querySelector('.locker-screen.gear-up');
    if (!s) return null;
    const on = [...s.querySelectorAll('.locker-tab')].find((b) => b.classList.contains('on'));
    return { free: !s.querySelector('.locker-free').classList.contains('hidden'), onTab: on?.childNodes[0]?.textContent?.trim() ?? null };
  }, 10000, 'gear up again');
  ok(!!second, 'START MATCH lands on GEAR UP every game, not just the first');
  ok(second?.free === false, 'the second visit does NOT re-run the callout (gearSeen stuck)');
  ok(second?.onTab === 'KICKS', `a return visit opens on the default KICKS tab (${second?.onTab})`);

  await page.evaluate(() => document.querySelector('.locker-play').dispatchEvent(new Event('pointerdown')));
  ok(!!(await poll(page, () => !document.querySelector('.locker-screen'), 6000, 'locker torn down')),
    'PLAY tears the Locker down before the hand-off (its WebGL context goes with it)');
  // The intro videos are set pieces, not the thing under test — and headless
  // WebKit may not decode the mp4s at all (playVideo resolves on `onerror`).
  // Tap through whatever set piece is on screen until the real scene exists.
  const live = await poll(page, () => {
    document.querySelector('.skip-hint')?.parentElement?.dispatchEvent(new Event('pointerdown'));
    document.querySelector('.intro-fx')?.dispatchEvent(new Event('pointerdown'));
    return window.__skk ? true : null;
  }, 60000, 'match scene after PLAY');
  ok(!!live, 'PLAY runs the real match flow through to a live MatchScene');
  ok(await page.evaluate(() => !document.querySelector('.locker-screen')), 'no Locker survives into the match flow');
}

// ------------------------------------------------------------- 12. LOCKER TABS
// The dev ask this round: "make the changes to the player and be able to see
// them immediately as you click the buttons". The proof is that the SAME
// canvas node survives an equip — a remount would hand back a fresh element
// (and a fresh GL context) and the change would arrive a beat late.
async function lockerTabsScenario(page) {
  console.log('\n--- 12: LOCKER TABS ---');
  await page.goto(`${BASE}/?nosplash&go=menu`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('skk-save-v1', JSON.stringify({
    tutorialPlayed: true, gearSeen: true, 'gear.unlocked': ['kit-blackout', 'cleats-ice', 'cleats-black'],
  })));
  await page.goto(`${BASE}/?nosplash&go=locker&e2e`, { waitUntil: 'domcontentloaded' });
  const tabs = await poll(page, () => {
    const bar = [...document.querySelectorAll('.locker-tab')];
    return bar.length === 4 ? bar.map((b) => b.childNodes[0].textContent.trim()) : null;
  }, 20000, 'locker tabs');
  if (!ok(!!tabs, `the catalog is four tabs (${tabs?.join(' · ') ?? 'never rendered'})`)) return;
  ok(tabs.join(',') === 'KICKS,TAUNTS,CLEATS,KITS', `the tab order is KICKS · TAUNTS · CLEATS · KITS (${tabs.join(',')})`);

  const tapTab = (label) => page.evaluate((l) => {
    const b = [...document.querySelectorAll('.locker-tab')].find((x) => x.childNodes[0].textContent.trim() === l);
    b?.dispatchEvent(new Event('pointerdown'));
    return !!b;
  }, label);
  // pointerDOWN then pointerUP, no movement between them: the row scrolls
  // sideways, so an equip only fires on a pointer that stayed put (<= 10 px).
  const tapChip = (name) => page.evaluate((n) => {
    const c = [...document.querySelectorAll('.locker-chip')].find((x) => x.textContent.trim().startsWith(n));
    c?.dispatchEvent(new Event('pointerdown'));
    c?.dispatchEvent(new Event('pointerup'));
    return !!c;
  }, name);
  const chipState = (name) => page.evaluate((n) => {
    const c = [...document.querySelectorAll('.locker-chip')].find((x) => x.textContent.trim().startsWith(n));
    return c ? { on: c.classList.contains('on'), just: c.classList.contains('just'), dark: c.classList.contains('dark') } : null;
  }, name);

  // stamp the live canvas so a remount is detectable — a replaced node loses it
  await page.evaluate(() => { document.querySelector('canvas.locker-preview').__e2eTag = 'pinned'; });
  ok(await tapTab('KITS'), 'the KITS tab is on the bar');
  ok(await tapChip('BLACKOUT KIT'), 'the unlocked BLACKOUT KIT chip is there and tappable');
  const kitCap = await poll(page, () => {
    const cap = document.querySelector('.locker-stage-cap')?.textContent ?? '';
    return cap.includes('BLACKOUT KIT') ? cap : null;
  }, 6000, 'kit caption');
  ok(!!kitCap, `the caption names the equipped kit (${kitCap ?? 'unchanged'})`);
  ok(await page.evaluate(() => document.querySelector('canvas.locker-preview')?.__e2eTag === 'pinned'),
    'the turntable canvas is the SAME node across an equip — no remount, no context churn');
  const kitChip = await chipState('BLACKOUT KIT');
  ok(kitChip?.on === true, 'the tapped kit reads as equipped');
  ok(kitChip?.just === true, 'the equipped chip pulses so the tap is felt');
  ok(kitChip?.dark === true, 'near-black gear is flagged .dark so its equipped label stays readable');

  const capBefore = await page.evaluate(() => document.querySelector('.locker-stage-cap').textContent);
  ok(await tapTab('TAUNTS'), 'the TAUNTS tab is on the bar');
  ok(await tapChip('THE POINT'), 'THE POINT is owned day one and tappable');
  const tauntChip = await chipState('THE POINT');
  ok(tauntChip?.on === true && tauntChip?.just === true, 'the tapped taunt reads as equipped and pulses');
  const capAfter = await page.evaluate(() => document.querySelector('.locker-stage-cap').textContent);
  ok(capAfter === capBefore, `equipping a taunt leaves the kick/cleats/kit loadout line alone (${capAfter})`);
  ok(await page.evaluate(() => document.querySelector('canvas.locker-preview')?.__e2eTag === 'pinned'),
    'the taunt plays on the SAME turntable too');
  // ?e2e hands the harness the live LockerPreview (window.__lockerPreview), so
  // "the move plays ON the captain" stops being an eyeball-only claim.
  const tauntName = await poll(page, () => {
    const c = [...document.querySelectorAll('.locker-chip')].find((x) => x.textContent.trim().startsWith('THE POINT'));
    if (!c) return null;
    c.dispatchEvent(new Event('pointerdown'));
    c.dispatchEvent(new Event('pointerup'));
    const n = window.__lockerPreview?.char?.animator?.name;
    return typeof n === 'string' && n.startsWith('taunt') ? n : null; // extras pack still streaming otherwise
  }, 30000, 'taunt playing on the turntable');
  ok(!!tauntName, `tapping THE POINT plays the taunt ON the captain (animator ${tauntName ?? 'never left idle'})`);

  // ---- cleats: four alternating equips must not grow the GPU by one byte.
  // Every rebuild clones the material, bakes a NEW 2048x2048 recoloured
  // texture and clones the foot geometry — before the review fix the replaced
  // captain was only unparented, so those stayed resident until the context
  // died (the same starvation that used to kill #game-canvas).
  ok(await tapTab('CLEATS'), 'the CLEATS tab is on the bar');
  const swapCleat = async (name) => {
    await page.evaluate(() => { window.__prevChar = window.__lockerPreview?.char ?? null; });
    if (!(await tapChip(name))) return null;
    const swapped = await poll(page, () => (window.__lockerPreview?.char && window.__lockerPreview.char !== window.__prevChar ? true : null),
      25000, `cleat rebuild (${name})`);
    if (!swapped) return null;
    await page.waitForTimeout(350); // let the new captain UPLOAD and the old one's dispose land
    return page.evaluate(() => {
      const m = window.__lockerPreview.renderer.info.memory;
      return { textures: m.textures, geometries: m.geometries };
    });
  };
  const mem = [];
  for (const name of ['ICE KICKS', 'FIRE REDS', 'ICE KICKS', 'FIRE REDS']) mem.push(await swapCleat(name));
  if (ok(mem.every(Boolean), `four alternating cleat equips all rebuild the captain (${mem.filter(Boolean).length}/4)`)) {
    const flatTex = mem.every((m) => m.textures === mem[0].textures);
    const flatGeo = mem.every((m) => m.geometries === mem[0].geometries);
    ok(flatTex, `the replaced captain's textures are DISPOSED — count flat across four equips (${mem.map((m) => m.textures).join(' -> ')})`);
    ok(flatGeo, `...and so is his cloned foot geometry (${mem.map((m) => m.geometries).join(' -> ')})`);
  }

  // ---- and the cleats actually READ as the gear's colour. The old vertex-colour
  // MULTIPLY could only subtract channels off a warm baked boot, so ICE came out
  // swamp-green; the colorize-by-luminance patch paints it in the real hue.
  const bootBand = () => page.evaluate(() => {
    const c = document.querySelector('canvas.locker-preview');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl || !c.width) return null;
    const h = Math.max(1, Math.floor(c.height * 0.18)); // bottom ~18%: boots + ankles
    const buf = new Uint8Array(4 * c.width * h);
    gl.readPixels(0, 0, c.width, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); // GL origin = bottom-left
    const px = [];
    for (let i = 0; i < buf.length; i += 4) if (buf[i + 3] > 200) px.push([buf[i], buf[i + 1], buf[i + 2]]);
    return px;
  });
  await swapCleat('ICE KICKS');
  const ice = await bootBand();
  if (ok(!!ice && ice.length > 20, `the boot band is on screen with ICE KICKS equipped (${ice?.length ?? 0} opaque px)`)) {
    // the MEDIAN hue of the most saturated slice, not a single pixel: one
    // antialiased edge texel is not evidence that the boot is blue.
    const sat = ([r, g, b]) => (Math.max(r, g, b) === 0 ? 0 : (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b));
    const ranked = [...ice].sort((a, b) => sat(b) - sat(a));
    const slice = ranked.slice(0, Math.max(8, Math.floor(ranked.length * 0.05)));
    const hues = slice.map((p) => hueOf(p[0], p[1], p[2])).sort((a, b) => a - b);
    const hue = hues[Math.floor(hues.length / 2)];
    const gap = hueGap(hue, hueOf(0x7f, 0xe7, 0xff));
    ok(gap < 25, `ICE KICKS render ICY BLUE on the turntable — median hue ${hue.toFixed(1)}deg over the ${slice.length} most saturated boot px vs #7fe7ff 191.5deg, gap ${gap.toFixed(1)}deg (needs < 25); peak px rgb(${ranked[0].join(',')}) at ${hueOf(...ranked[0]).toFixed(1)}deg`);
  }
  await swapCleat('BLACKOUTS');
  const black = await bootBand();
  if (ok(!!black && black.length > 20, `the boot band is on screen with BLACKOUTS equipped (${black?.length ?? 0} opaque px)`)) {
    const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const dark = [...black].sort((a, b) => lum(a) - lum(b)).slice(0, Math.max(4, Math.floor(black.length * 0.05)));
    const spread = Math.max(...dark.map(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b)));
    ok(spread < 24, `BLACKOUTS render NEUTRAL black, not rust — worst channel spread ${spread} across the darkest 5% of the boot band (needs < 24)`);
  }
}

// ------------------------------------------------------------ 13. KICK CONTACT
// "the new kicks must be timed so the kick actually hits the ball". The ball's
// approach glide is the measurable: it must be ~all the way into the foot when
// the launch fires, and the foot it rides must be the one the clip swings.
async function kickContactScenario(page) {
  console.log('\n--- 13: KICK CONTACT ---');
  await boot(page, 'match&nosplash&nointro');
  if (!ok(!!(await poll(page, () => window.__skk.phase === 'PITCH' && !window.__skk.walkup, 30000, 'first pitch')),
    'the first at-bat reaches a live pitch')) return;
  const armed = await page.evaluate(() => {
    const s = window.__skk;
    // ARMADA: a LEFT-footed pack-k kick — the exact case the old hard-coded
    // RightFoot lookup got wrong
    s.power.gear = { id: 'kick-armada', name: 'ARMADA', clip: 'kickArmada', mods: { powerMult: 1.38, curl: 1.3 } };
    s.power.charges = 1; s.power.armed = false; s.refreshHud();
    document.querySelector('.special-btn').dispatchEvent(new Event('pointerdown'));
    window.__lastFrac = null; window.__lastSwing = null; window.__footDist = null;
    // PER-FRAME probe. onKickContact can't be wrapped for this: launchNow()
    // nulls _kickApproach BEFORE calling it. matchScene.update() is frame
    // callback #1 (registered in its constructor), so this runs after it and
    // the LAST sample is the frame before the launch — the fraction the ball
    // had actually travelled into the foot.
    s.engine.onFrame(() => {
      const a = s._kickApproach;
      if (!a || !a.dur) return;
      window.__lastFrac = a.t / a.dur;
      window.__lastSwing = s.kicker.animator.name;
      const foot = s.kickFootPos();
      if (!foot) return;
      let L = null, R = null;
      s.kicker.group.traverse((o) => {
        if (!o.isBone) return;
        if (!L && /LeftFoot/i.test(o.name)) L = o;
        if (!R && /RightFoot/i.test(o.name)) R = o;
      });
      if (L && R) window.__footDist = [foot.distanceTo(L.getWorldPosition(foot.clone())), foot.distanceTo(R.getWorldPosition(foot.clone()))];
    });
    return { armed: s.power.armed, hasClip: !!s.kicker.animator.hasClip('kickArmada') };
  });
  ok(armed.hasClip === true, 'the ARMADA clip is loaded on the kicker (extras pack k)');
  if (!ok(armed.armed === true, 'the crown arms with ARMADA equipped')) return;
  // Release AT the arrival stamp: attemptKick reads errMs = (tapTime -
  // pitchArrival) * 1000, so handing it pitchArrival is a PERFECT release —
  // and lining the kicker up under the ball zeroes the align term. A mistimed
  // probe would whiff, and a whiff never builds an approach to measure.
  const fired = await poll(page, () => {
    const s = window.__skk;
    if (s.phase !== 'PITCH' || s.kicked || !Number.isFinite(s.pitchArrival)) return null;
    if (!(s.ball.pos.z > -3)) return null; // the pitch is close — the flick would be real
    s.kicker.group.position.x = s.ball.pos.x;
    s._kickerPrevX = s.ball.pos.x;
    s.attemptKick({ align: true, flick: { risePx: 120, durMs: 140, driftPx: 0 } }, s.pitchArrival);
    return s.phase;
  }, 25000, 'kick fired');
  ok(fired === 'KICK_ANIM', `the armed swing starts on a well-timed release (phase ${fired})`);
  const away = await poll(page, () => (['LIVE', 'FOUL'].includes(window.__skk.phase)
    ? { frac: window.__lastFrac, swing: window.__lastSwing, dist: window.__footDist, phase: window.__skk.phase }
    : null), 25000, 'ball away');
  ok(!!away, `the ball leaves the foot (phase ${away?.phase ?? 'stuck in KICK_ANIM'})`);
  ok(away?.frac >= 0.95, `the launch fires AT the clip's contact frame — approach ${away?.frac?.toFixed(3) ?? 'never sampled'} (needs ≥ 0.95)`);
  ok(away?.swing === 'kickArmada', `the swing on screen is the equipped move, not the stock kick (${away?.swing})`);
  ok(!!away?.dist && away.dist[0] < away.dist[1],
    `the ball rides ARMADA's LEFT foot (LeftFoot ${away?.dist?.[0]?.toFixed(3) ?? '?'} m vs RightFoot ${away?.dist?.[1]?.toFixed(3) ?? '?'} m)`);
}

// ------------------------------------------------------------ 14. WALK-UP CAM
// Every frame of the walk-up is recorded, then read back — the camera is a
// spring, so a single end-state sample would hide a shot that lagged or never
// cut. The kick / pitch-select marks are exact (0.05 m) because endWalkup CUTS.
async function walkupCamScenario(page) {
  console.log('\n--- 14: WALK-UP CAM ---');
  await boot(page, 'match&nosplash&nointro');
  await page.evaluate(() => {
    const s = window.__skk;
    window.__camLog = [];  // [walk-up phase, shot, cam x, y, z, kicker z, kicker x, elapsed]
    s.engine.onFrame(() => {
      const c = s.engine.camera.position;
      window.__camLog.push([s.walkup?.phase ?? null, s.camDir.shot, c.x, c.y, c.z, s.kicker.group.position.z, s.kicker.group.position.x, s.elapsed]);
    });
  });
  if (!ok(!!(await poll(page, () => ['PITCH', 'PITCH_SELECT'].includes(window.__skk.phase) && !window.__skk.walkup, 30000, 'first pitch')),
    'the first walk-up runs out into the pitch')) return;
  const log = await page.evaluate(() => window.__camLog);
  const walk = log.filter((r) => r[0] === 'walk');
  const taunt = log.filter((r) => r[0] === 'taunt');
  ok(walk.length > 4 && walk.every((r) => r[1] === 'walkupDolly'),
    `the walk owns the walkupDolly shot for all ${walk.length} frames (${[...new Set(walk.map((r) => r[1]))].join(',') || 'none'})`);
  const drift = walk.length ? Math.max(...walk.map((r) => Math.abs(r[4] - (r[5] + 2.8)))) : NaN;
  ok(drift < 0.6, `the dolly rides 2.8 m off the kicker down the whole walk (worst miss ${Number.isFinite(drift) ? drift.toFixed(3) : '?'} m)`);
  // ...and it TRACKS: the kicker crosses ~2.5 m of x on the way in, so a shot
  // that merely sat still would still pass the z-offset check above. The x
  // offset must hold while he travels (samples >= 0.5 s apart, after the cut
  // has settled).
  const t0 = walk.length ? walk[0][7] : 0;
  const settled = walk.filter((r) => r[7] - t0 > 0.35);
  const a0 = settled[0];
  const a1 = a0 ? [...settled].reverse().find((r) => r[7] - a0[7] >= 0.5) : null;
  const dx = a0 && a1 ? Math.abs(a1[6] - a0[6]) : 0;
  const dOff = a0 && a1 ? Math.abs((a1[2] - a1[6]) - (a0[2] - a0[6])) : NaN;
  ok(dx >= 0.7 && dOff < 0.15,
    `the dolly TRACKS the kicker in x — offset moved ${Number.isFinite(dOff) ? dOff.toFixed(3) : '?'} m (needs < 0.15) while he covered ${dx.toFixed(3)} m (needs >= 0.7) over ${a0 && a1 ? (a1[7] - a0[7]).toFixed(2) : '?'} s`);
  ok(taunt.length > 4 && taunt.every((r) => r[1] === 'walkupTaunt'),
    `the taunt owns the walkupTaunt push-in for all ${taunt.length} frames (${[...new Set(taunt.map((r) => r[1]))].join(',') || 'none'})`);
  const kickCam = await page.evaluate(() => {
    const c = window.__skk.engine.camera.position;
    return { x: c.x, y: c.y, z: c.z, shot: window.__skk.camDir.shot };
  });
  ok(kickCam.shot === 'kick', `the walk-up hands the lens straight back to the kick shot (${kickCam.shot})`);
  ok(near(kickCam.x, 0, 0.05) && near(kickCam.y, 3.4, 0.05) && near(kickCam.z, 8, 0.05),
    `the input-critical kick cam is back EXACTLY on its mark (${kickCam.x.toFixed(3)}, ${kickCam.y.toFixed(3)}, ${kickCam.z.toFixed(3)})`);

  // ---- the CPU kicker gets the same package, and lands on the PITCH picker cam
  await page.evaluate(() => {
    const s = window.__skk;
    s.clearTimers();
    s.playerSide = 'home';   // hand the bat to the CPU without playing three outs
    window.__camLog.length = 0;
    s.nextAtBat();
  });
  const reached = await poll(page, () => (window.__skk.phase === 'PITCH_SELECT' && !window.__skk.walkup ? true : null), 30000, 'cpu pitch select');
  ok(!!reached, 'the CPU at-bat walks up and hands you the pitch picker');
  const cpu = await page.evaluate(() => window.__camLog);
  const cWalk = cpu.filter((r) => r[0] === 'walk');
  const cTaunt = cpu.filter((r) => r[0] === 'taunt');
  ok(cWalk.length > 4 && cWalk.every((r) => r[1] === 'walkupDolly'), `the CPU walk gets the dolly too (${cWalk.length} frames)`);
  ok(cTaunt.length > 4 && cTaunt.every((r) => r[1] === 'walkupTaunt'), `the CPU taunt gets the push-in too (${cTaunt.length} frames)`);
  const pitchCam = await page.evaluate(() => {
    const c = window.__skk.engine.camera.position;
    return { x: c.x, y: c.y, z: c.z, shot: window.__skk.camDir.shot };
  });
  ok(pitchCam.shot === 'pitchSelect', `the CPU walk-up cuts to the pitch-select shot (${pitchCam.shot})`);
  ok(near(pitchCam.x, 0, 0.05) && near(pitchCam.y, 5, 0.05) && near(pitchCam.z, -19, 0.05),
    `the pitch-select cam is back EXACTLY on its mark (${pitchCam.x.toFixed(3)}, ${pitchCam.y.toFixed(3)}, ${pitchCam.z.toFixed(3)})`);
  await page.evaluate(() => { window.__skk.playerSide = 'away'; });
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
  // 11-14 each own their page: 11/12 write a save BEFORE the boot that reads
  // it, 13/14 need a match observed from its very first frame.
  ['GEAR UP', gearUpScenario],
  ['LOCKER TABS', lockerTabsScenario],
  ['KICK CONTACT', kickContactScenario],
  ['WALK-UP CAM', walkupCamScenario],
];
// SKK_ONLY="KICK CONTACT,WALK-UP CAM" runs a subset while iterating on one
// scenario (the full pass is ~8 min). CI/verification always runs them all.
const only = (process.env.SKK_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
for (const [name, fn] of scenarios) {
  if (only.length && !only.includes(name)) continue;
  try { await fn(page); }
  catch (e) { console.log(`FAIL  <${name}> threw: ${e.message}`); failures += 1; }
}
await browser.close();
console.log(`\n${failures ? `${failures} FAILURE(S)` : 'ALL PASS'}${skips ? ` (${skips} SKIPPED)` : ''}`);
process.exit(failures ? 1 : 0);

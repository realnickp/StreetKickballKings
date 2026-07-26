// E2E probe for pickle v4 THE DUEL + the runner watchdog (P0 regression).
// Drives the REAL game in Playwright WebKit (the repo's iOS-truthful harness).
// Run: node scripts/pickle-e2e.mjs   (dev server must be up on :5173)
//
// Scenarios:
//  1. OFFENSE duel — staged rundown; assert stage (freeze -> bullet time,
//     letterbox, GO button), GO commit on a live relay, clean resolution.
//  2. DEFENSE duel — staged rundown with player fielding; assert THROW!
//     button relays and a PEG resolves; duel strikes cleanly.
//  3. WATCHDOG — a runner frozen mid-leg during the PITCH phase (the old
//     blind spot) must be force-settled in ~stallS seconds.
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures += 1;
  return cond;
};

async function poll(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await page.evaluate(fn);
    if (v) return v;
    await page.waitForTimeout(60);
  }
  console.log(`TIMEOUT  ${label}`);
  return null;
}

async function bootMatch(page, params) {
  await page.goto(`${BASE}/?${params}`, { waitUntil: 'domcontentloaded' });
  const up = await poll(page, () => !!(window.__skk && window.__skk.phase !== 'IDLE'), 20000, 'scene boot');
  if (!up) throw new Error('scene never booted');
  await page.waitForTimeout(800);
}

/** stage a live rundown on a synthetic mid-leg runner (drill-4's trick) */
async function stageRundown(page, { playerDefense }) {
  return page.evaluate((playerDefense) => {
    const s = window.__skk;
    s.clearTimers();
    s.hud.hideRing?.();
    s.kicked = true; // no stray kick handling
    // a real kick sets pred + fielder roles — stage both so the rundown has
    // a catcher and cover men (startRundown's coverFielderAt reads fielders)
    s.pred = { point: s.basePos(1).clone(), t: 1 };
    s.assignDefense({ playerControlled: playerDefense });
    const off = s.kickingChars();
    const char = off[(s.match.currentKickerIdx() + 5) % off.length];
    char.group.visible = true;
    const r = s.makeRunner(5, char, 0); // 1st -> 2nd, non-forced
    r.forced = false;
    r.sim.progressM = s.tuning.running.basePathM * 0.45;
    s.runners.push(r);
    s.phase = 'LIVE';
    s.liveStart = s.elapsed;
    s.playFinalized = false;
    s.ballControlled = false;
    s.startRundown(r, r.targetBase);
    return !!s.duel;
  }, playerDefense);
}

const state = (page) => page.evaluate(() => {
  const s = window.__skk;
  return {
    duel: !!s.duel,
    mine: s.duel ? s.duel.brain.mine : null,
    committed: s.duel ? s.duel.brain.committed : null,
    throwToEnd: s.duel?.throwInfo ? s.duel.throwInfo.toEnd : null,
    timeScale: s.engine.timeScale,
    letterbox: !!document.querySelector('.letterbox.on'),
    btnShown: !!document.querySelector('.duel-btn.show'),
    btnLit: !!document.querySelector('.duel-btn.lit'),
    btnLabel: document.querySelector('.duel-btn span')?.textContent ?? '',
    runnerStates: s.runners.map((q) => q.state),
    throwing: s.throwing,
    phase: s.phase,
  };
});

async function offenseScenario(page) {
  console.log('\n--- scenario 1: OFFENSE duel ---');
  await bootMatch(page, 'match&nosplash&nointro');
  ok(await stageRundown(page, { playerDefense: false }), 'duel created (offense)');
  let st = await state(page);
  ok(st.btnShown && st.btnLabel === 'GO!', `GO! button up (label "${st.btnLabel}")`);
  ok(st.letterbox, 'letterbox on');
  ok(st.timeScale === 0, 'freeze-frame intro (timeScale 0)');
  await poll(page, () => window.__skk.engine.timeScale > 0, 4000, 'freeze release');
  st = await state(page);
  ok(Math.abs(st.timeScale - 0.6) < 0.01, `bullet time 0.6 (got ${st.timeScale})`);
  // wait for the AI defense to relay -> the GO window
  const win = await poll(page, () => {
    const s = window.__skk;
    return !!(s.duel && s.duel.throwInfo && s.duel.throwInfo.toEnd !== -1 && document.querySelector('.duel-btn.lit'));
  }, 12000, 'GO window (AI relay in flight, button lit)');
  ok(!!win, 'GO window opened');
  if (win) {
    await page.dispatchEvent('.duel-btn', 'pointerdown');
    st = await state(page);
    ok(st.committed === true, 'GO commit registered');
  }
  const done = await poll(page, () => {
    const s = window.__skk;
    return !s.duel && s.runners.every((q) => q.state !== 'running');
  }, 15000, 'duel resolution');
  ok(!!done, 'duel resolved, no runner left running');
  st = await state(page);
  ok(!st.btnShown, 'button struck with the stage');
  ok(!st.letterbox, 'letterbox struck');
  ok(st.timeScale === 1, 'full speed restored');
}

async function defenseScenario(page) {
  console.log('\n--- scenario 2: DEFENSE duel ---');
  await bootMatch(page, 'match=field&nosplash&nointro');
  ok(await stageRundown(page, { playerDefense: true }), 'duel created (defense)');
  let st = await state(page);
  ok(st.btnShown && st.btnLabel === 'THROW!', `THROW! button up (label "${st.btnLabel}")`);
  ok(st.mine === false, 'brain knows the human plays defense');
  await poll(page, () => window.__skk.engine.timeScale > 0, 4000, 'freeze release');
  const lit = await poll(page, () => !!document.querySelector('.duel-btn.lit'), 6000, 'THROW lit (holder has ball)');
  ok(!!lit, 'THROW actionable');
  if (lit) {
    await page.dispatchEvent('.duel-btn', 'pointerdown');
    const threw = await poll(page, () => window.__skk.throwing, 3000, 'relay left the hand');
    ok(!!threw, 'THROW relays');
  }
  // PEG path: wait until a fielder holds the ball again, then peg
  await poll(page, () => {
    const s = window.__skk;
    return s.duel && !s.throwing && s.fieldingChars().some((c) => c.hasBall);
  }, 10000, 'holder re-secured');
  const pegged = await page.evaluate(() => {
    const s = window.__skk;
    if (!s.duel) return 'no-duel';
    s.onDuelPeg();
    return s.duel.brain.pegWindupT > 0 ? 'windup' : 'no-windup';
  });
  ok(pegged === 'windup' || pegged === 'no-duel', `PEG windup telegraphed (${pegged})`);
  const done = await poll(page, () => {
    const s = window.__skk;
    return !s.duel && s.runners.every((q) => q.state !== 'running');
  }, 18000, 'defense duel resolution');
  ok(!!done, 'defense duel resolved');
}

async function watchdogScenario(page) {
  console.log('\n--- scenario 3: WATCHDOG (P0) ---');
  await bootMatch(page, 'match&nosplash&nointro');
  await page.evaluate(() => {
    const s = window.__skk;
    s.clearTimers();
    const off = s.kickingChars();
    const char = off[(s.match.currentKickerIdx() + 6) % off.length];
    char.group.visible = true;
    const r = s.makeRunner(6, char, 0);
    r.sim.progressM = 4;
    r.sim.tick = () => {}; // the glitch: a runner whose sim never advances
    s.runners.push(r);
    s.phase = 'PITCH'; // the OLD watchdog's blind spot — not LIVE
    window.__wdT0 = performance.now();
  });
  const settled = await poll(page, () => {
    const s = window.__skk;
    return s.runners.every((q) => q.state !== 'running') ? (performance.now() - window.__wdT0) / 1000 : null;
  }, 12000, 'watchdog settle');
  ok(!!settled, `stuck PITCH-phase runner force-settled${settled ? ` in ${settled.toFixed(1)}s` : ''}`);
  if (settled) ok(settled < 9, 'settled within the watchdog window (<9s)');
}

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 470, height: 880 } });
page.on('pageerror', (e) => {
  // WebKit sporadically flags localhost asset fetches (GLBs) with access-control
  // noise — real code errors still fail the probe
  const assetNoise = /access control checks|\.glb|\.webp|\.mp3/.test(e.message);
  console.log(assetNoise ? 'PAGEWARN' : 'PAGEERROR', e.message);
  if (!assetNoise) failures += 1;
});
try {
  await offenseScenario(page);
  await defenseScenario(page);
  await watchdogScenario(page);
} catch (e) {
  console.error('PROBE ERROR:', e);
  failures += 1;
} finally {
  await browser.close();
}
console.log(failures === 0 ? '\nALL SCENARIOS PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

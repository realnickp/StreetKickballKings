// E2E for the Phase 0 stability round (2026-09-12): the failure paths a phone
// actually hits. Drives the REAL game in Playwright WebKit (default) or
// Chromium (BROWSER=chromium, the Android stand-in).
// Run: node scripts/phase0-e2e.mjs   (dev server on SKK_URL, default :5173)
//   or: node scripts/with-dev.mjs scripts/phase0-e2e.mjs   (starts its own server)
//
// Scenarios (one boot for 1-4, a second boot for 5):
//   1. THROW GUARD   — a throw that blows up mid-release must not leave
//                      `throwing` stuck true (tags, after-throw and duel
//                      closure all read it for the rest of the play).
//   2. NETS FIRST    — the 14 s dead-ball net closes the play even when the
//                      defense update throws every frame (the nets must sit
//                      ABOVE the code they guard, like the RunnerWatchdog).
//   3. TEARDOWN      — destroy() pauses and unloads both backdrop videos and
//                      drops every bus subscription the scene made.
//   4. CONTEXT LOSS  — losing the main WebGL context pauses the game behind a
//                      visible card; restoring it resumes frames and hides it.
//   5. RETRY CARD    — when every character model fails to load, the real
//                      flow shows a RETRY / MENU card instead of black forever.
import { webkit, chromium, devices } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
const which = process.env.BROWSER ?? 'webkit';
const url = (q) => `${BASE}/?${q}`;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`PASS  ${label}`); } else { fail++; console.log(`FAIL  ${label}`); } return !!cond; };

async function poll(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await page.evaluate(fn);
    if (v) return v;
    await page.waitForTimeout(100);
  }
  console.log(`TIMEOUT  ${label}`);
  return null;
}

async function boot(page, q) {
  await page.goto(url(q), { waitUntil: 'domcontentloaded' });
  if (!(await poll(page, () => !!window.__skk, 150000, 'scene boot'))) throw new Error('scene never booted');
  await page.evaluate(() => { window.__skk.engine.paused = false; });
  await poll(page, () => !window.__skk.walkoutActive && ['SETUP', 'PITCH', 'PITCH_SELECT'].includes(window.__skk.phase), 60000, 'first at-bat');
}

async function throwGuardScenario(page) {
  console.log('\n--- 1. THROW GUARD ---');
  const r = await page.evaluate(async () => {
    const s = window.__skk;
    const f = s.fieldingChars()[0];
    f.hasBall = true;
    const orig = s.releaseThrow;
    s.releaseThrow = () => { throw new Error('e2e: release blew up'); };
    s.throwBall(f, { base: 1 });
    const armed = s.throwing === true;
    await new Promise((res) => setTimeout(res, 1500)); // the 0.5 s safety release fires inside a timer
    const after = s.throwing;
    s.releaseThrow = orig; f.hasBall = false; s.throwing = false;
    return { armed, after };
  });
  ok(r.armed, 'throwBall arms `throwing`');
  ok(r.after === false, `a throwing release leaves \`throwing\` false again (was ${r.after})`);
}

async function netsFirstScenario(page) {
  console.log('\n--- 2. NETS ABOVE THE BLOCKS ---');
  const r = await page.evaluate(async () => {
    const s = window.__skk;
    const origDef = s.updateDefense, origRun = s.updateRunners;
    s.updateDefense = () => { throw new Error('e2e: defense update blew up'); };
    s.updateRunners = () => { throw new Error('e2e: runner update blew up'); };
    const savedPhase = s.phase;
    s.phase = 'LIVE'; s.playFinalized = false; s.liveStart = s.elapsed - 20; s.ballControlled = false;
    await new Promise((res) => setTimeout(res, 1200));
    const closed = s.ballControlled === true;
    s.updateDefense = origDef; s.updateRunners = origRun;
    s.phase = savedPhase; s.playFinalized = true; s.ballControlled = true;
    return { closed };
  });
  ok(r.closed, 'the 14 s net still closes the play while the LIVE blocks throw every frame');
}

async function teardownScenario(page) {
  console.log('\n--- 3. TEARDOWN ---');
  const r = await page.evaluate(() => {
    const s = window.__skk; const bus = window.__bus;
    const vids = [s.field.backdropVideo, s.field.backdropVideoBack].filter(Boolean);
    const count = (ev) => bus.listeners.get(ev)?.size ?? 0;
    const before = { cine: count('cine:start'), roll: count('element:roll'), ret: count('cine:returnThrow') };
    s.destroy();
    const after = { cine: count('cine:start'), roll: count('element:roll'), ret: count('cine:returnThrow') };
    return {
      videos: vids.length, tier: window.__engine.tier.name, hooks: s.field._videoHooks.length, mode: s.field.videoMode,
      paused: vids.every((v) => v.paused),
      unloaded: vids.every((v) => !v.getAttribute('src') && !v.src),
      before, after,
    };
  });
  ok(r.videos === 2, `the field carried two backdrop videos (${r.videos}; tier ${r.tier}, mode ${r.mode}, hooks ${r.hooks})`);
  ok(r.paused, 'destroy() pauses both backdrop videos');
  ok(r.unloaded, 'destroy() unloads both backdrop videos (src cleared)');
  ok(r.after.cine < r.before.cine && r.after.roll < r.before.roll && r.after.ret < r.before.ret,
    `destroy() drops the scene's bus subscriptions (cine:start ${r.before.cine}→${r.after.cine}, element:roll ${r.before.roll}→${r.after.roll}, cine:returnThrow ${r.before.ret}→${r.after.ret})`);
}

async function contextLossScenario(page) {
  console.log('\n--- 4. CONTEXT LOSS ---');
  await boot(page, 'match&mute&nosplash');
  const lost = await page.evaluate(async () => {
    const e = window.__engine;
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return { noExt: true };
    window.__loseExt = ext; // getExtension returns null once the context is gone — keep the handle
    ext.loseContext();
    await new Promise((res) => setTimeout(res, 400));
    return { card: !!document.querySelector('.gl-lost'), paused: e.paused === true };
  });
  if (lost.noExt) { console.log('      WEBGL_lose_context unavailable here — skipped'); return; }
  ok(lost.card, 'losing the WebGL context shows a recovery card');
  ok(lost.paused, 'losing the WebGL context pauses gameplay');
  const restored = await page.evaluate(async () => {
    const e = window.__engine;
    window.__loseExt.restoreContext();
    await new Promise((res) => setTimeout(res, 1500));
    const f0 = e.renderer.info.render.frame;
    await new Promise((res) => setTimeout(res, 800));
    return { card: !!document.querySelector('.gl-lost'), frames: e.renderer.info.render.frame - f0, paused: e.paused };
  });
  ok(!restored.card, 'restoring the context hides the card');
  ok(restored.frames > 0, `frames render again after restore (${restored.frames} in 0.8 s)`);
  ok(restored.paused === false, 'gameplay resumes after restore');
}

async function retryCardScenario(page) {
  console.log('\n--- 5. RETRY CARD (every model fails to load) ---');
  await page.route('**/*.glb', (route) => route.abort());
  await page.goto(url('nosplash&go=menu'), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('skk-save-v1', JSON.stringify({ tutorialPlayed: true, gearSeen: true })));
  await page.goto(url('nosplash&go=teamSelect'), { waitUntil: 'domcontentloaded' });
  if (!ok(!!(await poll(page, () => !!document.querySelector('.matchup-screen .m-start'), 20000, 'team select')), 'team select is up')) return;
  await page.evaluate(() => document.querySelector('.m-start').dispatchEvent(new Event('pointerdown')));
  if (!ok(!!(await poll(page, () => !!document.querySelector('.locker-screen.gear-up .locker-play'), 15000, 'gear up')), 'GEAR UP is up')) return;
  await page.evaluate(() => document.querySelector('.locker-play').dispatchEvent(new Event('pointerdown')));
  const card = await poll(page, () => {
    document.querySelector('.skip-hint')?.parentElement?.dispatchEvent(new Event('pointerdown'));
    document.querySelector('.intro-fx')?.dispatchEvent(new Event('pointerdown'));
    const c = document.querySelector('.flow-error');
    return c ? { retry: !!c.querySelector('[data-act="retry"]'), menu: !!c.querySelector('[data-act="menu"]'), text: c.textContent.trim().slice(0, 80) } : null;
  }, 60000, 'flow error card');
  ok(!!card, 'a failed match build shows a card instead of black forever');
  if (card) ok(card.retry && card.menu, `the card offers RETRY and MENU (${card.text})`);
  if (card) {
    await page.evaluate(() => document.querySelector('.flow-error [data-act="menu"]').dispatchEvent(new Event('pointerdown')));
    ok(!!(await poll(page, () => !!document.querySelector('.menu-screen'), 10000, 'menu after error')), 'MENU from the card lands on the main menu');
  }
  await page.unroute('**/*.glb');
}

const engine = which === 'chromium' ? chromium : webkit;
const launchOpts = which === 'chromium' ? { channel: 'chrome', args: ['--mute-audio'] } : {};
const browser = await engine.launch(launchOpts);
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
// one scenario blowing up must not hide the others' verdicts
const run = async (fn) => { try { await fn(page); } catch (e) { fail++; console.log(`FAIL  harness error in ${fn.name}:`, e?.message ?? e); } };
try {
  // tier=high: the TEARDOWN scenario's contract is that BOTH backdrop loops are
  // paused and unloaded, and since Phase 1 the device tier decides how many a
  // field carries (this iPhone 13 descriptor's iOS 15 UA would land on 'low')
  await boot(page, 'match&mute&nosplash&tier=high');
  await run(throwGuardScenario);
  await run(netsFirstScenario);
  await run(teardownScenario);
} catch (e) {
  fail++; console.log('FAIL  harness error (boot):', e?.message ?? e);
}
await run(contextLossScenario);
await run(retryCardScenario);
if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 6));
console.log(`\n${which}: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

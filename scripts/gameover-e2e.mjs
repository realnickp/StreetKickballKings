// E2E: a game that ends on a play must reach the box score.
// Drives the REAL game (Playwright WebKit by default — the repo's iOS-truthful
// harness — or Chromium with BROWSER=chromium as the Android stand-in).
// Run: node scripts/gameover-e2e.mjs   (dev server on SKK_URL, default :5173)
//   or: node scripts/with-dev.mjs scripts/gameover-e2e.mjs   (starts its own server)
//
// Scenarios:
//   1. FINAL OUT   — top of the last inning, two outs, home ahead: the third
//                    out books GAME_END and `matchOver` fires within seconds.
//                    (2026-08-28 → 09-12 this hung forever: fireMatchOver
//                    polled while phase was RESOLVE, which nothing ever left.)
//   2. WALK-OFF    — bottom of the last, tied, the home crew (AI) kicks: a
//                    go-ahead run ends it on that run; the party still fires.
//   3. NATURAL OUT — no direct finalize call: the player never swipes, three
//                    TOO LATE strikes make the third out the honest way.
import { webkit, chromium, devices } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
const which = process.env.BROWSER ?? 'webkit';
const url = (q) => `${BASE}/?${q}`;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`PASS  ${label}`); } else { fail++; console.log(`FAIL  ${label}`); } };

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
  await page.evaluate(() => {
    window.__over = [];
    window.__bus.on('matchOver', (e) => window.__over.push({ winner: e.winner, score: { ...e.score }, at: performance.now() }));
    window.__skk.engine.paused = false; // release the element-intro hold
  });
  // let the pre-game show run out (or skip it) so the first at-bat is live
  await poll(page, () => !window.__skk.walkoutActive && (window.__skk.phase === 'SETUP' || window.__skk.phase === 'PITCH' || window.__skk.phase === 'PITCH_SELECT'), 60000, 'first at-bat');
  await page.evaluate(() => window.__skk.onTap({ x: 200, y: 500 })); // skip a walk-up if one is up
}

/** Put the engine at the brink and record what the scene looked like when the end was booked. */
async function stage(page, { half, outs, score }) {
  return page.evaluate(({ half, outs, score }) => {
    const s = window.__skk; const st = s.match.state;
    st.inning = s.match.cfg?.innings ?? 5; st.half = half; st.outs = outs; st.score = { ...score };
    st.bases = [null, null, null];
    s.refreshHud?.();
    return { inning: st.inning, half: st.half, outs: st.outs, score: st.score, phase: s.phase };
  }, { half, outs, score });
}

async function finalOutScenario(page) {
  console.log('\n--- 1. FINAL OUT (top of the last, two down, home ahead) ---');
  await boot(page, 'match&mute&nosplash');
  const before = await stage(page, { half: 'top', outs: 2, score: { home: 3, away: 0 } });
  ok(before.outs === 2 && before.half === 'top', `staged: ${JSON.stringify(before)}`);
  await page.evaluate(() => window.__skk.finalizePlay(1, 'strikeout', { restoreRunners: true }));
  const ended = await poll(page, () => window.__skk.match.state.phase === 'GAME_END', 5000, 'GAME_END booked');
  ok(!!ended, 'the third out books GAME_END');
  const over = await poll(page, () => window.__over.length > 0 && window.__over[0], 15000, 'matchOver');
  ok(!!over, 'matchOver fires after the final out (box score reachable)');
  if (over) ok(over.winner === 'home' && over.score.home === 3, `winner/score carried: ${JSON.stringify(over)}`);
  const phase = await page.evaluate(() => window.__skk.phase);
  console.log(`      scene phase at the end: ${phase}`);
}

async function walkOffScenario(page) {
  console.log('\n--- 2. WALK-OFF (bottom of the last, tied, go-ahead run) ---');
  await boot(page, 'match&mute&nosplash');
  // bottom half: the HOME crew kicks. In the harness the player is away, so
  // this is the AI at the plate; we book the run through the same resolver
  // a real kick lands on.
  await stage(page, { half: 'bottom', outs: 1, score: { home: 2, away: 2 } });
  await page.evaluate(() => {
    const s = window.__skk;
    s.match.state.bases = [null, null, 'r']; // a runner on third
    s.finalizePlay(0, 'single'); // finalBases come from s.runners (none) — the run is booked below
  });
  // the resolver above may not score with no live runners; book the walk-off run directly if it did not
  await page.evaluate(() => {
    const s = window.__skk;
    if (s.match.state.phase !== 'GAME_END') s.match.applyBaseEvent?.({ outsAdded: 0, bases: [null, null, null], runs: 1 });
  });
  const ended = await poll(page, () => window.__skk.match.state.phase === 'GAME_END', 5000, 'walk-off GAME_END');
  ok(!!ended, 'the go-ahead run books GAME_END');
  const over = await poll(page, () => window.__over.length > 0 && window.__over[0], 15000, 'walk-off matchOver');
  ok(!!over, 'matchOver fires after a walk-off');
}

async function naturalOutScenario(page) {
  console.log('\n--- 3. NATURAL FINAL OUT (three TOO LATE strikes) ---');
  await boot(page, 'match&mute&nosplash');
  await stage(page, { half: 'top', outs: 2, score: { home: 3, away: 0 } });
  // never swipe: every pitch is a TOO LATE strike; keep skipping walk-ups
  const t0 = Date.now();
  let over = null;
  while (Date.now() - t0 < 150000 && !over) {
    await page.evaluate(() => { const s = window.__skk; if (s.walkup) s.onTap({ x: 200, y: 500 }); });
    over = await page.evaluate(() => window.__over[0] ?? null);
    if (!over) await page.waitForTimeout(500);
  }
  ok(!!over, `matchOver fires after a naturally struck-out third out (${Math.round((Date.now() - t0) / 1000)} s)`);
}

const engine = which === 'chromium' ? chromium : webkit;
const launchOpts = which === 'chromium' ? { channel: 'chrome', args: ['--mute-audio'] } : {};
const browser = await engine.launch(launchOpts);
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
try {
  await finalOutScenario(page);
  await walkOffScenario(page);
  if (process.env.SKIP_NATURAL !== '1') await naturalOutScenario(page);
} catch (e) {
  fail++; console.log('FAIL  harness error:', e?.message ?? e);
}
if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 5));
console.log(`\n${which}: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

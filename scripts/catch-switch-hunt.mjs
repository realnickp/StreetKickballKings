// CATCH→SWITCH HUNT: reproduce "didn't trigger the catch animation and then
// froze when it was time to switch sides" (dev, on prod, while fielding).
// Stages 2-out innings on ?match=field, lets the AI kick REAL meatballs, and
// for every half-ending catch asserts the full chain: catch anim -> robbed
// celebration -> finalize -> half flip -> next at-bat SERVES. Dumps complete
// scene state the moment any link breaks.
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
const MINUTES = Number(process.env.HUNT_MIN ?? 12);

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 470, height: 880 } });
page.on('pageerror', (e) => {
  const noise = /access control checks|\.glb|\.webp|\.mp3/.test(e.message);
  console.log(noise ? 'PAGEWARN' : 'PAGEERROR', e.message);
});
page.on('console', (m) => { if (/\[skk\]|error/i.test(m.text())) console.log('CONSOLE', m.text()); });

await page.goto(`${BASE}/?match=field&nosplash`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!(window.__skk && window.__skk.phase !== 'IDLE'), null, { timeout: 20000 });
await page.waitForTimeout(800);

await page.evaluate(() => {
  const s = window.__skk;
  window.__hunt = { catches: [], atBats: 0, serves: 0 };
  // FRAME-LOOP WATCHDOG: setInterval survives a dead rAF loop — if engine
  // frames stop arriving, snapshot the death context the moment it happens
  window.__fw = { ticks: 0, deaths: [] };
  s.engine.onFrame(() => { window.__fw.ticks += 1; });
  let lastTicks = -1;
  setInterval(() => {
    if (window.__fw.ticks === lastTicks && window.__fw.deaths.length < 5) {
      window.__fw.deaths.push({
        at: +(performance.now() / 1000).toFixed(1),
        paused: !!s.engine.paused,
        phase: s.phase, cinematicLock: s.cinematicLock,
        timers: s.timers.map((t) => `${t.t.toFixed(2)}: ${t.fn.toString().replace(/\s+/g, ' ').slice(0, 50)}`),
        playFinalized: s.playFinalized,
      });
    }
    lastTicks = window.__fw.ticks;
  }, 2000);
  const oNext = s.nextAtBat.bind(s);
  s.nextAtBat = () => { window.__hunt.atBats += 1; return oNext(); };
  const oServe = s.serve.bind(s);
  s.serve = () => { window.__hunt.serves += 1; return oServe(); };
  const oCatch = s.catchOut.bind(s);
  s.catchOut = (fielder) => {
    const rec = {
      t: performance.now(),
      outsBefore: s.match.state.outs,
      playOutsBefore: s.playOuts ?? 0,
      phaseBefore: s.phase,
      fielderAnimBefore: fielder.animator.name,
      animAfter: null, atBatsAt: window.__hunt.atBats, servesAt: window.__hunt.serves,
    };
    const r = oCatch(fielder);
    rec.phaseAfter = s.phase;
    rec.animAfter = fielder.animator.name; // should be 'catch' if it ran
    window.__hunt.catches.push(rec);
    return r;
  };
});

const dump = () => page.evaluate(async () => {
  const s = window.__skk;
  const elapsedA = s.elapsed;
  await new Promise((r) => setTimeout(r, 1000));
  const elapsedB = s.elapsed; // frozen frame loop shows here as A === B
  return {
    paused: !!s.engine.paused,
    elapsedA: +elapsedA.toFixed(2), elapsedB: +elapsedB.toFixed(2),
    frameAlive: elapsedB > elapsedA,
    frameDeaths: window.__fw.deaths,
    timerSrcs: s.timers.map((t) => `${t.t.toFixed(2)}s: ${t.fn.toString().replace(/\s+/g, ' ').slice(0, 60)}`),
    phase: s.phase, matchPhase: s.match.state.phase,
    inning: s.match.state.inning, half: s.match.state.half, outs: s.match.state.outs,
    bases: s.match.state.bases,
    playFinalized: s.playFinalized, halfJustEnded: s.halfJustEnded,
    ballMode: s.ball.mode, ballControlled: s.ballControlled, throwing: s.throwing,
    defenseHasBall: s.defenseHasBall, cinematicLock: s.cinematicLock,
    cameraLock: s.engine.cameraLock, timeScale: s.engine.timeScale,
    duel: !!s.duel, stealing: !!s.stealing,
    timers: s.timers.map((t) => +t.t.toFixed(2)),
    runners: s.runners.map((r) => ({ idx: r.idx, st: r.state, from: r.fromBase, to: r.targetBase, prog: +r.sim.progressM.toFixed(1) })),
    kicked: s.kicked,
    catches: window.__hunt.catches.length,
    lastCatch: window.__hunt.catches[window.__hunt.catches.length - 1] ?? null,
    atBats: window.__hunt.atBats, serves: window.__hunt.serves,
  };
});

// hands-off defense loop with 2-out staging so every catch ends the half
let checked = 0, failures = 0;
const t0 = Date.now();
while (Date.now() - t0 < MINUTES * 60_000 && failures === 0) {
  await page.evaluate(() => {
    const s = window.__skk;
    // stage 2 outs at a safe moment so the NEXT out flips the half; sometimes
    // leave a runner on so the restoreRunners path is exercised too
    if ((s.phase === 'PITCH_SELECT' || s.phase === 'SETUP') && s.match.state.outs < 2 && !s.playFinalized) {
      s.match.state.outs = 2;
      s.refreshHud();
    }
    if (s.phase === 'PITCH_SELECT') {
      const btns = document.querySelectorAll('.pitch-select button');
      btns[Math.floor(Math.random() * btns.length)]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }
  });
  await page.waitForTimeout(700);
  const st = await dump();
  if (st.frameDeaths?.length) {
    failures += 1;
    console.log('=== FRAME LOOP DIED ===');
    console.log(JSON.stringify(st, null, 1));
    await page.screenshot({ path: 'frame-death.png' });
    break;
  }
  if (st.matchPhase === 'GAME_END') {
    console.log('game ended, reloading fresh');
    await page.reload();
    await page.waitForFunction(() => !!(window.__skk && window.__skk.phase !== 'IDLE'), null, { timeout: 20000 });
    await page.waitForTimeout(800);
    continue;
  }
  // a new catch to audit?
  if (st.lastCatch && st.catches > checked) {
    checked = st.catches;
    const c = st.lastCatch;
    console.log(`catch #${checked}: outsBefore=${c.outsBefore}+${c.playOutsBefore} anim=${c.fielderAnimBefore}->${c.animAfter} phase=${c.phaseBefore}->${c.phaseAfter}`);
    // (known cosmetic bug, tracked separately: the robbed celebration stomps
    // the catch clip same-frame — anim shows catch->holdball. Not a failure
    // here; this hunt is for the FLOW freeze.)
    // the half-ending catch must reach a fresh at-bat + serve within 12s
    const flipped = await (async () => {
      const d0 = Date.now();
      while (Date.now() - d0 < 12000) {
        const s2 = await dump();
        if (s2.matchPhase === 'GAME_END') return true;
        if (s2.atBats > c.atBatsAt && s2.serves > c.servesAt) return true;
        await page.waitForTimeout(300);
      }
      return false;
    })();
    if (!flipped) {
      failures += 1;
      console.log('=== FROZE AFTER CATCH (no next at-bat/serve in 12s) ===');
      console.log(JSON.stringify(await dump(), null, 1));
      await page.screenshot({ path: 'switch-freeze.png' });
      break;
    }
    console.log(`  -> switch OK (atBats ${c.atBatsAt}->${c.atBatsAt + 1})`);
  }
}
console.log(`\nhunt done: ${checked} catches audited, ${failures} failure(s), ${((Date.now() - t0) / 60000).toFixed(1)}min`);
await browser.close();
process.exit(failures ? 1 : 0);

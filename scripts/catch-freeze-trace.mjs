// CATCH-FREEZE TRACER: instrument the timer queue + finalize flow, reproduce
// the 3rd-out-catch freeze, and dump WHO killed the finalize timer.
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 470, height: 880 } });
page.on('console', (m) => { if (/\[skk\]|error/i.test(m.text())) console.log('CONSOLE', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

await page.goto(`${BASE}/?match=field&nosplash`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!(window.__skk && window.__skk.phase !== 'IDLE'), null, { timeout: 20000 });
await page.waitForTimeout(800);

await page.evaluate(() => {
  const s = window.__skk;
  const H = window.__hunt = { catches: 0, lastCatchT: 0, atBats: 0, log: [] };
  const now = () => +(performance.now() / 1000).toFixed(2);
  const log = (msg) => { H.log.push(`${now()} ${msg}`); if (H.log.length > 120) H.log.shift(); };

  const oAfter = s.after.bind(s);
  s.after = (sec, fn) => {
    const src = fn.toString().replace(/\s+/g, ' ').slice(0, 70);
    log(`AFTER +${sec}s ${src}`);
    return oAfter(sec, () => { log(`FIRE(${sec}s) ${src}`); fn(); });
  };
  const oClear = s.clearTimers.bind(s);
  s.clearTimers = () => {
    const stack = (new Error().stack || '').split('\n').slice(1, 4).join(' | ').replace(/\s+/g, ' ');
    log(`CLEARTIMERS (${s.timers.length} pending) at ${stack}`);
    return oClear();
  };
  const oFin = s.finalizePlay.bind(s);
  s.finalizePlay = (o, l, opts) => { log(`FINALIZE outs=${o} label=${l} restore=${!!opts?.restoreRunners}`); return oFin(o, l, opts); };
  const oNext = s.nextAtBat.bind(s);
  s.nextAtBat = () => { H.atBats += 1; log('NEXTATBAT'); return oNext(); };
  const oCatch = s.catchOut.bind(s);
  s.catchOut = (f) => { H.catches += 1; H.lastCatchT = performance.now(); log(`CATCHOUT outs=${s.match.state.outs}+${s.playOuts ?? 0} bases=${JSON.stringify(s.match.state.bases)}`); return oCatch(f); };
});

const dump = () => page.evaluate(() => {
  const s = window.__skk;
  return {
    phase: s.phase, outs: s.match.state.outs, playFinalized: s.playFinalized,
    cinematicLock: s.cinematicLock, paused: !!s.engine.paused, timeScale: s.engine.timeScale,
    timers: s.timers.map((t) => ({ t: +t.t.toFixed(2), src: t.fn.toString().replace(/\s+/g, ' ').slice(0, 70) })),
    directorScript: !!window.__skk.engine.__dirScript,
    catches: window.__hunt.catches, lastCatchT: window.__hunt.lastCatchT,
    atBats: window.__hunt.atBats,
    log: window.__hunt.log,
  };
});

// hands-off: stage 2 outs + a runner so every catch is a half-ending catch
// with runners on (the dev's exact crash context)
const t0 = Date.now();
let lastAudit = 0;
while (Date.now() - t0 < 12 * 60_000) {
  await page.evaluate(() => {
    const s = window.__skk;
    if ((s.phase === 'PITCH_SELECT' || s.phase === 'SETUP') && !s.playFinalized) {
      if (s.match.state.outs < 2) { s.match.state.outs = 2; s.refreshHud(); }
      if (s.match.state.bases.every((b) => b === null) && (s.phase === 'PITCH_SELECT')) {
        // put a live runner on 1st the honest way: engine bases + restage
        const idx = (s.match.currentKickerIdx() + 3) % 8;
        s.match.state.bases = [idx, null, null];
        s.nextAtBat();
      }
    }
    if (s.phase === 'PITCH_SELECT') {
      const btns = document.querySelectorAll('.pitch-select button');
      btns[Math.floor(Math.random() * btns.length)]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }
  });
  await page.waitForTimeout(600);
  const st = await dump();
  if (st.catches > lastAudit) {
    lastAudit = st.catches;
    // give the chain 12s to reach the next at-bat
    const ok = await (async () => {
      const d0 = Date.now();
      while (Date.now() - d0 < 12000) {
        const s2 = await dump();
        if (s2.playFinalized || s2.atBats > st.atBats) return true;
        await page.waitForTimeout(300);
      }
      return false;
    })();
    const fin = await dump();
    if (!ok && !fin.playFinalized) {
      console.log('=== FREEZE REPRODUCED — timeline ===');
      console.log(fin.log.join('\n'));
      console.log('--- state ---');
      console.log(JSON.stringify({ ...fin, log: undefined }, null, 1));
      await page.screenshot({ path: 'freeze-trace.png' });
      process.exitCode = 1;
      break;
    }
    console.log(`catch #${st.catches}: chain OK`);
  }
}
await browser.close();

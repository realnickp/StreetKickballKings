// PERFECT-KICK IMPACT CAM E2E: drive a REAL perfect kick (genuine
// attemptKick path, zero timing error, kicker aligned under the ball) and
// assert the impact-cam beat: cut + slow-mo engage, hold, then clean release
// back to live play. Screenshots the cut for framing review.
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures += 1;
  return cond;
};

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 470, height: 880 } });
page.on('console', (m) => { if (/\[skk\]/i.test(m.text())) console.log('CONSOLE', m.text()); });

// SILENT RUN (2026-08-28): this probe drives the REAL game with real music, the
// booth and the crowd, and the dev sits at the machine it runs on. `?mute` pins
// the master gain at 0 for the whole session (audio.js), and the net below
// mutes every media element the page ever plays — including a <video> that is
// never attached to the document, which querySelectorAll would never see.
await page.addInitScript(() => {
  const m = HTMLMediaElement.prototype;
  const play = m.play;
  m.play = function mutedPlay() { this.muted = true; return play.call(this); };
});

await page.goto(`${BASE}/?match&nosplash&nointro&mute`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!(window.__skk && window.__skk.phase !== 'IDLE'), null, { timeout: 20000 });
await page.waitForTimeout(800);

// wait for a live pitch, let it get near the plate, then kick it PERFECT
// through the real path (tapTime === pitchArrival -> errMs 0; aligned -> 0m)
const kicked = await (async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const did = await page.evaluate(() => {
      const s = window.__skk;
      if (s.phase !== 'PITCH' || s.kicked || !isFinite(s.pitchArrival)) return false;
      if (s.pitchArrival - s.elapsed > 0.06) return false; // ball basically at the plate
      s.kicker.group.position.x = s.ball.pos.x; // lined up under it
      s.attemptKick({ align: true }, s.pitchArrival); // zero-error release
      return { quality: s.judged?.quality };
    });
    if (did) return did;
    await page.waitForTimeout(16);
  }
  return null;
})();
ok(kicked?.quality === 'PERFECT', `real kick judged PERFECT (got ${kicked?.quality})`);

// the impact cam must ENGAGE: camera locked + hard slow-mo
const engaged = await (async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) {
    const st = await page.evaluate(() => ({
      lock: window.__skk.engine.cameraLock,
      ts: window.__skk.engine.timeScale,
    }));
    if (st.lock && st.ts < 0.3) return st;
    await new Promise((r) => setTimeout(r, 40));
  }
  return null;
})();
ok(!!engaged, `impact cam engaged (cameraLock + timeScale ${engaged?.ts})`);
await page.waitForTimeout(350); // mid-beat — the money frame
await page.screenshot({ path: 'perfect-cam.png' });
console.log('  screenshot: perfect-cam.png (mid slow-mo)');

// ...and RELEASE cleanly: full speed, camera free, play still LIVE and healthy
const released = await (async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    const st = await page.evaluate(() => ({
      lock: window.__skk.engine.cameraLock,
      ts: window.__skk.engine.timeScale,
      cin: window.__skk.cinematicLock,
      phase: window.__skk.phase,
    }));
    // an HR super-kick may roll straight into the crowned replay — that
    // counts as a healthy handoff, not a stuck impact cam
    if ((!st.lock && st.ts === 1 && !st.cin) || st.phase === 'RESOLVE') return st;
    await new Promise((r) => setTimeout(r, 60));
  }
  return null;
})();
ok(!!released, `impact cam released cleanly (phase=${released?.phase}, timeScale=${released?.ts})`);

// the play must still finish (no cinematic may strand it)
const closed = await (async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const st = await page.evaluate(() => ({
      phase: window.__skk.phase, cin: window.__skk.cinematicLock,
    }));
    if ((st.phase === 'PITCH' || st.phase === 'SETUP' || st.phase === 'PITCH_SELECT') && !st.cin) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
})();
ok(closed, 'play resolved and the next at-bat arrived');

// --- scenario 2: the EARNED bomb gets the cam, on a second at-bat ---
// RE-TIMED 2026-08-28. This used to stage an "HR-eligible but NOT PERFECT"
// kick -- sharp timing, 0.35 m off-line -- and assert the cam fired on it. The
// earned-homers round made that case impossible BY CONSTRUCTION: `isHrEligible`
// now requires the judge's own PERFECT stamp, so `quality !== 'PERFECT'` and
// `kickHrEligible` can never both hold, and the scenario asserted a
// contradiction. What is still worth proving is that the impact beat RE-ARMS:
// a second perfect, lined-up kick an at-bat later gets the same cut and
// slow-mo as the first. HR eligibility itself is only LOGGED, never asserted --
// the gap-shot roll clears a quarter of earned bombs by design, and
// tests/homers.test.js owns that gate.
console.log('\n--- scenario 2: a second EARNED kick re-arms the cam ---');
const hrKick = await (async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const did = await page.evaluate(() => {
      const s = window.__skk;
      if (s.phase !== 'PITCH' || s.kicked || !isFinite(s.pitchArrival)) return false;
      if (s.pitchArrival - s.elapsed > 0.06) return false;
      s.kicker.group.position.x = s.ball.pos.x;      // lined up under it
      s.attemptKick({ align: true }, s.pitchArrival); // zero-error release
      return { quality: s.judged?.quality, hr: s.kickHrEligible };
    });
    if (did) return did;
    await page.waitForTimeout(16);
  }
  return null;
})();
ok(hrKick?.quality === 'PERFECT',
  `second real kick judged PERFECT (got ${hrKick?.quality}; hrEligible=${hrKick?.hr} -- the gap-shot roll may clear it)`);
const hrEngaged = await (async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) {
    const st = await page.evaluate(() => ({
      lock: window.__skk.engine.cameraLock, ts: window.__skk.engine.timeScale,
    }));
    if (st.lock && st.ts < 0.3) return st;
    await new Promise((r) => setTimeout(r, 40));
  }
  return null;
})();
ok(!!hrEngaged, `impact cam re-armed on the second earned kick (timeScale ${hrEngaged?.ts})`);

await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);

// TAG-UP RACE E2E: reproduce "fielder caught the ball, my runner tagged up
// back to first, made it, then it froze" (dev, twice, on prod).
// The OFFENSE-side race: player kicked, AI fields. catchOut flips phase to
// RESOLVE for the race, but aiThrowDecision/afterThrow/aiContinue all bail
// on RESOLVE — the AI never throws, never releases ball control, and the
// play-end condition (ballControlled && nobody advancing) can never fire.
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

await page.goto(`${BASE}/?match&nosplash&nointro`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!(window.__skk && window.__skk.phase !== 'IDLE'), null, { timeout: 20000 });
await page.waitForTimeout(800);

// stage: player kicking, runner on 1st, fly ball CAUGHT mid-run (outs 0 —
// the tag-up race branch, not the 3rd-out celebration)
const staged = await page.evaluate(() => {
  const s = window.__skk;
  s.clearTimers();
  const off = s.kickingChars();
  const runnerIdx = (s.match.currentKickerIdx() + 4) % off.length;
  s.match.state.outs = 0;
  s.match.state.bases = [runnerIdx, null, null];
  s.nextAtBat();
  s.clearTimers(); // keep the staged play sterile (no auto-serve)
  s.kicked = true;
  s.pred = { point: s.basePos(1).clone().multiplyScalar(2.2), t: 1.4, apex: 6 };
  s.isFly = true;
  s.assignDefense({ playerControlled: false }); // AI fields — the dev's case
  s.phase = 'LIVE';
  s.liveStart = s.elapsed;
  s.playFinalized = false;
  s.ballControlled = false;
  s.launchRunners();
  const r = s.runners.find((q) => q.fromBase === 0);
  if (!r) return { staged: false };
  r.sim.progressM = 6; // runner halfway to 2nd when the ball is snagged
  const fielder = s.chaser ?? s.fielders[0].char;
  s.ball.place(fielder.group.position.clone().setY(1.2));
  s.catchOut(fielder);
  window.__t0 = { atBats: 0, finalized: false }; // sticky — nextAtBat resets s.playFinalized
  const oNext = s.nextAtBat.bind(s);
  s.nextAtBat = () => { window.__t0.atBats += 1; return oNext(); };
  const oFin = s.finalizePlay.bind(s);
  s.finalizePlay = (o, l, opts) => { window.__t0.finalized = true; return oFin(o, l, opts); };
  return {
    staged: true,
    phase: s.phase,
    racing: s.runners.filter((q) => q.state === 'running' && q.tagUp).length,
  };
});
ok(staged.staged, 'staged offense-side catch with a runner to double off');
ok(staged.phase === 'RESOLVE' && staged.racing >= 1, `tag-up race started (racing=${staged.racing})`);

// the race must RESOLVE: the AI defense acts, the play finalizes, and the
// next at-bat arrives — within a generous 15s
const outcome = await (async () => {
  const t0 = Date.now();
  let sawThrow = false;
  while (Date.now() - t0 < 15000) {
    const st = await page.evaluate(() => ({
      throwing: window.__skk.throwing,
      finalized: window.__t0.finalized,
      ballControlled: window.__skk.ballControlled,
      atBats: window.__t0.atBats,
      runnerStates: window.__skk.runners.map((r) => `${r.state}${r.tagUp ? '+tagUp' : ''}`),
    }));
    sawThrow = sawThrow || st.throwing;
    if (st.finalized && st.atBats > 0) return { ...st, sawThrow, resolved: true };
    await new Promise((r) => setTimeout(r, 250));
  }
  const fin = await page.evaluate(() => ({
    phase: window.__skk.phase,
    playFinalized: window.__skk.playFinalized,
    ballControlled: window.__skk.ballControlled,
    throwing: window.__skk.throwing,
    timers: window.__skk.timers.length,
    runners: window.__skk.runners.map((r) => ({ st: r.state, tagUp: !!r.tagUp, heldAt: r.heldAt })),
  }));
  console.log('  frozen state:', JSON.stringify(fin));
  return { resolved: false, sawThrow };
})();
ok(outcome.resolved, 'tag-up race resolved: play finalized + next at-bat arrived');
ok(outcome.sawThrow, `AI defense actually threw during the race (sawThrow=${outcome.sawThrow})`);

await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);

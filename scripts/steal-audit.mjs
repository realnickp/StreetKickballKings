// STEAL/RUNNER STATE AUDIT: reproduce the "stealing is glitchy" reports.
// Drives the REAL game in Playwright WebKit (the repo's iOS-truthful harness).
// Run: node scripts/steal-audit.mjs   (dev server must be up, SKK_URL to point elsewhere)
//
// Scenarios:
//  1. STALE originalBases — an AI kicker reaches base NATURALLY (hands-off
//     meatball pitches), then the next kicker strikes out. A strikeout must
//     NOT move base runners — today finalizePlay(restoreRunners) stamps
//     this.originalBases (captured at the LAST KICK, possibly at-bats ago)
//     over the live engine bases: runners vanish / resurrect / steals undo.
//  2. MERGED STEALER NOT FORCED — a runner mid-steal from 1st when the kick
//     lands merges into the live play (launchRunners) without re-computing
//     the force chain: with the kicker forced behind him he MUST be forced,
//     but stays forced=false → no force out possible at 2nd, and a beaten
//     throw traps him in a rundown that retreats INTO the kicker's bag.
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
    await page.waitForTimeout(80);
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

/** hands-off defense: pick a pitch whenever asked; the trace expires into a
 *  meatball and the AI kicks — same loop stall-hunt uses. */
const feedPitches = (page) => page.evaluate(() => {
  if (window.__skk.phase === 'PITCH_SELECT') {
    const btns = document.querySelectorAll('.pitch-select button');
    btns[Math.floor(Math.random() * btns.length)]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }
});

async function staleOriginalBasesScenario(page) {
  console.log('\n--- scenario 1: strikeout must not move base runners ---');
  await bootMatch(page, 'match=field&nosplash');

  // play hands-off until the AI puts a man on base (a real kick = originalBases
  // captured for THAT play; once he's aboard, originalBases is history)
  const onBase = await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      await feedPitches(page);
      const st = await page.evaluate(() => ({
        bases: window.__skk.match.state.bases,
        phase: window.__skk.phase,
        matchPhase: window.__skk.match.state.phase,
        outs: window.__skk.match.state.outs,
      }));
      if (st.matchPhase === 'GAME_END') return null;
      // want: runner(s) on, between plays (fresh at-bat staging)
      if (st.bases.some((b) => b !== null) && (st.phase === 'PITCH_SELECT' || st.phase === 'SETUP')) return st;
      await page.waitForTimeout(400);
    }
    return null;
  })();
  if (!ok(!!onBase, `AI runner reached base naturally (bases=${JSON.stringify(onBase?.bases)})`)) return;

  // snapshot, then whiff the new kicker three times through the REAL strike()
  // path (same code an AI whiff / TOO LATE fires), spaced so each resume lands
  const before = await page.evaluate(() => ({
    bases: [...window.__skk.match.state.bases],
    outs: window.__skk.match.state.outs,
    originalBases: window.__skk.originalBases ? [...window.__skk.originalBases] : null,
  }));
  console.log(`  before: bases=${JSON.stringify(before.bases)} outs=${before.outs} originalBases(stale)=${JSON.stringify(before.originalBases)}`);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { window.__skk.strike('AUDIT WHIFF'); });
    await page.waitForTimeout(1300);
  }
  const settled = await poll(page, () => window.__skk.playFinalized || window.__skk.phase === 'SETUP' || window.__skk.phase === 'PITCH_SELECT', 8000, 'strikeout resolved');
  ok(!!settled, 'strikeout play resolved');
  const after = await page.evaluate(() => ({
    bases: [...window.__skk.match.state.bases],
    outs: window.__skk.match.state.outs,
  }));
  console.log(`  after:  bases=${JSON.stringify(after.bases)} outs=${after.outs}`);
  const halfEnded = after.outs === 0 && after.bases.every((b) => b === null) && before.outs === 2;
  ok(after.outs === before.outs + 1 || halfEnded, `strikeout added exactly one out (${before.outs} -> ${after.outs})`);
  if (!halfEnded) {
    ok(JSON.stringify(after.bases) === JSON.stringify(before.bases),
      `base runners UNCHANGED by the strikeout (${JSON.stringify(before.bases)} -> ${JSON.stringify(after.bases)})`);
  } else {
    console.log('  (3rd out ended the half — corruption masked this run, rerun for a mid-half sample)');
  }
}

async function mergedStealerScenario(page) {
  console.log('\n--- scenario 2: mid-steal runner merged into a kick must be FORCED ---');
  await bootMatch(page, 'match=field&nosplash');
  // stage: AI runner on 1st, mid-steal, then the kick lands (launchRunners is
  // the unit under test — drive it exactly the way onKickContact does)
  const res = await page.evaluate(() => {
    const s = window.__skk;
    s.clearTimers();
    const off = s.kickingChars();
    const runnerIdx = (s.match.currentKickerIdx() + 4) % off.length;
    s.match.state.bases = [runnerIdx, null, null];
    s.nextAtBat();
    s.clearTimers(); // nextAtBat schedules a serve — keep the stage sterile
    s.startSteal(0); // the real AI-steal entry (maybeAiSteal calls this)
    if (!s.stealing) return { staged: false };
    s.stealing.sim.progressM = s.tuning.running.basePathM * 0.4; // mid-flight
    // the kick lands: LIVE + launchRunners, as onKickContact does
    s.pred = { point: s.basePos(1).clone().multiplyScalar(1.6), t: 1.2, apex: 1.0 };
    s.phase = 'LIVE';
    s.liveStart = s.elapsed;
    s.launchRunners();
    const stealer = s.runners.find((r) => r.stealing);
    const kicker = s.runners.find((r) => r.fromBase === -1);
    return {
      staged: true,
      stealerFound: !!stealer,
      stealerForced: stealer?.forced ?? null,
      stealerFrom: stealer?.fromBase,
      kickerForced: kicker?.forced ?? null,
      recommended: s.recommendedThrowBase(),
    };
  });
  if (!ok(res.staged && res.stealerFound, 'staged a live kick with a mid-steal runner from 1st')) return;
  ok(res.kickerForced === true, 'kicker is forced to 1st');
  ok(res.stealerForced === true,
    `mid-steal runner from 1st is FORCED to 2nd (kicker behind him) — got forced=${res.stealerForced}`);
  ok(res.recommended === 1,
    `AI force-throw logic sees 2nd as the force bag — got ${JSON.stringify(res.recommended)}`);
}

async function timerClearLeakScenario(page) {
  console.log('\n--- scenario 3: same-frame clearTimers must not eat fresh timers ---');
  // the side-switch freeze: nextAtBat (fired FROM a timer) clears the queue and
  // schedules the new serve — a SECOND stale timer due the same frame then (a)
  // fired anyway and (b) spliced by indexOf(-1), deleting the fresh serve timer
  // → the game sat in SETUP forever ("froze when it was time to switch sides")
  await bootMatch(page, 'match&nosplash');
  const r = await page.evaluate(async () => {
    const s = window.__skk;
    // park the live match flow so ITS legitimate clearTimers (nextAtBat /
    // strike-resume) can't touch the staged queue during the window
    s.clearTimers();
    s.phase = 'SETUP';
    s.kicked = true;
    s.playFinalized = true;
    const leak = { staleFired: 0, freshFired: 0 };
    s.after(0.001, () => { s.clearTimers(); s.after(0.5, () => { leak.freshFired++; }); });
    s.after(0.001, () => { leak.staleFired++; });
    await new Promise((res) => setTimeout(res, 1500));
    return { ...leak, timersLeft: s.timers.length };
  });
  ok(r.staleFired === 0, `cleared stale timer did not fire (fired ${r.staleFired}x)`);
  ok(r.freshFired === 1, `freshly scheduled timer survived the clear and fired (fired ${r.freshFired}x)`);
}

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 470, height: 880 } });
page.on('pageerror', (e) => {
  const assetNoise = /access control checks|\.glb|\.webp|\.mp3/.test(e.message);
  console.log(assetNoise ? 'PAGEWARN' : 'PAGEERROR', e.message);
  if (!assetNoise) failures += 1;
});
try {
  await staleOriginalBasesScenario(page);
  await mergedStealerScenario(page);
  await timerClearLeakScenario(page);
} catch (e) {
  console.error('PROBE ERROR:', e);
  failures += 1;
} finally {
  await browser.close();
}
console.log(failures === 0 ? '\nALL SCENARIOS PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

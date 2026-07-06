// STALL HUNTER: reproduce the "players running in place, game stuck" report.
// Plays hands-off innings on ?match=field (player defense, zero input — the
// auto-chase + safeties are supposed to close every play) and flags:
//  - FLOW STALL: no at-bat/phase progress for > 20s
//  - RUN-IN-PLACE: any char looping the 'run' clip with a frozen position > 3s
// Dumps full scene state on detection.
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5184';
const MINUTES = Number(process.env.HUNT_MIN ?? 6);

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 470, height: 880 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => {
  const t = m.text();
  if (/watchdog|error|recovered/i.test(t)) console.log('CONSOLE', t);
});

await page.goto(`${BASE}/?match=field&nosplash`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!(window.__skk && window.__skk.phase !== 'IDLE'), null, { timeout: 20000 });

// instrument: track at-bat starts + per-char run-in-place time + anim history
await page.evaluate(() => {
  const s = window.__skk;
  window.__probe = { atBats: 0, lastProgress: performance.now(), rip: new Map() };
  const orig = s.nextAtBat.bind(s);
  s.nextAtBat = () => { window.__probe.atBats += 1; window.__probe.lastProgress = performance.now(); return orig(); };
  // tap every animator so we can see WHO last changed a stuck char's clip
  const all = [...s.chars.home, ...s.chars.away];
  all.forEach((c, i) => {
    c.__id = (i < s.chars.home.length ? 'H' : 'A') + (i % s.chars.home.length);
    c.__animLog = [];
    const op = c.animator.play.bind(c.animator);
    c.animator.play = (name, opts) => {
      c.__animLog.push(`${(performance.now() / 1000).toFixed(1)}:${name}`);
      if (c.__animLog.length > 8) c.__animLog.shift();
      return op(name, opts);
    };
  });
  let lastPhase = s.phase;
  setInterval(() => {
    if (s.phase !== lastPhase) { lastPhase = s.phase; window.__probe.lastProgress = performance.now(); }
    // run-in-place: 'run'-family anim + position frozen (only while VISIBLE —
    // delete records of hidden chars so ages never span a hide/show)
    for (const c of all) {
      const key = c.group.uuid;
      if (!c.group.visible) { window.__probe.rip.delete(key); continue; }
      const p = c.group.position;
      const rec = window.__probe.rip.get(key) ?? { x: p.x, z: p.z, t: performance.now(), anim: '' };
      const moved = Math.hypot(p.x - rec.x, p.z - rec.z) > 0.25;
      const running = /run|strafe/.test(c.animator.name ?? '');
      if (moved || !running || !window.__probe.rip.has(key)) {
        window.__probe.rip.set(key, { x: p.x, z: p.z, t: performance.now(), anim: c.animator.name, c });
      } else { rec.c = c; }
    }
  }, 250);
});

const dump = () => page.evaluate(() => {
  const s = window.__skk;
  const now = performance.now();
  return {
    phase: s.phase,
    matchPhase: s.match.state.phase,
    inning: s.match.state.inning, half: s.match.state.half, outs: s.match.state.outs,
    playFinalized: s.playFinalized,
    ballMode: s.ball.mode, ballControlled: s.ballControlled, throwing: s.throwing,
    defenseHasBall: s.defenseHasBall,
    cinematicLock: s.cinematicLock,
    timeScale: s.engine.timeScale,
    duel: !!s.duel, stealing: !!s.stealing, stealResolving: s.stealResolving,
    timers: s.timers.length,
    runners: s.runners.map((r) => ({ idx: r.idx, st: r.state, from: r.fromBase, to: r.targetBase, prog: +r.sim.progressM.toFixed(1), tagUp: !!r.tagUp, forced: !!r.forced })),
    ripChars: [...window.__probe.rip.entries()]
      .filter(([, v]) => now - v.t > 3000 && /run|strafe/.test(v.anim ?? ''))
      .map(([, v]) => ({
        who: v.c?.__id,
        anim: v.anim,
        at: `(${v.x.toFixed(1)},${v.z.toFixed(1)})`,
        ageS: (now - v.t) / 1000 | 0,
        hasBall: !!v.c?.hasBall,
        isKicker: v.c === s.kicker,
        inFielders: !!s.fielders?.some((f) => f.char === v.c),
        isBaseChar: s.baseChars?.includes(v.c) ?? false,
        isRunner: s.runners.some((r) => r.char === v.c),
        animLog: v.c?.__animLog?.slice(-5),
      })),
    atBats: window.__probe.atBats,
    sinceProgressS: +((now - window.__probe.lastProgress) / 1000).toFixed(1),
  };
});

const t0 = Date.now();
let stalls = 0;
while (Date.now() - t0 < MINUTES * 60_000) {
  await page.waitForTimeout(2000);
  // play minimal defense: pick a pitch when asked (the trace window then
  // auto-expires into a meatball) — everything else is hands-off
  await page.evaluate(() => {
    if (window.__skk.phase === 'PITCH_SELECT') {
      window.__probe.lastProgress = performance.now();
      const btns = document.querySelectorAll('.pitch-select button');
      btns[Math.floor(Math.random() * btns.length)]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }
  });
  const st = await dump();
  const ripStall = st.ripChars.length > 0;
  const flowStall = st.sinceProgressS > 20 && st.matchPhase !== 'GAME_END';
  if (ripStall || flowStall) {
    stalls += 1;
    console.log(`\n=== STALL #${stalls} (${flowStall ? 'FLOW' : ''}${ripStall ? ' RUN-IN-PLACE' : ''}) at +${((Date.now() - t0) / 1000) | 0}s ===`);
    console.log(JSON.stringify(st, null, 1));
    await page.screenshot({ path: `stall-${stalls}.png` });
    if (stalls >= 3) break;
    // give it a chance to self-recover and keep hunting
    await page.waitForTimeout(8000);
  }
  if (st.matchPhase === 'GAME_END') { console.log('game ended cleanly, reloading'); await page.reload(); await page.waitForFunction(() => !!(window.__skk && window.__skk.phase !== 'IDLE'), null, { timeout: 20000 }); await page.evaluate(() => window.location.search); break; }
}
console.log(`\nhunt done: ${stalls} stall(s) in ${((Date.now() - t0) / 60000).toFixed(1)}min, at-bats seen: ${(await dump()).atBats}`);
await browser.close();
process.exit(stalls > 0 ? 1 : 0);

// E2E probe for the booth/sound/contact round (2026-08-05 punch list).
// Drives the REAL game in Playwright WebKit (the repo's iOS-truthful harness).
// Run: node scripts/booth-sound-e2e.mjs   (dev server must be up on :5173)
//
// Scenarios:
//  1. BREAK — skip the walkout: GAME TIME stamp, music stop -> 'beat' restart,
//     game reaches a live pitch.
//  2. PRONOUNS — vo({event,gender}) never picks a cross-gender line; bare
//     events stay neutral-only.
//  3. VO QUEUE — a second call HOLDS while a line is live (flavor drops),
//     and plays when the line ends. Never two lines at once.
//  4. WHIFF SWING — a hopeless tap still swings the leg (no frozen kicker).
//  5. CONTACT — a clean tap: swing sfx at clip start, kick thump at the
//     contact frame, the kicker step-in is armed, ball goes LIVE.
//  6. SPECIAL SWING — an armed MEIA LUA opens on 'bigwhoosh', drops 'swing'
//     mid-wind-up, and still thumps 'strike' when the crown kick connects.
//  7. PEG PAD — no force + live runner = gold PEG; no runner = dim PEG.
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
// SILENT RUNS: every page this harness opens carries ?mute (audio.js pins the
// master gain at 0 and every set-piece <video> comes up muted). The dev can
// HEAR this machine — a harness that plays the soundtrack is not runnable.
const url = (q) => `${BASE}/?${q}&mute`;
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

async function breakScenario(page) {
  console.log('\n--- scenario 1: the dance -> game BREAK ---');
  await page.goto(url('match&nosplash'), { waitUntil: 'domcontentloaded' });
  const booted = await poll(page, () => !!window.__skk, 20000, 'scene boot');
  if (!booted) throw new Error('scene never booted');
  // prove the silence before a single frame of the show runs
  const silent = await page.evaluate(() => ({
    muted: window.__audio.muted,
    master: window.__audio.userVol.master,
    gain: window.__audio.master ? window.__audio.master.gain.value : null,
    loud: [...document.querySelectorAll('video,audio')].filter((m) => !m.muted).length,
    made: window.__mediaEls.length,
    loudMade: window.__mediaEls.filter((m) => !m.muted).map((m) => (m.currentSrc || m.src || '?').split('/').pop()),
    loudPlays: window.__loudPlays.slice(),
  }));
  ok(silent.muted === true && silent.master === 0 && (silent.gain === null || silent.gain === 0),
    `?mute runs the whole harness SILENT (muted ${silent.muted}, userVol.master ${silent.master}, master gain ${silent.gain ?? 'no AudioContext in WebKit'})`);
  // the CENSUS, not the DOM: the field's backdrop <video> is never appended, so
  // querySelectorAll on its own would call an unmuted one silent.
  ok(silent.made > 0, `the media census is live — the boot made ${silent.made} media element(s) to check`);
  ok(silent.loudMade.length === 0 && silent.loudPlays.length === 0 && silent.loud === 0,
    `every media element the page made is muted BY THE APP (${silent.made} made, ${silent.loud} unmuted in the DOM${silent.loudMade.length ? `, LOUD: ${silent.loudMade.join(',')}` : ''}${silent.loudPlays.length ? `, played loud: ${silent.loudPlays.join(',')}` : ''})`);
  await page.evaluate(() => {
    window.__musicLog = [];
    window.__sfxLog = [];
    window.__bus.on('music', (m) => window.__musicLog.push(m));
    window.__bus.on('sfx', (n) => window.__sfxLog.push(n));
    document.querySelector('.element-intro')?.dispatchEvent(new Event('pointerdown'));
  });
  const walkout = await poll(page, () => window.__skk.walkoutActive === true, 10000, 'walkout active');
  ok(!!walkout, 'walkout show started');
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__bus.emit('cine:skip'));
  const stamped = await poll(page, () =>
    [...document.querySelectorAll('.stamp span')].some((s) => /GAME TIME/i.test(s.textContent)), 3000, 'GAME TIME stamp');
  ok(!!stamped, 'GAME TIME stamp shown at the break');
  const music = await poll(page, () => {
    const log = window.__musicLog;
    const stopI = log.findIndex((m) => m?.stop);
    const beatI = log.findIndex((m) => m?.name === 'beat');
    return stopI >= 0 && beatI > stopI;
  }, 4000, 'music stop -> beat');
  ok(!!music, 'music STOPS with the dance, in-match beat starts after the break');
  ok((await page.evaluate(() => window.__sfxLog.includes('scratch'))), 'record scratch closed the dance number');
  const live = await poll(page, () => !window.__skk.walkoutActive && window.__skk.phase === 'PITCH', 25000, 'first pitch after break');
  ok(!!live, 'game reached a live pitch after the break');
}

async function pronounScenario(page) {
  console.log('\n--- scenario 2: PRONOUNS ---');
  const ready = await poll(page, () => !!(window.__audio.announcer && window.__audio.annVoice), 8000, 'announcer pack');
  ok(!!ready, 'announcer manifest loaded');
  const res = await page.evaluate(() => {
    const a = window.__audio;
    a.__origPlay = a._playAnnouncer;
    const urls = [];
    a._playAnnouncer = (u) => urls.push(u);
    const file = (u) => u.split('/').pop();
    const out = { she: [], he: [], bare: [] };
    for (let i = 0; i < 24; i++) { urls.length = 0; a.vo({ event: 'safe', gender: 'she' }); out.she.push(file(urls[0] ?? '')); }
    for (let i = 0; i < 24; i++) { urls.length = 0; a.vo({ event: 'pegged', gender: 'he' }); out.he.push(file(urls[0] ?? '')); }
    for (let i = 0; i < 24; i++) { urls.length = 0; a.vo('pegged'); out.bare.push(file(urls[0] ?? '')); }
    a._playAnnouncer = a.__origPlay;
    const m = a.announcer;
    out.shePool = [...m.gendered.safe.she, ...m.events.safe];
    out.hePool = [...m.gendered.pegged.he, ...m.events.pegged];
    out.neutralPool = m.events.pegged;
    return out;
  });
  ok(res.she.every((f) => res.shePool.includes(f)), `she-call stays in the she+neutral pool (saw: ${[...new Set(res.she)].join(', ')})`);
  ok(res.she.some((f) => f.includes('_she_')), 'she lines actually get picked');
  ok(res.he.every((f) => res.hePool.includes(f)), 'he-call stays in the he+neutral pool');
  ok(res.bare.every((f) => res.neutralPool.includes(f)), `bare event stays neutral-only (saw: ${[...new Set(res.bare)].join(', ')})`);
}

async function queueScenario(page) {
  console.log('\n--- scenario 3: VO QUEUE ---');
  const res = await page.evaluate(async () => {
    const a = window.__audio;
    // Playwright's headless WebKit ships NO WebAudio (window.AudioContext is
    // undefined), so ensureCtx() gives up and _playAnnouncer returns before it
    // can claim the mic. Fake the graph it ducks through — everything under
    // test (vo -> _voEnqueue -> _playAnnouncer -> _voEnded) is above it.
    const orig = { ensureCtx: a.ensureCtx, playBuffer: a.playBuffer, ctx: a.ctx, gains: a.gains };
    const gain = { cancelScheduledValues() {}, linearRampToValueAtTime() {} };
    a.ctx = { currentTime: 0 };
    a.gains = { music: { gain } };
    a.ensureCtx = () => a.ctx;
    const until = async (fn, ms = 2000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 10)); }
      return false;
    };
    const played = [];
    let endFirst = null;
    let firstSrc = null;
    a.playBuffer = async (url) => {
      played.push(url.split('/').pop());
      const src = { onended: null, buffer: { duration: 30 } }; // long line — we end it by hand
      if (played.length === 1) { firstSrc = src; endFirst = () => src.onended?.(); }
      return { src, g: {} };
    };
    a.vo({ event: 'safe', gender: 'she' });          // line 1 takes the mic
    await until(() => a._voLive && !!firstSrc?.onended); // mic claimed AND end hook wired
    const liveAfterFirst = a._voLive;
    a.vo('fire');                                     // flavor mid-line -> dropped
    const heldAfterFlavor = !!a._voHeld;
    a.vo({ event: 'forced', gender: 'he' });          // play call mid-line -> held
    a.vo({ event: 'pegged', gender: 'she' });         // newer call takes the slot
    const heldAfterCalls = !!a._voHeld;
    await until(() => played.length > 1, 200);        // give an overlap its chance to happen
    const playedWhileLive = played.length;            // still just line 1
    endFirst?.();                                     // line 1 ends -> held line plays
    await until(() => played.length >= 2);
    const playedAfterEnd = played.length;
    Object.assign(a, orig);                           // real (silent) audio back
    a._voLive = false; a._voHeld = null;              // leave the booth clean
    return { liveAfterFirst, heldAfterFlavor, heldAfterCalls, playedWhileLive, playedAfterEnd, played };
  });
  ok(res.liveAfterFirst === true, 'first line takes the mic');
  ok(res.heldAfterFlavor === false, 'flavor line mid-call is DROPPED, not queued');
  ok(res.heldAfterCalls === true, 'play call mid-line is HELD');
  ok(res.playedWhileLive === 1, `no overlap while a line is live (played ${res.playedWhileLive})`);
  ok(res.playedAfterEnd === 2, `held call plays when the mic frees (played: ${res.played.join(', ')})`);
  ok(res.played[1]?.startsWith('pegged'), `newest call won the slot (${res.played[1]})`);
}

async function kickScenarios(page) {
  console.log('\n--- scenario 4: WHIFF swings ---');
  const pitch1 = await poll(page, () => window.__skk.phase === 'PITCH' && !window.__skk.kicked && Number.isFinite(window.__skk.pitchArrival), 20000, 'live pitch');
  ok(!!pitch1, 'pitch is live');
  const whiff = await page.evaluate(() => {
    const s = window.__skk;
    const strikesBefore = s.strikes;
    s.attemptKick({ aimDeg: 0, align: true }, s.pitchArrival - 5); // 5s early = hopeless
    return { anim: s.kicker.animator.name, strikesBefore, strikes: s.strikes };
  });
  ok(whiff.anim === 'kick', `whiff still swings the leg (anim: ${whiff.anim})`);
  ok(whiff.strikes === whiff.strikesBefore + 1, 'whiff judged a strike');

  console.log('\n--- scenario 5: CONTACT ---');
  const pitch2 = await poll(page, () => window.__skk.phase === 'PITCH' && !window.__skk.kicked && Number.isFinite(window.__skk.pitchArrival) && window.__skk.pitchArrival !== Infinity, 25000, 'next live pitch');
  ok(!!pitch2, 'next pitch is live');
  const contact = await page.evaluate(() => {
    const s = window.__skk;
    window.__sfxLog.length = 0;
    s.attemptKick({ aimDeg: 0, align: true }, s.pitchArrival); // dead-on tap
    return { phase: s.phase, stepX: s._kickApproach?.stepX, anim: s.kicker.animator.name };
  });
  ok(contact.phase === 'KICK_ANIM', `tap starts the swing beat (phase: ${contact.phase})`);
  ok(Number.isFinite(contact.stepX), `kicker step-in armed (stepX: ${contact.stepX?.toFixed?.(2)})`);
  const liveBall = await poll(page, () => window.__skk.phase === 'LIVE' || window.__skk.phase === 'RESOLVE' || window.__skk.hrFired, 6000, 'ball live after contact');
  ok(!!liveBall, 'launch fired at the contact frame');
  const sfx = await page.evaluate(() => window.__sfxLog.slice());
  ok(sfx.includes('swing'), `swing whoosh at clip start (sfx: ${sfx.join(',')})`);
  ok(sfx.includes('kick') || sfx.includes('crush'), 'kick thump at contact');
  // THE one the dev could not hear. 'kick'/'crush' both point at kick.mp3,
  // which peaks 23 dB under everything else in the alias table — it was emitted
  // and inaudible. 'strike' is the cue that carries the contact now, so a
  // contact WITHOUT it is the bug back, whatever else the log says.
  ok(sfx.includes('strike'), `THE STRIKE lands at contact (sfx: ${sfx.join(',')})`);
}

// The LOCKER move must SOUND bigger than the everyday kick before the ball is
// even struck: the special clip opens on the martial-arts whoosh, the lighter
// swish arrives 60% into the wind-up, and the contact still thumps.
async function specialSwingScenario(page) {
  console.log('\n--- scenario 6: SPECIAL SWING ---');
  const pitch = await poll(page, () => window.__skk.phase === 'PITCH' && !window.__skk.kicked
    && Number.isFinite(window.__skk.pitchArrival) && window.__skk.pitchArrival !== Infinity, 30000, 'live pitch');
  if (!ok(!!pitch, 'a live pitch to swing the crown at')) return;
  const armed = await page.evaluate(() => {
    const s = window.__skk;
    // MEIA LUA: the move the dev unlocked, and the clip whose release mark this
    // round re-cut from the plant (0.86) to the strike (0.606).
    s.crown.gear = { id: 'kick-meia', name: 'MEIA LUA', clip: 'kickMeia', mods: { powerMult: 1.35, curl: 1.5 } };
    s.crown.disarm(); s.special.value = 100; s.refreshHud();
    document.querySelector('.special-btn').dispatchEvent(new Event('pointerdown'));
    return { armed: s.crown.armed, hasClip: !!s.kicker.animator.hasClip('kickMeia') };
  });
  ok(armed.hasClip === true, 'the kickMeia clip is loaded on the kicker (extras pack x)');
  if (!ok(armed.armed === true, 'the crown arms with MEIA LUA equipped')) return;
  const fired = await poll(page, () => {
    const s = window.__skk;
    if (s.phase !== 'PITCH' || s.kicked || !Number.isFinite(s.pitchArrival)) return null;
    if (!(s.ball.pos.z > -3)) return null;    // the pitch is close — the flick is real
    s.kicker.group.position.x = s.ball.pos.x; // line him up so align never judges FOUL
    s._kickerPrevX = s.ball.pos.x;
    window.__sfxLog.length = 0;
    s.attemptKick({ align: true, flick: { risePx: 120, durMs: 140, driftPx: 0 } }, s.pitchArrival);
    return { phase: s.phase, atStart: window.__sfxLog.slice() };
  }, 25000, 'crown swing fired');
  ok(fired?.phase === 'KICK_ANIM', `the armed MEIA swing starts (phase ${fired?.phase})`);
  ok(!!fired?.atStart.includes('bigwhoosh'),
    `the special clip OPENS on the big leg whoosh (at clip start: ${fired?.atStart.join(',') || 'nothing'})`);
  ok(!fired?.atStart.includes('swing'), 'the everyday swish does not double up at clip start');
  // Wait on the PHASE leaving the swing beat, never on hrFired: that flag is
  // only reset inside onKickContact, so the previous scenario's home run leaves
  // it true and a poll that reads it returns before the swing has even started.
  const away = await poll(page, () => (window.__skk.phase !== 'KICK_ANIM' ? window.__skk.phase : null),
    25000, 'ball away');
  ok(!!away, `the crown swing launches the ball (phase ${away ?? 'stuck in KICK_ANIM'})`);
  await page.waitForTimeout(800);  // let the tail of the wind-up timer land
  const sfx2 = await page.evaluate(() => window.__sfxLog.slice());
  ok(sfx2.includes('strike'), `a CROWN kick thumps too (sfx: ${sfx2.join(',')})`);
  ok(sfx2.includes('swing'), 'the swish still lands, mid-wind-up');
  ok(sfx2.indexOf('bigwhoosh') >= 0 && sfx2.indexOf('bigwhoosh') < sfx2.indexOf('swing'),
    'whoosh opens the move, swish follows it');
}

async function pegPadScenario(page) {
  console.log('\n--- scenario 7: PEG pad truth ---');
  const staged = await page.evaluate(() => {
    const s = window.__skk;
    s.clearTimers();
    s.hud.hideRing?.();
    s.kicked = true;
    s.playFinalized = false;
    s.ballControlled = false;
    s.duel = null;
    // the previous scenario's kick left its kicker forced to 1st; a leftover
    // force means 'ready' (lit) is the correct pad truth, not gold
    s.runners = [];
    s.stealing = null;
    // The premise is YOU'RE IN THE FIELD — make that true of the whole scene,
    // not just assignDefense. While the player is still the kicking side,
    // updateRunners reads the staged runner as a human who stopped tapping and
    // commits him to a bag 0.7s after the defense secures the ball
    // (matchScene.js:1947-1958). THAT, not travel time, was killing the gold
    // state ~1.4s in — a race the 4s poll only won by sampling early.
    s.playerSide = s.match.fieldingSide();
    s.pred = { point: s.basePos(1).clone(), t: 1 };
    s.assignDefense({ playerControlled: true });
    const off = s.kickingChars();
    const char = off[(s.match.currentKickerIdx() + 5) % off.length];
    char.group.visible = true;
    const r = s.makeRunner(5, char, 0); // 1st -> 2nd, NON-forced: no force out anywhere
    r.forced = false;
    r.sim.progressM = s.tuning.running.basePathM * 0.4;
    // PIN him in the rundown for the gold check. An AI runner is driven at
    // r.aiRate every frame no matter who holds the ball, and mashSpeed(0) still
    // returns baseSpeedMs — zeroing the rate would NOT stop him; he'd reach the
    // bag in ~1.5s and flip himself to 'held'. A dead-stop sim isn't safe either
    // (6s of no progress trips the stall watchdog, runnerWatchdog.js:25). So
    // shuttle him between 25% and 45% of the path: never arrives, never stalls,
    // stays 'running' and peggable indefinitely. The release step drops it.
    const path = s.tuning.running.basePathM;
    let dir = 1;
    r.sim.tick = (dt) => {
      r.sim.progressM += dir * 6 * dt;
      if (r.sim.progressM > path * 0.45) dir = -1;
      else if (r.sim.progressM < path * 0.25) dir = 1;
    };
    s.runners.push(r);
    s.phase = 'LIVE';
    s.liveStart = s.elapsed;
    const f = s.fieldingChars()[3];
    s.activeFielder = f;
    s.possessBall(f);
    return !!(s.activeFielder?.hasBall);
  });
  ok(staged, 'defense holds the ball with a live non-forced runner');
  const gold = await poll(page, () => document.querySelector('.t-peg.best') && !document.querySelector('.throw-pad button[data-base].best'), 4000, 'gold PEG');
  ok(!!gold, 'no force on -> PEG pulses gold as THE play');
  // release the pin, then settle him on the bag — PEG must go dead with no live target
  await page.evaluate(() => {
    for (const r of window.__skk.runners) { delete r.sim.tick; r.state = 'held'; }
  });
  const dim = await poll(page, () => !document.querySelector('.t-peg.best') && !document.querySelector('.t-peg.ready'), 4000, 'PEG dims');
  ok(!!dim, 'runner settles -> PEG goes dim/dead');
}

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
// belt-and-braces on top of ?mute: nothing this browser plays can make noise,
// even a media element some future code path forgets to mute. The CENSUS this
// keeps is what makes the SILENT assertion mean anything: querySelectorAll only
// sees ATTACHED media, and the field's backdrop <video> (field.js) is never
// appended to the document — a detached element plays sound just fine. So every
// video/audio the page ever creates is recorded, and any that reaches play()
// un-muted BY THE APP is logged before this net forces it quiet.
await page.addInitScript(() => {
  window.__mediaEls = [];   // every media element ever created, attached or not
  window.__loudPlays = [];  // ...that hit play() while the app had it un-muted
  const ce = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...rest) {
    const el = ce.call(this, tag, ...rest);
    if (/^(video|audio)$/i.test(String(tag))) window.__mediaEls.push(el);
    return el;
  };
  const m = HTMLMediaElement.prototype;
  const p = m.play;
  m.play = function () {
    if (!window.__mediaEls.includes(this)) window.__mediaEls.push(this); // new Audio()
    if (!this.muted) window.__loudPlays.push((this.currentSrc || this.src || '?').split('/').pop());
    this.muted = true;
    return p.call(this);
  };
});
page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); failures += 1; });
try {
  await breakScenario(page);
  await pronounScenario(page);
  await queueScenario(page);
  await kickScenarios(page);
  await specialSwingScenario(page);
  await pegPadScenario(page);
} catch (e) {
  console.error('PROBE CRASH:', e.message);
  failures += 1;
}
await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL GREEN');
process.exit(failures ? 1 : 0);

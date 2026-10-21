// A REAL story match, left running with taps (silent: ?mute). Not a bot that plays
// well — a smoke that the story game loads, runs with stats + skills on, and
// survives a minute and a half of play without a page error.
// Run: node scripts/story-soak.mjs   (dev server up; SKK_URL overrides :5173)
import { webkit } from 'playwright';

const BASE = process.env.SKK_URL ?? 'http://localhost:5173';
const url = (q) => `${BASE}/?${q}&mute`;
let failures = 0;
const check = (ok, label, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`); if (!ok) failures++; };

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url('nosplash&storydev'));
await page.evaluate(() => localStorage.setItem('skk-save-v1', JSON.stringify({ tutorialPlayed: true })));
await page.goto(url('nosplash&storydev&go=menu'));
await page.waitForFunction(() => window.__story, null, { timeout: 15000 });
// a crew halfway up the climb (South, rung 3) with a few skills, on KING
await page.evaluate(async () => {
  const { makeBlockRoster } = await import('/src/meta/yourCrew.js');
  const S = window.__story;
  const r = makeBlockRoster(9);
  r[0].stats = { power: 9, speed: 6, arm: 5, glove: 5 };
  r[1].stats = { power: 5, speed: 9, arm: 5, glove: 8 };
  const st = { ...S.ctx.story.newStory({ crew: { name: 'SOAK CREW', primary: '#e63322', secondary: '#111114', mark: 'mark-02' }, roster: r }),
    region: 2, rung: 2, difficulty: 'king', seen: ['prologue', 'east-open', 'midwest-open', 'south-open'] };
  S.ctx.story.saveStory(S.save, st);
});
await page.goto(url('nosplash&storydev&go=storyHub'));
await page.waitForSelector('.sh-play', { timeout: 15000 });
await page.click('.sh-play', { force: true });
let live = false;
for (let i = 0; i < 400 && !live; i++) {
  if (await page.$('.pause-btn[style*="flex"]')) { live = true; break; }
  const skip = await page.$('.story-scene:not(.ended) .ss-skip');
  if (skip) await skip.click().catch(() => {});
  else if (await page.$('.story-scene.ended')) await page.mouse.click(195, 420);
  else if (await page.$('.skip-hint')) await page.mouse.click(195, 420);
  else if (await page.$('[data-call="heads"]')) await page.click('[data-call="heads"]').catch(() => {});
  else if (await page.$('[data-first]')) await page.click('[data-first]').catch(() => {});
  await page.waitForTimeout(150);
}
check(live, 'the story match goes live');
const facts = await page.evaluate(() => ({ useStats: window.__skk?.useStats, diff: window.__skk?.difficulty, rival: window.__skk?.teams?.home?.name }));
check(facts.useStats === true, 'stats + skills are on', JSON.stringify(facts));
check(facts.diff === 'King', 'KING difficulty sharpened the AI tier', facts.diff);
const s0 = await page.evaluate(() => JSON.stringify(window.__skk?.match?.state ?? {}));
for (let t = 0; t < 75; t++) {
  await page.mouse.click(120 + (t % 3) * 75, 560 + (t % 2) * 120);
  await page.waitForTimeout(1000);
  if (await page.$('.postgame-screen')) break;
}
// taps don't kick (that's a swipe), so a waiting at-bat may not change state — the
// proof here is that the match is still alive and rendering after ~75 s
const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
check(fps >= 10 && !!(await page.evaluate(() => window.__skk?.match)), 'the match is alive and rendering after ~75 s', `${fps} frames/s, state ${s0 === (await page.evaluate(() => JSON.stringify(window.__skk?.match?.state ?? {}))) ? 'waiting on you' : 'moved'}`);
check(errors.length === 0, 'no page errors in ~75 s of play', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
